/*
 * Regression for FIX_EVIDENCE_RUN_OWNERSHIP_V1.
 * Run: node_modules/.bin/tsx src/runtime/objective-evidence.ownership.test.ts
 *
 * Proves the repaired evidence predicate: a directory never qualifies, an empty file never
 * qualifies, a stale (pre-run) artifact fails run-ownership when a run start time is known, a
 * fresh current-run non-empty regular file passes, and legacy behaviour (no run time) stays
 * compatible for a valid non-empty regular file. Also exercises assessObjectiveEvidence end-to-end.
 */

import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeEvidenceExists, assessObjectiveEvidence } from "./objective-evidence";
import type { ObjectiveSpec, VerifyRequirement } from "./mission-loader";
import type { ExecutionStep } from "./mission-orchestrator";

let passed = 0;
function ok(label: string, fn: () => void): void { fn(); passed += 1; console.log(`  ok - ${label}`); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-evi-"));
function writeFile(name: string, body: string, mtimeMs?: number): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, body);
  if (mtimeMs !== undefined) { const s = mtimeMs / 1000; fs.utimesSync(p, s, s); }
  return p;
}

try {
  const RUN_START = 1_000_000_000_000; // fixed epoch-ms reference for determinism
  const freshFile = writeFile("fresh.json", "{\"ok\":true}", RUN_START + 5_000);
  const staleFile = writeFile("stale.json", "{\"ok\":true}", RUN_START - 5_000);
  const emptyFile = writeFile("empty.json", "", RUN_START + 5_000);
  const subdir = path.join(dir, "adir"); fs.mkdirSync(subdir);
  const missing = path.join(dir, "nope.json");

  // --- predicate, freshness NOT enforced (legacy) ---------------------------------------------
  const legacy = makeEvidenceExists();
  ok("legacy: non-empty regular file passes", () => assert.strictEqual(legacy(freshFile), true));
  ok("directory never qualifies (legacy)", () => assert.strictEqual(legacy(subdir), false));
  ok("empty file never qualifies", () => assert.strictEqual(legacy(emptyFile), false));
  ok("missing path never qualifies", () => assert.strictEqual(legacy(missing), false));

  // --- predicate, freshness enforced ----------------------------------------------------------
  const fresh = makeEvidenceExists(RUN_START);
  ok("fresh current-run artifact passes", () => assert.strictEqual(fresh(freshFile), true));
  ok("stale pre-run artifact FAILS run-ownership", () => assert.strictEqual(fresh(staleFile), false));
  ok("directory never qualifies (freshness on)", () => assert.strictEqual(fresh(subdir), false));

  // --- assessObjectiveEvidence end-to-end -----------------------------------------------------
  const specs: ObjectiveSpec[] = [{ id: "o1", goal: "do", doneWhen: [], dependsOn: [], proof: null }];
  const steps: ExecutionStep[] = [{
    id: "OBJECTIVE_1", name: "do", status: "PENDING",
    actions: [], dependencies: [], postconditions: [], verificationRequirements: [],
  }];
  const base = {
    objectiveSpecs: specs, planObjectiveSteps: steps,
    authorizedPaths: ["src/**"], // engineering class
  };

  ok("engineering + STALE declared evidence ⇒ FAIL", () => {
    const v: VerifyRequirement[] = [{ capability: "C", evidence: staleFile }];
    const r = assessObjectiveEvidence({ ...base, verify: v, runStartedAtMs: RUN_START });
    assert.strictEqual(r.proof.verdict, "FAIL");
    assert.strictEqual(r.reason, "engineering-evidence-missing");
  });

  ok("engineering + FRESH declared evidence ⇒ PASS", () => {
    const v: VerifyRequirement[] = [{ capability: "C", evidence: freshFile }];
    const r = assessObjectiveEvidence({ ...base, verify: v, runStartedAtMs: RUN_START });
    assert.strictEqual(r.proof.verdict, "PASS");
  });

  ok("engineering + DIRECTORY as evidence ⇒ FAIL", () => {
    const v: VerifyRequirement[] = [{ capability: "C", evidence: subdir }];
    const r = assessObjectiveEvidence({ ...base, verify: v, runStartedAtMs: RUN_START });
    assert.strictEqual(r.proof.verdict, "FAIL");
  });

  ok("read-only mission (no authorizedPaths, no verify) still PASSES (compat)", () => {
    const r = assessObjectiveEvidence({
      objectiveSpecs: specs, planObjectiveSteps: steps, authorizedPaths: [], verify: [],
    });
    assert.strictEqual(r.proof.verdict, "PASS");
  });

  console.log(`\nobjective-evidence.ownership: ${passed} assertions passed`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
