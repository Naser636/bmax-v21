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

console.log(`\nSelf-Diagnostic — ${passed} assertions passed.`);
