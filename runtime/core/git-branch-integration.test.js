#!/usr/bin/env node

/* Governed Git Branch Integration — behavioural test on REAL git fixture repositories.
 *
 * Exercises the governed contract end-to-end through ACTUAL git plumbing (not mocks): dry-run default,
 * fast-forward on a checked-out and a non-checked-out target, already-up-to-date, non-fast-forward,
 * dirty worktree, protected branch (with and without authority / HUMAN_APPROVAL_REQUIRED), push
 * absence, EXPECTED-vs-OBSERVED divergence handling, the embedded C03 record, and the full path through
 * the real capability-executor registry + capability probe. Runs in throwaway repos; contacts nothing. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const ENGINE = path.resolve(__dirname, "git-branch-integration.js");
const engine = require(ENGINE);

// Deterministic git with an isolated identity (no dependency on global git config / signing).
function g(cwd, args) {
  const res = spawnSync("git", ["-c", "user.email=t@odg.test", "-c", "user.name=ODG Test", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  if (res.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`);
  return String(res.stdout || "").trim();
}
function commit(cwd, file, content, msg) {
  fs.writeFileSync(path.join(cwd, file), content);
  g(cwd, ["add", file]);
  g(cwd, ["commit", "-m", msg]);
  return g(cwd, ["rev-parse", "HEAD"]);
}

// Standard topology: trunk@A ; feature@A->B->C (ahead by 2) ; dev@A ; main@A (protected) ; other@A->D
// (diverged from feature). Checked out: feature, clean worktree.
function freshRepo() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "gbi-test-"));
  g(cwd, ["init", "-q", "-b", "trunk"]);
  commit(cwd, "a.txt", "A", "A");
  g(cwd, ["branch", "feature"]);
  g(cwd, ["branch", "dev"]);
  g(cwd, ["branch", "main"]);
  g(cwd, ["checkout", "-q", "-b", "other"]);
  commit(cwd, "d.txt", "D", "D");
  g(cwd, ["checkout", "-q", "feature"]);
  commit(cwd, "b.txt", "B", "B");
  commit(cwd, "c.txt", "C", "C");
  return cwd;
}
const sha = (cwd, ref) => g(cwd, ["rev-parse", ref]);

// ---- 1. DRY-RUN is the hard default: zero mutation, predicts INTEGRATED. ----------------------
(function dryRunDefault() {
  const cwd = freshRepo();
  const before = sha(cwd, "trunk");
  const ev = engine.run({ target: "trunk", source: "feature" }, { cwd }); // execute omitted
  ok("dry-run outcome is DRY_RUN", ev.outcome === "DRY_RUN" && ev.mode === "DRY_RUN");
  ok("dry-run predicts INTEGRATED (fast-forwardable)", ev.predicted_outcome === "INTEGRATED" && ev.fast_forwardable === true);
  ok("dry-run reports 2 commits ahead", ev.commits_ahead === 2);
  ok("dry-run did NOT move trunk", sha(cwd, "trunk") === before);
  ok("dry-run never pushes / contacts remote", ev.pushed === false && ev.remote_contacted === false);
  ok("dry-run has no C03 transition (a plan is not a transition)", ev.state_transition === null);
})();

// ---- 2. LIVE fast-forward on the CHECKED-OUT target (merge --ff-only). -------------------------
(function ffCheckedOut() {
  const cwd = freshRepo();
  g(cwd, ["checkout", "-q", "trunk"]);
  const featureTip = sha(cwd, "feature");
  const ev = engine.run({ target: "trunk", source: "feature", execute: true }, { cwd });
  ok("ff(checked-out) INTEGRATED", ev.outcome === "INTEGRATED" && ev.integrated === true);
  ok("ff(checked-out) advanced trunk to feature tip", sha(cwd, "trunk") === featureTip);
  ok("ff(checked-out) worktree stayed clean", g(cwd, ["status", "--porcelain"]) === "");
  ok("ff(checked-out) created NO merge commit", ev.state_transition.observed_effect.merge_commit === false);
  ok("ff(checked-out) advanced by 2 commits", ev.state_transition.observed_effect.commits_advanced === 2);
  ok("ff(checked-out) EXPECTED == OBSERVED", ev.expected_effect.target_tip === ev.observed_effect.to);
  ok("ff(checked-out) C03 status VERIFIED", ev.verification_status === "VERIFIED");
})();

// ---- 3. LIVE fast-forward on a NON-checked-out target (update-ref CAS). ------------------------
(function ffNonCheckedOut() {
  const cwd = freshRepo(); // checked out: feature ; target dev is NOT checked out
  const featureTip = sha(cwd, "feature");
  const ev = engine.run({ target: "dev", source: "feature", execute: true }, { cwd });
  ok("ff(non-checked-out) INTEGRATED", ev.outcome === "INTEGRATED" && ev.integrated === true);
  ok("ff(non-checked-out) advanced dev to feature tip", sha(cwd, "dev") === featureTip);
  ok("ff(non-checked-out) left HEAD on feature", g(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) === "feature");
  ok("ff(non-checked-out) worktree clean", g(cwd, ["status", "--porcelain"]) === "");
})();

// ---- 4. ALREADY_UP_TO_DATE: target already contains source (no-op success). --------------------
(function alreadyUpToDate() {
  const cwd = freshRepo();
  g(cwd, ["checkout", "-q", "trunk"]);
  const ev = engine.run({ target: "trunk", source: "trunk", execute: true }, { cwd });
  ok("already-up-to-date outcome", ev.outcome === "ALREADY_UP_TO_DATE" && ev.integrated === false);
  ok("already-up-to-date does NOT satisfy a real integration proof", ev.state_transition === null);
})();

// ---- 5. NON-FAST-FORWARD is rejected (fail-closed, throws on live). ----------------------------
(function nonFastForward() {
  const cwd = freshRepo(); // other@A->D diverges from feature@A->B->C ; checked out: feature
  const otherBefore = sha(cwd, "other");
  let threw = null;
  try { engine.run({ target: "other", source: "feature", execute: true }, { cwd }); }
  catch (e) { threw = e; }
  ok("non-ff live throws GovernedGitError BLOCKED", threw && threw.outcome === "BLOCKED" && /non-fast-forward/.test(threw.reason));
  ok("non-ff did NOT move the target", sha(cwd, "other") === otherBefore);
  // Dry-run on the same divergence predicts BLOCKED without throwing.
  const dry = engine.run({ target: "other", source: "feature" }, { cwd });
  ok("non-ff dry-run predicts BLOCKED", dry.predicted_outcome === "BLOCKED" && dry.fast_forwardable === false);
})();

// ---- 6. DIRTY worktree is rejected (stale/conflicted/dirty). -----------------------------------
(function dirtyWorktree() {
  const cwd = freshRepo();
  g(cwd, ["checkout", "-q", "trunk"]);
  fs.writeFileSync(path.join(cwd, "a.txt", ), "A-DIRTY"); // uncommitted change to a tracked file
  let threw = null;
  try { engine.run({ target: "trunk", source: "feature", execute: true }, { cwd }); }
  catch (e) { threw = e; }
  ok("dirty worktree live throws BLOCKED", threw && threw.outcome === "BLOCKED" && /worktree not clean/.test(threw.reason));
})();

// ---- 7. PROTECTED branch without authority -> HUMAN_APPROVAL_REQUIRED (no mutation). -----------
(function protectedNoAuthority() {
  const cwd = freshRepo();
  const mainBefore = sha(cwd, "main");
  let threw = null;
  try { engine.run({ target: "main", source: "feature", execute: true }, { cwd }); }
  catch (e) { threw = e; }
  ok("protected target w/o authority -> HUMAN_APPROVAL_REQUIRED", threw && threw.outcome === "HUMAN_APPROVAL_REQUIRED");
  ok("protected refusal did NOT move main", sha(cwd, "main") === mainBefore);
  ok("protected refusal carries honest evidence", threw.evidence && threw.evidence.outcome === "HUMAN_APPROVAL_REQUIRED" && threw.evidence.integrated === false);
})();

// ---- 8. PROTECTED branch WITH explicit authority -> integrates. --------------------------------
(function protectedWithAuthority() {
  const cwd = freshRepo();
  g(cwd, ["checkout", "-q", "main"]);
  const featureTip = sha(cwd, "feature");
  const ev = engine.run({ target: "main", source: "feature", execute: true, authorization: { allow_protected: true } }, { cwd });
  ok("protected + authority INTEGRATED", ev.outcome === "INTEGRATED" && sha(cwd, "main") === featureTip);
  ok("protected + authority records authority grant", ev.authorized === true && ev.protectedTarget === true);
})();

// ---- 9. PUSH ABSENCE: the git wrapper REFUSES a push argument (local-only is a property). -------
(function pushAbsence() {
  const cwd = freshRepo();
  const git = engine.makeGit(cwd);
  let threw = null;
  try { git(["push", "origin", "feature"]); } catch (e) { threw = e; }
  ok("git wrapper refuses push", threw && threw.outcome === "BLOCKED" && /push is forbidden/.test(threw.reason));
  // And a successful integration's evidence asserts no remote contact.
  g(cwd, ["checkout", "-q", "trunk"]);
  const ev = engine.run({ target: "trunk", source: "feature", execute: true }, { cwd });
  ok("integration evidence asserts pushed=false, network=false", ev.pushed === false && ev.network === false && ev.remote_contacted === false);
})();

// ---- 10. EXPECTED-vs-OBSERVED divergence handling: a post-action mismatch fails closed. --------
(function divergenceHandling() {
  const cwd = freshRepo();
  g(cwd, ["checkout", "-q", "trunk"]);
  const realGit = engine.makeGit(cwd);
  const featureTip = sha(cwd, "feature");
  // Inject a git runner that lets everything through BUT reports a WRONG observed tip after the merge,
  // simulating a reality that diverges from the expected effect. The engine must detect and reject it.
  let merged = false;
  const lyingGit = (args, opts) => {
    if (args[0] === "merge") { merged = true; return realGit(args, opts); }
    // After the merge, lie about where trunk points so observed != expected.
    if (merged && args[0] === "rev-parse" && args.includes("refs/heads/trunk^{commit}")) {
      return { status: 0, stdout: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", stderr: "" };
    }
    return realGit(args, opts);
  };
  let threw = null;
  try { engine.run({ target: "trunk", source: "feature", execute: true }, { cwd, git: lyingGit }); }
  catch (e) { threw = e; }
  ok("divergence (observed != expected) is detected and rejected", threw && threw.outcome === "BLOCKED" && /divergence/.test(threw.reason));
  ok("divergence evidence marks verification REJECTED", threw.evidence && threw.evidence.verification_status === "REJECTED");
  ok("divergence evidence records expected vs observed", threw.evidence.expected_effect.target_tip === featureTip && threw.evidence.observed_effect.target_tip === "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");
})();

// ---- 11. Missing target / source refs are rejected. --------------------------------------------
(function missingRefs() {
  const cwd = freshRepo();
  const dry1 = engine.run({ target: "nope", source: "feature" }, { cwd });
  ok("missing target predicts BLOCKED", dry1.predicted_outcome === "BLOCKED" && /does not exist/.test(dry1.predicted_reason));
  const dry2 = engine.run({ target: "trunk", source: "no-such-ref" }, { cwd });
  ok("missing source predicts BLOCKED", dry2.predicted_outcome === "BLOCKED" && /does not resolve/.test(dry2.predicted_reason));
})();

// ---- 12. Full path through the REAL capability-executor registry + capability PROBE. -----------
(function throughRegistryAndProbe() {
  const cwd = freshRepo();
  g(cwd, ["checkout", "-q", "trunk"]);
  const featureTip = sha(cwd, "feature");
  // The executor + probe resolve runtime/generated/ relative to process.cwd(); run inside the fixture.
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    delete require.cache[require.resolve("./capability-executors")];
    delete require.cache[require.resolve("./capability-probes")];
    const capExec = require("./capability-executors");
    const capProbes = require("./capability-probes");

    // Only the GIT_BRANCH_INTEGRATION_* objective resolves to this capability; a foreign id does not.
    ok("registry does not hijack a foreign objective", capExec.resolve({ objectiveId: "SOMETHING_ELSE" }) === null);

    const patch = {
      objectiveId: "GIT_BRANCH_INTEGRATION_1",
      git_branch_integration: { target: "trunk", source: "feature", execute: true },
    };
    const executor = capExec.resolve(patch);
    ok("registry routes GIT_BRANCH_INTEGRATION_* to the capability", executor && executor.capability === "Governed Git Branch Integration");
    const result = executor.run();
    ok("executor reports EXECUTED-shaped evidence path", typeof result.evidence === "string" && fs.existsSync(result.evidence));
    ok("executor actually integrated trunk", sha(cwd, "trunk") === featureTip);

    // The probe turns the evidence into a machine-verified proof; dry-run/no-op would NOT pass it.
    const verdict = capProbes.runProbe("git-branch-integrated", {});
    ok("probe git-branch-integrated PASSES on a real integration", verdict.ok === true);
    const evalRes = capProbes.evaluate([{ capability: "git", evidence: "git-branch-integrated" }], {});
    ok("probe gates via evaluate()", evalRes.ok === true && evalRes.results[0].ok === true);

    // The embedded C03 record is independently valid and VERIFIED.
    const ev = JSON.parse(fs.readFileSync(result.evidence, "utf8"));
    const st = require("./state-transition").validateStateTransition(ev.state_transition);
    ok("evidence embeds a VALID C03 transition with a real evidence_ref", st.ok === true && ev.state_transition.evidence_refs[0] === result.evidence);
  } finally {
    process.chdir(prev);
  }
})();

// ---- 13. The probe FAILS on a dry-run (a plan is not an integration). --------------------------
(function probeRejectsDryRun() {
  const cwd = freshRepo();
  const prev = process.cwd();
  process.chdir(cwd);
  try {
    delete require.cache[require.resolve("./capability-executors")];
    delete require.cache[require.resolve("./capability-probes")];
    const capExec = require("./capability-executors");
    const capProbes = require("./capability-probes");
    capExec.resolve({ objectiveId: "GIT_BRANCH_INTEGRATION_1", git_branch_integration: { target: "trunk", source: "feature" } }).run(); // dry-run
    const evalRes = capProbes.evaluate([{ capability: "git", evidence: "git-branch-integrated" }], {});
    ok("probe FAILS on a dry-run (no real integration)", evalRes.ok === false);
  } finally {
    process.chdir(prev);
  }
})();

console.log(`\nGOVERNED GIT BRANCH INTEGRATION — ${passed} assertions passed.`);
