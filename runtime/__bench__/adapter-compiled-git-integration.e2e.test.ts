// @ts-nocheck
/*
 * LOT B-δ — LEGACY vs COMPILED ENTRY PARITY on GOVERNED GIT BRANCH INTEGRATION (ff + non-ff) (Phase-03).
 * =====================================================================================================
 *
 * Extends entry-parity (B-α READ_ONLY, B-β ODG WRITE, B-γ CONTRACT patch) to the LOCAL git-branch-integration
 * dimension whose legacy behaviour is accepted by runtime/__bench__/autonomy-qualification.e2e.test.js (a
 * PROTECTED fixture, NOT modified). It reuses that fixture's contract + sandbox topology VERBATIM and the SAME
 * offline mechanism, and compares the two pipeline ENTRIES:
 *   - LEGACY   : runtime/bin/odg-run.js         (historical JavaScript entry; production default)
 *   - COMPILED : runtime/dist/bin/odg-run.js    (TypeScript entry compiled by `npm run build:runtime`)
 *
 * METHOD (deliberate, documented — identical rationale to B-β/B-γ). Both entries are launched DIRECTLY with
 * `node <entry> <mission>` from a throwaway git repo (spawnSync, FLEET_BRIDGE_MOCK=1, ODG_FLEET cleared) — the
 * accepted fixture's mechanism. It is NOT routed through AutonomyRuntimeAdapter.runPipeline: on the non-ff
 * REFUSAL the adapter's post-local-failure recovery could escalate to the engineering PROVIDER path, which
 * this mission FORBIDS. The adapter's honouring of the ODG_RUNTIME_ENTRY seam is proven separately (B-α); here
 * the two ENTRY BINARIES are compared on the SAME 13 JS stages + the SAME JS git-integration capability.
 *
 * WHAT IT PROVES (semantic parity — §5, NOT just exit codes):
 *   POSITIVE (ff) : both entries ⇒ 13/13; the target branch `stable` REALLY fast-forwards to the `work` tip
 *     (verified from git, per repo); EXECUTED by "Governed Git Branch Integration"; authoredBy ODG_CAPABILITY
 *     / appliedBy ODG_EXECUTOR; evidence outcome INTEGRATED / integrated:true; validated SUCCESS; lifecycle in
 *     {VERIFIED,RELEASED,ARCHIVED}; report shows proven 1/1; independent recompute 1/1 = 100%; no UNKNOWN/
 *     CONTRACT credited — and the two engine-independent parity views are EQUAL.
 *   NEGATIVE (non-ff) : both entries ⇒ `stable` UNCHANGED (zero mutation, verified from git); the objective is
 *     recorded FAILED (never EXECUTED); not a validated mission — and the two refusal views are EQUAL.
 *   NEGATIVE (invalid entry) : a missing compiled entry fails EXPLICITLY (non-zero node); `stable` unchanged;
 *     no validation — no silent fallback to the legacy entry.
 *
 * NO masking of divergences. Raw commit SHAs legitimately differ between the two INDEPENDENT repos, so the
 * cross-engine equality compares RELATIONAL git facts (did stable fast-forward to work? did stable move?),
 * not raw hashes; the raw per-repo git state is asserted per engine and reported. Distinct mission ids /
 * distinct repos per scenario+engine avoid collisions and double-written evidence (§4).
 *
 * ISOLATION (§4): every run is confined to its OWN os.tmpdir() throwaway git repo (asserted OUTSIDE the repo),
 * NO node_modules (asserted), tsx unresolvable (asserted for the compiled bare-node proof), offline (no
 * network/remote/push — the capability is local-only). Every git command targets a sandbox cwd; the real
 * repository's git is NEVER invoked.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/adapter-compiled-git-integration.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

const LEGACY = "runtime/bin/odg-run.js";
const COMPILED = "runtime/dist/bin/odg-run.js";
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes: string[] = [];
let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
/** git in a SANDBOX cwd ONLY (never the real repo). */
function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function npmBuild(): string {
  return execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** The accepted qualification contract (autonomy-qualification.e2e.test.js), parametrised ONLY by mission id. */
function contract(mission: string, execute: boolean) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [{
      id: "GIT_BRANCH_INTEGRATION_1",
      goal: "Integrate the local source branch into the local target branch, fast-forward only, recorded C03.",
      done_when: ["The target branch tip equals the source tip via a local fast-forward."],
      authorization: { eligible: true, authorized: true },
      git_branch_integration: { target: "stable", source: "work", execute },
    }],
    verify: [{ capability: "Governed Git Branch Integration", evidence: "git-branch-integrated" }],
    definition_of_done: ["Local fast-forward integration performed and recorded."],
  };
}

/** Throwaway repo: stable(target)@baseline, work(source)=baseline+1 commit; diverge ⇒ non-ff topology. */
function buildSandbox(c: any, diverge: boolean): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-gitint-par-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${c.mission}.json`), JSON.stringify(c, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  const base = git(sb, ["rev-parse", "HEAD"]);
  git(sb, ["branch", "stable", base]);
  git(sb, ["branch", "work", base]);
  git(sb, ["checkout", "-q", "work"]);
  fs.writeFileSync(path.join(sb, "work-change.txt"), "work-1\n");
  git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "work commit 1"]);
  if (diverge) {
    git(sb, ["checkout", "-q", "stable"]);
    fs.writeFileSync(path.join(sb, "stable-change.txt"), "stable-1\n");
    git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "stable commit 1"]);
  }
  git(sb, ["checkout", "-q", base]);
  return sb;
}

function runEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE; delete env.ODG_RUNTIME_ENTRY;
  return env;
}
function runEntry(sb: string, entry: string, mission: string): { code: number | null; out: string } {
  const r = spawnSync("node", [entry, mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const readGen = (sb: string, n: string): any => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));
const genExists = (sb: string, n: string): boolean => fs.existsSync(path.join(sb, "runtime", "generated", n));

/** POSITIVE snapshot: engine-independent parity view (no raw SHAs) + raw git facts kept separately for report. */
function positiveSnapshot(sb: string, mission: string, workTip: string, stableBefore: string): any {
  const report = readGen(sb, "mission-report.json");
  const life = readGen(sb, "mission-lifecycle.json");
  const exec = readGen(sb, "patch-execution.json");
  const cp = readGen(sb, "pipeline-checkpoint.json");
  const ledger = readGen(sb, "mission-ledger.json");
  const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const e = exec.executed.find((x: any) => x.objectiveId === "GIT_BRANCH_INTEGRATION_1") || {};
  const evAbs = typeof e.evidence === "string" ? path.join(sb, e.evidence) : "";
  const evidenceNonEmpty = !!evAbs && fs.existsSync(evAbs) && fs.statSync(evAbs).size > 0;
  const ev = evidenceNonEmpty ? JSON.parse(fs.readFileSync(evAbs, "utf8")) : {};
  const md = fs.readFileSync(path.join(sb, "runtime", "generated", "reports", `${mission}.final-report.md`), "utf8");
  const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
  const stableAfter = git(sb, ["rev-parse", "stable"]);
  return {
    raw: { workTip, stableBefore, stableAfter },
    parity: {
      validated: report.validated, status: report.status, achieved: life.achieved,
      exec: { status: e.status, capability: e.capability, authoredBy: e.authoredBy, appliedBy: e.appliedBy, evidenceNonEmpty, evidenceOutcome: ev.outcome, evidenceIntegrated: ev.integrated },
      eligibilityComplete: complete, measurable: measured.measurable, numerator: measured.numerator, denominator: measured.denominator, autonomyPercent: measured.autonomyPercent,
      reportShows1of1: /ODG-executed\+verified 1\/1, denominator proven/.test(md),
      anyUnknownOrContract: exec.executed.some((x: any) => x.authoredBy === "UNKNOWN" || x.authoredBy === "CONTRACT"),
      cpStatus: cp.status, cpAllDone: cp.completed.length === cp.stages.length,
      ledgerProven: entries.filter((x: any) => x.proven === true).length,
      ffHappened: stableAfter === workTip,            // relational (engine-independent)
      stableMoved: stableAfter !== stableBefore,
    },
  };
}

/** NEGATIVE (non-ff) snapshot: engine-independent refusal view + raw git facts. */
function refusalSnapshot(sb: string, stableBefore: string): any {
  const stableAfter = git(sb, ["rev-parse", "stable"]);
  const exec = genExists(sb, "patch-execution.json") ? readGen(sb, "patch-execution.json") : null;
  // The FAILED refusal entry is keyed by `action` (not `objectiveId`, which only APPLIED/EXECUTED entries carry).
  const e = exec ? exec.executed.find((x: any) => x && (x.objectiveId === "GIT_BRANCH_INTEGRATION_1" || x.action === "GIT_BRANCH_INTEGRATION_1")) : null;
  const report = genExists(sb, "mission-report.json") ? readGen(sb, "mission-report.json") : null;
  return {
    raw: { stableBefore, stableAfter },
    parity: {
      stableUnchanged: stableAfter === stableBefore,  // relational (engine-independent)
      execStatus: e ? e.status : "(no-record)",
      execNotExecuted: !e || e.status !== "EXECUTED",
      errorIsNonFF: /non-fast-forward/.test(String((e && e.error) || "")),
      reportValidatedNotTrue: !report || report.validated !== true,
      reportStatus: report ? report.status : null,
    },
  };
}

console.log("LOT B-δ — LEGACY vs COMPILED ENTRY PARITY on GOVERNED GIT BRANCH INTEGRATION (ff + non-ff)");
try {
  npmBuild();
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "bin", "odg-run.js")), "prerequisite: runtime/dist/bin/odg-run.js built");

  // ======== POSITIVE (fast-forward) — both entries ===============================================
  const sbPL = buildSandbox(contract("GITINT_PAR_FF_LEGACY", true), false);
  const sbPC = buildSandbox(contract("GITINT_PAR_FF_COMPILED", true), false);
  check(fs.existsSync(path.join(sbPC, "node_modules")) === false, "compiled sandbox has NO node_modules");
  const tsxProbe = spawnSync("node", ["-e", "require.resolve('tsx/cjs')"], { cwd: sbPC, encoding: "utf8" });
  check(tsxProbe.status !== 0, "tsx/cjs unresolvable in the bare compiled sandbox (plain-node proof)");

  const workTipL = git(sbPL, ["rev-parse", "work"]); const stBeforeL = git(sbPL, ["rev-parse", "stable"]);
  const workTipC = git(sbPC, ["rev-parse", "work"]); const stBeforeC = git(sbPC, ["rev-parse", "stable"]);
  check(stBeforeL !== workTipL && stBeforeC !== workTipC, "precondition (both): stable behind work (fast-forwardable)");

  const rPL = runEntry(sbPL, LEGACY, "GITINT_PAR_FF_LEGACY");
  check(rPL.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(rPL.out), "LEGACY ff: exit 0, 13/13 stages");
  const rPC = runEntry(sbPC, COMPILED, "GITINT_PAR_FF_COMPILED");
  check(rPC.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(rPC.out), "COMPILED ff: exit 0, 13/13 stages");

  const snapL = positiveSnapshot(sbPL, "GITINT_PAR_FF_LEGACY", workTipL, stBeforeL);
  const snapC = positiveSnapshot(sbPC, "GITINT_PAR_FF_COMPILED", workTipC, stBeforeC);

  for (const [tag, s] of [["LEGACY", snapL], ["COMPILED", snapC]] as const) {
    check(s.raw.stableAfter === s.raw.workTip, `${tag} ff: stable fast-forwarded to work tip (independent git proof)`);
    check(s.parity.exec.status === "EXECUTED" && s.parity.exec.capability === "Governed Git Branch Integration", `${tag} ff: EXECUTED by Governed Git Branch Integration`);
    check(s.parity.exec.authoredBy === "ODG_CAPABILITY" && s.parity.exec.appliedBy === "ODG_EXECUTOR", `${tag} ff: authoredBy ODG_CAPABILITY / appliedBy ODG_EXECUTOR`);
    check(s.parity.exec.evidenceNonEmpty === true && s.parity.exec.evidenceOutcome === "INTEGRATED" && s.parity.exec.evidenceIntegrated === true, `${tag} ff: evidence INTEGRATED / integrated:true`);
    check(s.parity.validated === true && s.parity.status === "SUCCESS", `${tag} ff: validated SUCCESS`);
    check(["VERIFIED", "RELEASED", "ARCHIVED"].includes(s.parity.achieved), `${tag} ff: lifecycle accepted terminal (${s.parity.achieved})`);
    check(s.parity.reportShows1of1 === true && s.parity.eligibilityComplete === true && s.parity.measurable === true && s.parity.numerator === 1 && s.parity.denominator === 1 && s.parity.autonomyPercent === 100, `${tag} ff: proven 1/1 (report + independent recompute)`);
    check(s.parity.anyUnknownOrContract === false, `${tag} ff: no UNKNOWN/CONTRACT origin credited`);
  }
  check(JSON.stringify(snapL.parity) === JSON.stringify(snapC.parity), "PARITY(ff): engine-independent semantic views identical");

  // ======== NEGATIVE (non-fast-forward) — both entries ============================================
  const sbNL = buildSandbox(contract("GITINT_PAR_NONFF_LEGACY", true), true);
  const sbNC = buildSandbox(contract("GITINT_PAR_NONFF_COMPILED", true), true);
  const nStBeforeL = git(sbNL, ["rev-parse", "stable"]);
  const nStBeforeC = git(sbNC, ["rev-parse", "stable"]);
  runEntry(sbNL, LEGACY, "GITINT_PAR_NONFF_LEGACY");
  runEntry(sbNC, COMPILED, "GITINT_PAR_NONFF_COMPILED");
  const refL = refusalSnapshot(sbNL, nStBeforeL);
  const refC = refusalSnapshot(sbNC, nStBeforeC);
  for (const [tag, r] of [["LEGACY", refL], ["COMPILED", refC]] as const) {
    check(r.parity.stableUnchanged === true, `${tag} non-ff: stable UNCHANGED (zero mutation, independent git proof)`);
    check(r.parity.execStatus === "FAILED" && r.parity.errorIsNonFF === true, `${tag} non-ff: objective recorded FAILED with a non-fast-forward reason (fail-closed)`);
    check(r.parity.reportValidatedNotTrue === true && r.parity.reportStatus === "BLOCKED", `${tag} non-ff: mission NOT validated (status BLOCKED)`);
  }
  check(JSON.stringify(refL.parity) === JSON.stringify(refC.parity), "PARITY(non-ff): engine-independent refusal views identical");

  // ======== NEGATIVE (invalid compiled entry) — NO silent legacy fallback =========================
  const sbBad = buildSandbox(contract("GITINT_PAR_BADENTRY", true), false);
  const badStBefore = git(sbBad, ["rev-parse", "stable"]);
  const rBad = runEntry(sbBad, "runtime/dist/bin/DOES_NOT_EXIST.js", "GITINT_PAR_BADENTRY");
  check(rBad.code !== 0, "invalid entry: node exits non-zero (explicit launch failure)");
  check(git(sbBad, ["rev-parse", "stable"]) === badStBefore, "invalid entry: stable UNCHANGED (no silent fallback integration)");
  check(!genExists(sbBad, "mission-report.json") || readGen(sbBad, "mission-report.json").validated !== true, "invalid entry: mission NOT validated");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT B-δ GIT-INTEGRATION ENTRY PARITY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
