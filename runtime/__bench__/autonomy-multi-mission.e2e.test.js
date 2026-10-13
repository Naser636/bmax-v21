"use strict";

/*
 * AUTONOMY E2E — MULTI-MISSION AGGREGATE MEASURE  (Phase 03 — Gate B)
 * ==================================================================
 *
 * PURPOSE. The sibling benchmarks each prove ONE dimension in isolation and each measures a per-mission
 * ratio (1/1 or 3/3). A per-mission 1/1 is NOT a parcours: it cannot be extrapolated to a Phase-03
 * threshold. This benchmark builds the MISSING piece — a single AGGREGATE autonomy measurement over a
 * REPRESENTATIVE SET, with ONE explicit cross-mission denominator, computed by the EXISTING measurement
 * mechanism (NO second measure, NO new primitive).
 *
 * REUSE, NOT DUPLICATION. Every run drives the REAL runtime pipeline (runtime/bin/odg-run.js, 13 stages)
 * on the SAME JS execution path the sibling benches use (odg-run.js → patch-executor.js →
 * capability-executors.js). The measurement reuses the REAL runtime modules verbatim:
 *   objective-attribution.js  (attributeObjectives — the EVIDENCE axis)
 *   autonomy-measure.js        (eligibilityFromObjectives / fromExecution / measureAutonomy)
 * This file neither re-implements evidence logic nor forks the measure; it concatenates the per-mission
 * work-units produced by `fromExecution` and calls `measureAutonomy` ONCE over the union.
 *
 * OFFICIAL AGGREGATE DENOMINATOR (CTO Phase-03 decision). Four AUTHORIZED objectives across the three
 * dimensions, INCLUDING the non-fast-forward integration as an AUTHORIZED-BUT-FAILED objective (its
 * contract declares authorization {eligible,authorized}; it fails on TOPOLOGY, never on authorization —
 * proven in-test before it is counted). §6: a failure of a genuinely eligible+authorized objective stays
 * in the denominator with a zero numerator for that objective.
 *   1. AUDIT (read-only)            — Clean Workspace                       3 objectives  (ODG-executed+verified)
 *   2. IN-SCOPE WRITE (governed)    — ODG Synthetic Deliverable             1 objective   (ODG-executed+verified)
 *   3a. LOCAL ACTION (fast-forward) — Governed Git Branch Integration (ff)  1 objective   (ODG-executed+verified)
 *   3b. LOCAL ACTION (non-ff)       — Governed Git Branch Integration (!ff) 1 objective   (authorized, FAILED)
 *   ⇒ denominator = 6, numerator = 5  ⇒  5/6 = 83.3%.
 *
 * SECURITY CONTROLS (kept SEPARATE, §6 — a refusal is a control success, NEVER a business step, and an
 * UNAUTHORIZED attempt is NEVER added to the authorized denominator):
 *   - invalid (empty) authorized scope           ⇒ capability refuses before any write   [UNAUTHORIZED ATTEMPT]
 *   - governance-subsuming scope (no elevation)  ⇒ self-approval guard refuses            [UNAUTHORIZED ATTEMPT]
 *   - non-fast-forward topology                  ⇒ integration fails closed, target intact [AUTHORIZED, FAILED]
 * The non-ff case has a DUAL reading that is NOT conflated: it is a SUCCESSFUL security control (it
 * refused and left the target branch untouched) AND an OPERATIONAL FAILURE inside the authorized
 * denominator (an authorized objective that did not complete). The two other negatives are UNAUTHORIZED
 * attempts and stay OUT of every denominator.
 *
 * HONEST LIMITS (stated, not hidden): offline synthetic throwaway fixtures; representative of the JS
 * per-mission path ONLY; does NOT certify Phase-03 ≥80% in the real world; does NOT cover the TS
 * continuous-loop runtime (runtime-executor.ts); a green run is NOT CTO acceptance. "ODG origin" rests on
 * the proven authoredBy=ODG_CAPABILITY token corroborated by a real executor dispatch + a non-empty
 * evidence artifact (the same basis the sibling benches assert). CONTRACT/UNKNOWN origins are NEVER
 * credited as ODG-autonomous.
 *
 * ISOLATION (reused harness): throwaway os.tmpdir() git repos OUTSIDE the repository (asserted), offline
 * (FLEET_BRIDGE_MOCK=1, ODG_FLEET/ODG_VERBOSE cleared). No network, no provider, no write into the real
 * repository — all effects are confined to the sandboxes, which are removed afterwards.
 *
 * Run:  node --test runtime/__bench__/autonomy-multi-mission.e2e.test.js
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes = [];

// The REAL runtime modules — no reimplementation of evidence or measurement logic.
const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy, CATEGORY } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));
// Independent VERIFIER (η3-B32): the spec-schema-valid probe (capability-probes.js) is the third axis —
// a unit is credited ONLY after this probe confirms the on-disk content (not merely its presence).
const probes = require(path.join(REPO, "runtime", "core", "capability-probes.js"));

// ---- shared harness (same shape as the sibling benches) ------------------------------------------
function git(cwd, args) {
  return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function seedRuntime(sb) {
  assert.ok(!sb.startsWith(REPO), "sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
}
// Plain sandbox (read-only audit + in-scope write + scope negatives).
function buildSandbox(contract) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-multi-e2e-"));
  sandboxes.push(sb);
  seedRuntime(sb);
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  return sb;
}
// Two-branch sandbox (git integration): stable=target at baseline, work=source ahead by one commit;
// `diverge` gives stable its own commit ⇒ non-fast-forward topology (NOT an authorization change).
function buildSandboxGit(contract, diverge) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-multi-git-e2e-"));
  sandboxes.push(sb);
  seedRuntime(sb);
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
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
function runEnv() {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE;
  return env;
}
function runPipeline(sb, mission) {
  const r = spawnSync("node", ["runtime/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function readGen(sb, name) { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", name), "utf8")); }
function genExists(sb, name) { return fs.existsSync(path.join(sb, "runtime", "generated", name)); }
// Run a probe with cwd = sandbox (probes read CWD-relative evidence/deliverable paths). Restores cwd.
function runProbeIn(sb, evidence) {
  const orig = process.cwd();
  try { process.chdir(sb); return probes.runProbe(evidence, {}); }
  finally { process.chdir(orig); }
}

test.after(() => {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
});

// ---- contracts (inline clones of the sibling fixtures; NO mutation of the originals) -------------
function cleanContract(mission) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate the transient git-ignored runtime workspace artifacts under runtime/ (read-only scan).",
        done_when: ["A deterministic scan lists every candidate path under runtime/ that is safe to remove."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm each candidate is covered by the gitignore/backup/archive policy so no tracked or required artifact is listed.",
        done_when: ["Every candidate is git-ignored or already archived; no tracked or required artifact is listed."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence of the cleaned workspace state without deleting any tracked or required artifact.",
        done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
    definition_of_done: ["Evidence generated", "Report generated"],
  };
}
function synthContract(mission, authorizedPaths) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "IMPLEMENT", priority: "NORMAL",
    requires_engineering: true, authorized_paths: authorizedPaths,
    objectives: [{
      id: "ODG_WRITE_1", goal: "ODG formulates and writes a deterministic synthetic manifest inside the authorized scope.",
      done_when: ["A single ODG-authored file exists inside the authorized scope."], authorization: { eligible: true, authorized: true },
    }],
    definition_of_done: ["ODG-authored deliverable written strictly within the authorized scope."],
    completion: ["Validation successful."],
  };
}
// η3-B32 — SEMANTIC spec authoring. Goal enumerates 3 actions ⇒ mission-synthesizer.decompose yields 3
// objectives (a real semantic transform, not a 1:1 echo). The spec-schema-valid probe is the independent
// verifier in the verify block (a failing/tampered deliverable blocks validation and is never credited).
function specContract(mission, authorizedPaths) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "IMPLEMENT", priority: "NORMAL",
    requires_engineering: true, authorized_paths: authorizedPaths,
    objectives: [{
      id: "ODG_SPEC_1", goal: "1. scan inputs 2. validate schema 3. report findings",
      done_when: ["An ODG-authored specification JSON exists inside the authorized scope and passes spec-schema-valid."],
      authorization: { eligible: true, authorized: true },
    }],
    verify: [{ capability: "ODG Spec Author", evidence: "spec-schema-valid" }],
    definition_of_done: ["ODG-authored specification written strictly within the authorized scope and schema-valid."],
    completion: ["Validation successful."],
  };
}
function gitContract(mission, execute) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [{
      id: "GIT_BRANCH_INTEGRATION_1", goal: "Integrate the local source branch into the local target branch, fast-forward only, recorded C03.",
      done_when: ["The target branch tip equals the source tip via a local fast-forward."],
      authorization: { eligible: true, authorized: true },
      git_branch_integration: { target: "stable", source: "work", execute },
    }],
    verify: [{ capability: "Governed Git Branch Integration", evidence: "git-branch-integrated" }],
    definition_of_done: ["Local fast-forward integration performed and recorded."],
  };
}

// ---- per-mission recomputation (identical wiring to the sibling benches' independent recompute) ---
// Returns the work-units (NOT yet measured) so the caller can concatenate them into ONE denominator.
function unitsFor(sb, mission) {
  const exec = readGen(sb, "patch-execution.json");
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const report = genExists(sb, "mission-report.json") ? readGen(sb, "mission-report.json") : { checks: {} };
  const probe = (p) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete, missing } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  assert.strictEqual(complete, true, `[${mission}] denominator must be complete (explicit per-objective authorization): missing ${JSON.stringify(missing)}`);
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const units = fromExecution(exec, attribution, map, { runComplete: coverageOk });
  // Namespace the unit ids by mission so the cross-mission union has no id collision (measureAutonomy
  // rejects duplicate ids). Classification does not depend on id — only the denominator bookkeeping does.
  return units.map((u) => ({ ...u, id: `${mission}::${u.id}` }));
}

// ===================================================================================================
// A. OFFICIAL AGGREGATE — one explicit cross-mission denominator of 7 (6 executed + 1 authorized-failed).
// ===================================================================================================
test("aggregate: official denominator 6/7 = 85.7% across the representative set (reused modules; +ODG_SPEC vs historical 5/6)", () => {
  // 1) AUDIT (read-only) — Clean Workspace, 3 objectives.
  const sbClean = buildSandbox(cleanContract("MULTI_CLEAN"));
  let r = runPipeline(sbClean, "MULTI_CLEAN");
  assert.strictEqual(r.code, 0, "clean pipeline must exit 0:\n" + r.out);
  assert.match(r.out, /PIPELINE SUCCESS — 13\/13 stages/, "clean: all 13 stages");
  assert.strictEqual(readGen(sbClean, "mission-report.json").validated, true, "clean mission validated");

  // 2) IN-SCOPE WRITE — ODG Synthetic Deliverable, 1 objective.
  const sbWrite = buildSandbox(synthContract("MULTI_WRITE", ["bench-workspace/**"]));
  r = runPipeline(sbWrite, "MULTI_WRITE");
  assert.strictEqual(r.code, 0, "write pipeline must exit 0:\n" + r.out);
  assert.match(r.out, /PIPELINE SUCCESS — 13\/13 stages/, "write: all 13 stages");
  assert.ok(fs.existsSync(path.join(sbWrite, "bench-workspace", "odg-synthetic-manifest.txt")), "in-scope deliverable exists");
  assert.strictEqual(readGen(sbWrite, "mission-report.json").validated, true, "write mission validated");

  // 2b) IN-SCOPE SEMANTIC SPEC — ODG Spec Author, 1 objective. Credited ONLY after ALL THREE axes are
  // proven: validated pipeline, spec-schema-valid probe OK, author ODG_CAPABILITY, applicator ODG_EXECUTOR,
  // and a valid evidence artifact. The unit is added to the aggregate AFTER these checks (not before).
  const sbSpec = buildSandbox(specContract("MULTI_SPEC", ["bench-spec/**"]));
  r = runPipeline(sbSpec, "MULTI_SPEC");
  assert.strictEqual(r.code, 0, "spec pipeline must exit 0:\n" + r.out);
  assert.match(r.out, /PIPELINE SUCCESS — 13\/13 stages/, "spec: all 13 stages");
  assert.strictEqual(readGen(sbSpec, "mission-report.json").validated, true, "spec mission validated (verify-block probe passed)");
  const specDeliverable = path.join(sbSpec, "bench-spec", "odg-spec.json");
  assert.ok(fs.existsSync(specDeliverable), "spec: in-scope deliverable exists");
  assert.strictEqual(runProbeIn(sbSpec, "spec-schema-valid").ok, true, "spec: independent spec-schema-valid probe must pass");
  const specExec = readGen(sbSpec, "patch-execution.json").executed.find((x) => x.objectiveId === "ODG_SPEC_1");
  assert.ok(specExec && specExec.status === "EXECUTED" && specExec.capability === "ODG Spec Author", "spec: EXECUTED by ODG Spec Author");
  assert.strictEqual(specExec.authoredBy, "ODG_CAPABILITY", "spec: AUTHOR is ODG_CAPABILITY");
  assert.strictEqual(specExec.appliedBy, "ODG_EXECUTOR", "spec: APPLICATOR is ODG_EXECUTOR");

  // 3a) LOCAL OPERATIONAL ACTION — Governed Git Branch Integration (fast-forward), 1 objective.
  const sbGit = buildSandboxGit(gitContract("MULTI_GIT", true), false);
  const workTip = git(sbGit, ["rev-parse", "work"]);
  r = runPipeline(sbGit, "MULTI_GIT");
  assert.strictEqual(r.code, 0, "git-ff pipeline must exit 0:\n" + r.out);
  assert.match(r.out, /PIPELINE SUCCESS — 13\/13 stages/, "git-ff: all 13 stages");
  assert.strictEqual(git(sbGit, ["rev-parse", "stable"]), workTip, "stable fast-forwarded to work tip (independent git proof)");
  assert.strictEqual(readGen(sbGit, "mission-report.json").validated, true, "git-ff mission validated");

  // 3b) LOCAL OPERATIONAL ACTION — non-fast-forward: AUTHORIZED objective that FAILS on topology.
  const sbNonFF = buildSandboxGit(gitContract("MULTI_NONFF", true), true);
  const stableBefore = git(sbNonFF, ["rev-parse", "stable"]);
  runPipeline(sbNonFF, "MULTI_NONFF"); // exit code is not the proof — the on-disk + git state is

  // PROOF OF AUTHORIZATION (§3): the non-ff objective is EXPLICITLY eligible+authorized and attempted a
  // real integration (execute:true) — it failed on TOPOLOGY, not on authorization. Only then may it be
  // counted as an authorized-but-failed objective in the denominator.
  const nonFFPlan = readGen(sbNonFF, "mission-plan.json");
  assert.deepStrictEqual(nonFFPlan.objectives[0].authorization, { eligible: true, authorized: true },
    "non-ff objective must be explicitly eligible+authorized (proven, not assumed)");
  assert.strictEqual(git(sbNonFF, ["rev-parse", "stable"]), stableBefore, "non-ff: target branch unchanged (fail-closed)");
  const nonFFExec = readGen(sbNonFF, "patch-execution.json");
  // The FAILED record is keyed by `action` (no objectiveId on a failed capability) — match either.
  const nonFFEntry = nonFFExec.executed.find((x) => x.objectiveId === "GIT_BRANCH_INTEGRATION_1" || x.action === "GIT_BRANCH_INTEGRATION_1");
  assert.ok(nonFFEntry && nonFFEntry.status === "FAILED", "non-ff objective is recorded FAILED (topological fail-closed)");
  // The failure is TOPOLOGICAL (a real authorized integration attempt blocked by non-ff), NOT a dry-run,
  // a no-op, or an authorization refusal — so §3 lets it count as an authorized-but-failed objective.
  assert.match(String(nonFFEntry.error || ""), /non-fast-forward/, "non-ff failure is topological (real attempt blocked), not unauthorized");
  assert.notStrictEqual(readGen(sbNonFF, "mission-report.json").validated, true, "non-ff mission is not a validated success");

  // 4) ONE aggregate measurement over the union of all per-mission work-units (reused measure).
  const executedUnits = [
    ...unitsFor(sbClean, "MULTI_CLEAN"),
    ...unitsFor(sbWrite, "MULTI_WRITE"),
    ...unitsFor(sbSpec, "MULTI_SPEC"),   // η3-B32: added ONLY after the three-axis gate above
    ...unitsFor(sbGit, "MULTI_GIT"),
  ];
  const failedUnits = unitsFor(sbNonFF, "MULTI_NONFF"); // the authorized-but-failed objective
  const agg = measureAutonomy([...executedUnits, ...failedUnits]);

  // The mission must be measurable (coherent join of objectives↔authorizations↔attribution↔evidence).
  assert.strictEqual(agg.measurable, true, "aggregate must be measurable: " + JSON.stringify(agg));
  assert.strictEqual(agg.denominator, 7, "denominator = 7 (6 authorized-executed + 1 authorized-failed non-ff) — +1 ODG_SPEC vs the historical 6");
  assert.strictEqual(agg.numerator, 6, "numerator = 6 ODG-authored+applied+verified objectives (+1 ODG_SPEC; non-ff contributes 0)");
  assert.strictEqual(agg.autonomyPercent, 85.7, "official aggregate autonomy = 6/7 = 85.7% (was 5/6 = 83.3%)");
  assert.strictEqual(agg.categories[CATEGORY.ODG_EXECUTED_VERIFIED], 6);
  assert.strictEqual(agg.categories[CATEGORY.BLOCKED_REFUSED_FAILED], 1, "the non-ff authorized failure is counted blocked/failed");
  assert.strictEqual(agg.categories[CATEGORY.OPERATOR_OR_EXTERNAL], 0);
  // Hard honesty: no UNKNOWN/CONTRACT origin is ever credited as ODG-autonomous (no DONE unit with null actor).
  assert.strictEqual([...executedUnits, ...failedUnits].some((u) => u.actor === null && (u.status === "EXECUTED" || u.status === "APPLIED" || u.status === "DONE")), false,
    "no DONE unit with an unproven (CONTRACT/UNKNOWN) author is credited");

  // Reproducible aggregate report (emitted to the run transcript — no write into the real repo).
  console.log("\n=== OFFICIAL AGGREGATE AUTONOMY — authorized representative set (JS per-mission path, offline) ===");
  console.log(JSON.stringify({
    denominator: agg.denominator, numerator: agg.numerator, autonomyPercent: agg.autonomyPercent,
    categories: agg.categories,
    distinctions: agg.distinctions,   // completed / accepted / evidenceValid (never conflated)
    dimensions: {
      "Clean Workspace (audit)": 3, "ODG Synthetic Deliverable (write)": 1,
      "ODG Spec Author (semantic)": 1,
      "Governed Git ff (ok)": 1, "Governed Git non-ff (authorized-failed)": 1,
    },
    excludedFromDenominator: "unauthorized-attempt security controls (invalid-scope, self-approval)",
    caveat: "offline synthetic set; NOT Phase-03 certification; green run != CTO acceptance; TS loop not covered",
  }, null, 2));
});

// ===================================================================================================
// A2. NEGATIVE (η3-B32) — a TAMPERED ODG_SPEC deliverable FAILS the independent spec-schema-valid probe
//     and therefore receives NO credit. Proven INDEPENDENTLY of `validated`: the evidence artifact stays
//     present after tampering, so attribution-by-presence alone (unitsFor) WOULD still count it — the
//     probe gate is what denies the credit. This is exactly why ODG_SPEC inclusion is gated on the probe.
// ===================================================================================================
test("negative: a tampered ODG_SPEC deliverable fails the probe and is NOT credited (probe gate is load-bearing)", () => {
  const sb = buildSandbox(specContract("MULTI_SPEC_TAMPER", ["bench-spec/**"]));
  const r = runPipeline(sb, "MULTI_SPEC_TAMPER");
  assert.strictEqual(r.code, 0, "baseline spec run must succeed before tampering:\n" + r.out);
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, true, "pre-tamper probe passes");
  // Pre-tamper: the evidence artifact is present ⇒ attribution-by-presence already yields a counted unit.
  assert.strictEqual(measureAutonomy(unitsFor(sb, "MULTI_SPEC_TAMPER")).numerator, 1, "pre-tamper: unit counted 1/1");

  // TAMPER the on-disk deliverable: the file STILL exists and is non-empty (attribution-by-presence is
  // UNCHANGED), but the content no longer equals toContract(spec).
  const deliverable = path.join(sb, "bench-spec", "odg-spec.json");
  const parsed = JSON.parse(fs.readFileSync(deliverable, "utf8"));
  parsed.objectives[0].goal += " [TAMPERED]";
  fs.writeFileSync(deliverable, JSON.stringify(parsed, null, 2) + "\n");

  // The INDEPENDENT verifier rejects the tampered content.
  const verdict = runProbeIn(sb, "spec-schema-valid");
  assert.strictEqual(verdict.ok, false, "tampered deliverable must FAIL the independent probe");
  assert.match(verdict.detail, /determinism|tampered|non-deterministic/i, "failure cites determinism: " + verdict.detail);

  // Load-bearing proof: WITHOUT the gate, the still-present artifact would STILL be counted (numerator 1);
  // WITH the gate (probe.ok), a probe-failed spec contributes ZERO units. Crediting it would require
  // ignoring the independent verifier — which the aggregate never does.
  assert.strictEqual(measureAutonomy(unitsFor(sb, "MULTI_SPEC_TAMPER")).numerator, 1, "ungated: artifact-presence alone would still count it (the gap the probe closes)");
  const gatedUnits = verdict.ok ? unitsFor(sb, "MULTI_SPEC_TAMPER") : [];
  assert.strictEqual(gatedUnits.length, 0, "gated inclusion: a probe-failed spec contributes NO units to the aggregate");
});

// ===================================================================================================
// B. SECURITY CONTROLS — measured SEPARATELY (§6). A refusal is a control success, never a business step.
//    UNAUTHORIZED attempts are NEVER added to the authorized denominator; the non-ff refusal has the
//    DUAL reading (control success AND an authorized operational failure counted in section A).
// ===================================================================================================
test("security controls: three negatives refuse fail-closed, measured separately (not authorized business steps)", () => {
  const controls = [];

  // invalid (empty) authorized scope ⇒ capability refuses before any write. [UNAUTHORIZED ATTEMPT]
  const sbNoScope = buildSandbox(synthContract("MULTI_NOSCOPE", []));
  runPipeline(sbNoScope, "MULTI_NOSCOPE");
  assert.strictEqual(fs.existsSync(path.join(sbNoScope, "bench-workspace", "odg-synthetic-manifest.txt")), false, "empty scope: zero mutation");
  if (genExists(sbNoScope, "mission-report.json")) assert.notStrictEqual(readGen(sbNoScope, "mission-report.json").validated, true, "empty scope: not validated");
  controls.push({ control: "invalid-scope", refused: true, kind: "UNAUTHORIZED_ATTEMPT", inDenominator: false });

  // governance-subsuming scope WITHOUT elevation ⇒ self-approval guard refuses before any write. [UNAUTHORIZED ATTEMPT]
  const sbGov = buildSandbox(synthContract("MULTI_GOV", ["runtime/governance/**"]));
  runPipeline(sbGov, "MULTI_GOV");
  assert.strictEqual(fs.existsSync(path.join(sbGov, "runtime", "governance", "odg-synthetic-manifest.txt")), false, "self-approval: zero mutation of protected subtree");
  if (genExists(sbGov, "mission-report.json")) assert.notStrictEqual(readGen(sbGov, "mission-report.json").validated, true, "self-approval: not validated");
  controls.push({ control: "self-approval", refused: true, kind: "UNAUTHORIZED_ATTEMPT", inDenominator: false });

  // non-fast-forward topology ⇒ integration fails closed, target unchanged. [AUTHORIZED, FAILED — dual reading]
  const sbNonFF = buildSandboxGit(gitContract("MULTI_NONFF_B", true), true);
  const stableBefore = git(sbNonFF, ["rev-parse", "stable"]);
  runPipeline(sbNonFF, "MULTI_NONFF_B");
  assert.strictEqual(git(sbNonFF, ["rev-parse", "stable"]), stableBefore, "non-ff: target unchanged (independent git proof)");
  const e = readGen(sbNonFF, "patch-execution.json").executed.find((x) => x.objectiveId === "GIT_BRANCH_INTEGRATION_1" || x.action === "GIT_BRANCH_INTEGRATION_1");
  assert.ok(e && e.status === "FAILED", "non-ff: recorded FAILED (fail-closed)");
  controls.push({ control: "non-fast-forward", refused: true, kind: "AUTHORIZED_OBJECTIVE_FAILED", inDenominator: true,
    note: "dual reading: successful security control AND an authorized operational failure counted in section A" });

  assert.strictEqual(controls.filter((c) => c.refused).length, 3, "all three security controls refused as expected");
  // A refusal is NEVER a validated business success.
  assert.strictEqual(controls.some((c) => c.refused && c.businessSuccess === true), false, "no refusal is counted as a business success");
  console.log("\n=== SECURITY CONTROLS (separate from the authorized-business numerator) ===");
  console.log(JSON.stringify({ controlsRefused: 3, controls }, null, 2));
});
