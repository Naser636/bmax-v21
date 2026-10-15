#!/usr/bin/env node

/* Self-Diagnostic — behavioural test.
 *
 * Proves the MISSING FRONT of the autonomous engineering cycle actually works end-to-end on synthetic
 * (isolated, safe) artifacts: EXPECTED vs OBSERVED → first DIVERGENCE → INCIDENT, across the detection
 * catalogue; deterministic reproduction (stable incident id); loop-protection freeze; candidate causes
 * with discriminating checks; and the clean path (no divergence ⇒ no incident). Network-independent;
 * runs in a throwaway cwd so the real autonomy-store is never touched. */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const MODULE = path.resolve(__dirname, "self-diagnostic.js");

function inTempCwd(fn) {
  const prev = process.cwd();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "selfdiag-test-"));
  process.chdir(dir);
  try {
    delete require.cache[MODULE];
    delete require.cache[require.resolve("./autonomy-store")];
    const mod = require(MODULE);
    fs.mkdirSync("runtime/generated", { recursive: true });
    fn(mod, dir);
  } finally {
    process.chdir(prev);
  }
}

function writePlan(plan) { fs.writeFileSync("runtime/generated/mission-plan.json", JSON.stringify(plan)); }
function writeExec(executed) { fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({ executed })); }

const PLAN = {
  mission: "M",
  requiresEngineering: true,
  authorizedPaths: ["runtime/core/x.js"],
  objectives: [{ id: "OBJ_1" }, { id: "OBJ_2" }],
  verify: [{ capability: "P", evidence: "proof-x", required: true }],
  evidence: [],
};

// 1. Clean path: observed matches expected ⇒ NO divergence, NO incident.
inTempCwd((mod) => {
  writePlan(PLAN);
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  fs.writeFileSync("runtime/generated/e2.json", "{\"x\":1}");
  writeExec([
    { objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" },
    { objectiveId: "OBJ_2", status: "EXECUTED", evidence: "runtime/generated/e2.json" },
  ]);
  const r = mod.diagnose({ now: "T0" });
  ok("clean observed ⇒ converged (no divergence)", r.converged === true && r.divergences.length === 0);
  ok("clean observed ⇒ no incident raised", r.incident === null);
});

// 2. missing-output: an expected objective never executed.
inTempCwd((mod) => {
  writePlan(PLAN);
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  const r = mod.diagnose({ now: "T0" });
  ok("detects a missing output (OBJ_2 never executed)", r.divergences.some((d) => d.category === "missing-output" && d.firstDifferenceAt === "OBJ_2"));
  ok("raises an OPEN incident with a stable id", r.incident && /^INC-[0-9a-f]{16}$/.test(r.incident.id) && r.incident.status === "OPEN");
  ok("incident carries candidate causes + discriminating checks", r.incident.hypotheses[0].candidates[0].cause && r.incident.hypotheses[0].candidates[0].test);
});

// 3. contradictory-result: EXECUTED but evidence path empty/missing.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/missing.json" }]);
  const r = mod.diagnose({ now: "T0" });
  ok("detects EXECUTED-with-absent-evidence as missing-output/contradiction", r.divergences.some((d) => d.category === "missing-output" || d.category === "contradictory-result"));
});

// 4. wrong-execution-order.
inTempCwd((mod) => {
  writePlan(PLAN);
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  fs.writeFileSync("runtime/generated/e2.json", "{\"x\":1}");
  writeExec([
    { objectiveId: "OBJ_2", status: "EXECUTED", evidence: "runtime/generated/e2.json" },
    { objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" },
  ]);
  const r = mod.diagnose({ now: "T0" });
  ok("detects wrong execution order vs contract", r.divergences.some((d) => d.category === "wrong-execution-order"));
});

// 5. unexpected-permission: an edit touched a path outside the authorized write-set.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json", edits: [{ target: "runtime/core/SECRET.js" }] }]);
  const r = mod.diagnose({ now: "T0" });
  ok("detects an out-of-write-set edit as CRITICAL unexpected-permission", r.divergences.some((d) => d.category === "unexpected-permission" && d.severity === "CRITICAL"));
});

// 6. missing-permission: engineering mission with no authorized paths.
inTempCwd((mod) => {
  writePlan({ mission: "M", requiresEngineering: true, authorizedPaths: [], objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  const r = mod.diagnose({ now: "T0" });
  ok("detects engineering mission with empty authorizedPaths", r.divergences.some((d) => d.category === "missing-permission"));
});

// 7. failed-invariant: a bad state-transition record runs the reused C03 invariants.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  const badTransition = { state_before: { v: 1 }, state_after: { v: 1 }, action: "noop", observed_effect: "none", state_version_before: 5, state_version_after: 5, evidence_refs: [], verification_status: "VERIFIED" };
  const r = mod.diagnose({ now: "T0", transition: badTransition });
  ok("detects a C03 invariant failure via state-transition reuse", r.divergences.some((d) => d.category === "failed-invariant" && d.severity === "CRITICAL"));
});

// 8. required-proof-unsatisfied ONLY when completion was expected (dry-run is NOT a divergence).
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  const failingProbe = () => ({ ok: false, detail: "plan-only" });
  const dry = mod.diagnose({ now: "T0", runProbe: failingProbe, expectComplete: false });
  ok("unsatisfied proof in a dry-run is NOT a divergence (fail-closed is correct state)", !dry.divergences.some((d) => d.category === "required-proof-unsatisfied"));
  const complete = mod.diagnose({ now: "T0", runProbe: failingProbe, expectComplete: true });
  ok("unsatisfied required proof WHEN completion expected IS a divergence", complete.divergences.some((d) => d.category === "required-proof-unsatisfied"));
});

// 9. regression: a baseline-green proof now fails.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  const r = mod.diagnose({ now: "T0", runProbe: () => ({ ok: false }), baseline: { proofs: { "proof-x": true } } });
  ok("detects a regression against a green baseline", r.divergences.some((d) => d.category === "regression" && d.severity === "CRITICAL"));
});

// 10. Reproduction: identical inputs ⇒ identical incident id (deterministic).
inTempCwd((mod) => {
  writePlan(PLAN);
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  const a = mod.diagnose({ now: "T0" }).incident.id;
  const b = mod.diagnose({ now: "T1" }).incident.id; // different clock, same divergence
  ok("same divergence ⇒ same incident id (reproducible, clock-independent)", a === b);
});

// 11. Loop protection: re-raising the same incident freezes it at maxAttempts.
inTempCwd((mod) => {
  const div = [{ category: "missing-output", firstDifferenceAt: "OBJ_9", expected: "x", observed: "absent", evidence_refs: [], severity: "ERROR" }];
  let last;
  for (let i = 0; i < 3; i += 1) last = mod.raiseIncident(div, { maxAttempts: 3, now: "T" + i });
  ok("incident FROZEN after maxAttempts (loop protection)", last.status === "FROZEN" && last.attempts === 3);
  ok("frozen incident carries an escalation note", /loop protection/i.test(last.note || ""));
});

// 12. mission-context-stale: the persisted plan names a DIFFERENT mission than what actually executed.
//     The diagnostic must raise EXACTLY ONE honest CRITICAL divergence and SUPPRESS the same-mission
//     comparisons (no fabricated missing-output for objectives of a mission that never ran here) — the
//     exact real-world defect: expected NL_IMPLEMENT_* vs observed ADD_GOVERNED_EXTERNAL_RESEARCH_*.
inTempCwd((mod) => {
  writePlan(PLAN); // mission "M", objectives OBJ_1/OBJ_2
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({
    mission: "OTHER_MISSION",
    executed: [{ objectiveId: "OTHER_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }],
  }));
  const r = mod.diagnose({ now: "T0" });
  ok("stale context ⇒ raises mission-context-stale (CRITICAL)", r.divergences.some((d) => d.category === "mission-context-stale" && d.severity === "CRITICAL"));
  ok("stale context ⇒ it is the ONLY divergence (same-mission checks suppressed)", r.divergences.length === 1);
  ok("stale context ⇒ NO fabricated missing-output for OBJ_1/OBJ_2", !r.divergences.some((d) => d.category === "missing-output"));
  ok("divergence names BOTH missions (expected M, observed OTHER_MISSION)", r.divergences[0].firstDifferenceAt === "M" && String(r.divergences[0].observed).includes("OTHER_MISSION"));
  ok("report surfaces the observed mission identity", r.observed.mission === "OTHER_MISSION");
  ok("incident hypothesis points at the un-refreshed context", r.incident.hypotheses[0].candidates.some((c) => c.test.includes("patch-execution.json")));
});

// 13. identity-gated: when expected and observed missions MATCH, the stale guard does NOT fire and real
//     same-mission divergences are still detected (the guard is identity-scoped, not a blanket suppressor).
inTempCwd((mod) => {
  writePlan(PLAN); // mission "M"
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({
    mission: "M",
    executed: [{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }],
  }));
  const r = mod.diagnose({ now: "T0" });
  ok("matching mission ⇒ NO mission-context-stale", !r.divergences.some((d) => d.category === "mission-context-stale"));
  ok("matching mission ⇒ the REAL missing-output (OBJ_2) is still detected", r.divergences.some((d) => d.category === "missing-output" && d.firstDifferenceAt === "OBJ_2"));
});

// 14. backward compatible: a legacy exec artifact with NO mission stamp ⇒ guard dormant, prior behaviour.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]); // no mission field
  const r = mod.diagnose({ now: "T0" });
  ok("no observed mission stamp ⇒ no stale-context divergence (legacy artifacts safe)", !r.divergences.some((d) => d.category === "mission-context-stale"));
  ok("no observed mission stamp ⇒ observed.mission is null", r.observed.mission === null);
});

// 15. RC-4 — a RECORDED no-op on an ENGINEERING mission is a divergence (not NO_DIVERGENCE).
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  writeExec([{ objectiveId: "OBJ_1", status: "RECORDED" }]);
  const r = mod.diagnose({ now: "T0" });
  ok("RECORDED on engineering mission is a recorded-noop divergence", r.divergences.some((d) => d.category === "recorded-noop" && d.firstDifferenceAt === "OBJ_1"));
  ok("engineering RECORDED is NOT converged", r.converged === false);
  ok("engineering RECORDED raises an OPEN incident", r.incident && r.incident.status === "OPEN");
});

// 16. RC-4 — a RECORDED on a read-only AUDIT mission is NOT a divergence (no false positive).
inTempCwd((mod) => {
  writePlan({ mission: "A", requiresEngineering: false, authorizedPaths: [], objectives: [{ id: "OBJ_1" }] });
  writeExec([{ objectiveId: "OBJ_1", status: "RECORDED" }]);
  const r = mod.diagnose({ now: "T0" });
  ok("RECORDED on AUDIT mission adds no recorded-noop divergence", !r.divergences.some((d) => d.category === "recorded-noop"));
  ok("AUDIT RECORDED stays converged / no incident", r.converged === true && r.incident === null);
});

// 17. RC-4 — an independent BLOCKED verdict (mission-report.json on disk) forbids NO_DIVERGENCE.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  fs.writeFileSync("runtime/generated/mission-report.json", JSON.stringify({ mission: "M", status: "BLOCKED", validated: false, unmet: ["engineering changed nothing"] }));
  const r = mod.diagnose({ now: "T0" });
  ok("BLOCKED verdict yields a validation-blocked divergence", r.divergences.some((d) => d.category === "validation-blocked"));
  ok("BLOCKED verdict means diagnose is NOT converged", r.converged === false);
  ok("BLOCKED verdict means summary is not NO_DIVERGENCE", r.summary !== "NO_DIVERGENCE");
});

// 18. RC-4 — a SUCCESS verdict adds no divergence (no false positive); clean observed stays converged.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  fs.writeFileSync("runtime/generated/mission-report.json", JSON.stringify({ mission: "M", status: "SUCCESS", validated: true }));
  const r = mod.diagnose({ now: "T0" });
  ok("SUCCESS verdict adds no validation-blocked divergence", !r.divergences.some((d) => d.category === "validation-blocked"));
  ok("SUCCESS verdict + clean observed stays converged / no incident", r.converged === true && r.incident === null);
});

// 19. RC-4 — audit() surfaces a BLOCKED verdict as an incident (so odg-diagnose would exit 1) WITHOUT
//     editing odg-diagnose.js, and keeps PREPARE_NOT_APPLY with the new route never AUTO.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  writeExec([{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }]);
  const out = mod.audit({ now: "T0", verdict: { mission: "M", status: "BLOCKED", validated: false } });
  ok("audit() raises an incident for a BLOCKED verdict (odg-diagnose would exit 1)", out.incident && out.incident.status === "OPEN");
  ok("audit() stays PREPARE_NOT_APPLY", out.mode === "PREPARE_NOT_APPLY");
  ok("validation-blocked is never AUTO (HUMAN_APPROVAL_REQUIRED, nothing auto-repairable)", out.repairPlan.humanApprovalRequired.some((x) => x.category === "validation-blocked") && out.repairPlan.autoRepairable.length === 0);
});

// 20. RC-4 identity gate — a STALE mission-report.json belonging to a DIFFERENT mission must NOT
//     fabricate a validation-blocked divergence for the mission actually being diagnosed. This is the
//     real INC-09c73c50 defect: a leftover BLOCKED verdict from an unrelated run was attributed to the
//     current mission. patch-execution belongs to the expected mission "M" and is clean, so the only
//     honest outcome is NO divergence.
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({
    mission: "M", executed: [{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }],
  }));
  fs.writeFileSync("runtime/generated/mission-report.json", JSON.stringify({ mission: "OTHER_MISSION", status: "BLOCKED", validated: false, unmet: ["unrelated"] }));
  const r = mod.diagnose({ now: "T0" });
  ok("verdict for a DIFFERENT mission adds NO validation-blocked (no false positive)", !r.divergences.some((d) => d.category === "validation-blocked"));
  ok("stale cross-mission verdict ⇒ clean observed stays converged / no incident", r.converged === true && r.incident === null);
});

// 21. RC-4 identity gate — a BLOCKED verdict whose mission MATCHES the expected mission is still
//     surfaced (the gate is identity-scoped, not a blanket suppressor).
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({
    mission: "M", executed: [{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }],
  }));
  fs.writeFileSync("runtime/generated/mission-report.json", JSON.stringify({ mission: "M", status: "BLOCKED", validated: false, unmet: ["engineering changed nothing"] }));
  const r = mod.diagnose({ now: "T0" });
  ok("verdict for the SAME mission still yields validation-blocked", r.divergences.some((d) => d.category === "validation-blocked"));
  ok("same-mission BLOCKED verdict ⇒ not converged", r.converged === false);
  ok("validation-blocked names the matching mission (M)", r.divergences.find((d) => d.category === "validation-blocked").firstDifferenceAt === "M");
});

// 22. RC-4 identity gate — backward compatible: a BLOCKED verdict with NO mission stamp is still
//     consumed (identity unknown on one side ⇒ gate dormant, prior behaviour preserved).
inTempCwd((mod) => {
  writePlan({ ...PLAN, objectives: [{ id: "OBJ_1" }] });
  fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");
  fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({
    mission: "M", executed: [{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }],
  }));
  fs.writeFileSync("runtime/generated/mission-report.json", JSON.stringify({ status: "BLOCKED", validated: false, unmet: ["x"] })); // no mission field
  const r = mod.diagnose({ now: "T0" });
  ok("verdict with no mission stamp is still consumed (backward compatible)", r.divergences.some((d) => d.category === "validation-blocked"));
  ok("mission-less BLOCKED verdict falls back to the expected mission name", r.divergences.find((d) => d.category === "validation-blocked").firstDifferenceAt === "M");
});

console.log(`\nSelf-Diagnostic — ${passed} assertions passed.`);
