/*
 * Regression for FIX_TS_EVIDENCE_PROBE_RESOLUTION_V1.
 * Run: node_modules/.bin/tsx src/runtime/objective-evidence.probe.test.ts
 *
 * Proves the TS objective-evidence path resolves verify[].evidence as a REGISTERED PROBE NAME via the
 * existing capability-probes registry (when a probe ctx is supplied), with unknown-probe ⇒ fail, while
 * preserving the injected-predicate path and the artifact-path (fs) fallback when no ctx is given.
 */

import assert from "node:assert";
import { assessObjectiveEvidence, makeProbeExists } from "./objective-evidence";
import type { ObjectiveSpec, VerifyRequirement } from "./mission-loader";
import type { ExecutionStep } from "./mission-orchestrator";

let passed = 0;
function ok(label: string, fn: () => void): void { fn(); passed += 1; console.log(`  ok - ${label}`); }

const specs: ObjectiveSpec[] = [{ id: "o1", goal: "g", doneWhen: [], dependsOn: [], proof: null }];
const steps: ExecutionStep[] = [{
  id: "OBJECTIVE_1", name: "g", status: "PENDING",
  actions: [], dependencies: [], postconditions: [], verificationRequirements: [],
}];
const engBase = { objectiveSpecs: specs, planObjectiveSteps: steps, authorizedPaths: ["src/**"] };

// --- makeProbeExists directly against the real registry (build-green/typescript-green are ctx-driven) ---
ok("makeProbeExists: known probe ok with satisfying ctx ⇒ present", () => {
  const p = makeProbeExists({ missionId: "M", verify: { build: true, typescript: true } });
  assert.strictEqual(p("build-green"), true);
  assert.strictEqual(p("typescript-green"), true);
});

ok("makeProbeExists: known probe failing ctx ⇒ absent", () => {
  const p = makeProbeExists({ missionId: "M", verify: { build: false } });
  assert.strictEqual(p("build-green"), false);
});

ok("makeProbeExists: unknown probe ⇒ absent (no throw)", () => {
  const p = makeProbeExists({ missionId: "M", verify: {} });
  assert.strictEqual(p("no-such-probe-xyz"), false);
});

// --- assessObjectiveEvidence end-to-end with probeCtx (canonical route) ---------------------------
ok("engineering + both probes green ⇒ PASS", () => {
  const verify: VerifyRequirement[] = [
    { capability: "Build", evidence: "build-green" },
    { capability: "TS", evidence: "typescript-green" },
  ];
  const r = assessObjectiveEvidence({ ...engBase, verify, probeCtx: { missionId: "M", verify: { build: true, typescript: true } } });
  assert.strictEqual(r.proof.verdict, "PASS");
  assert.strictEqual(r.verification.required, 2);
  assert.strictEqual(r.verification.passed, 2);
});

ok("engineering + one probe red ⇒ FAIL (engineering-evidence-missing)", () => {
  const verify: VerifyRequirement[] = [
    { capability: "Build", evidence: "build-green" },
    { capability: "TS", evidence: "typescript-green" },
  ];
  const r = assessObjectiveEvidence({ ...engBase, verify, probeCtx: { missionId: "M", verify: { build: true, typescript: false } } });
  assert.strictEqual(r.proof.verdict, "FAIL");
  assert.strictEqual(r.reason, "engineering-evidence-missing");
});

ok("engineering + unknown probe ⇒ FAIL", () => {
  const verify: VerifyRequirement[] = [{ capability: "X", evidence: "no-such-probe-xyz" }];
  const r = assessObjectiveEvidence({ ...engBase, verify, probeCtx: { missionId: "M", verify: {} } });
  assert.strictEqual(r.proof.verdict, "FAIL");
});

// --- compatibility: injected predicate still wins (back-compat) -----------------------------------
ok("injected evidenceExists takes precedence over probe resolution", () => {
  const verify: VerifyRequirement[] = [{ capability: "C", evidence: "whatever" }];
  const r = assessObjectiveEvidence({
    ...engBase, verify,
    probeCtx: { missionId: "M", verify: {} }, // present, but injected predicate must win
    evidenceExists: () => true,
  });
  assert.strictEqual(r.proof.verdict, "PASS");
});

// --- compatibility: no probeCtx ⇒ artifact-path fallback (name is not a file ⇒ absent) ------------
ok("no probeCtx ⇒ fs fallback (probe-name string is not a file ⇒ FAIL)", () => {
  const verify: VerifyRequirement[] = [{ capability: "C", evidence: "build-green" }];
  const r = assessObjectiveEvidence({ ...engBase, verify });
  assert.strictEqual(r.proof.verdict, "FAIL"); // "build-green" is not a path on disk
});

ok("read-only mission (no authorizedPaths, no verify) ⇒ PASS (unchanged)", () => {
  const r = assessObjectiveEvidence({ objectiveSpecs: specs, planObjectiveSteps: steps, authorizedPaths: [], verify: [] });
  assert.strictEqual(r.proof.verdict, "PASS");
});

console.log(`\nobjective-evidence.probe: ${passed} assertions passed`);
