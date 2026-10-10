#!/usr/bin/env node

/*
 * Runtime Model — gap-detection contract test.
 *
 * runtime-model.js is the single source of truth every Dashboard / `odg status` / autonomy reader
 * consumes, yet it had NO test. This asserts the CONTRACT, not the implementation:
 *
 *   1. proven executable mission     → a capability, never re-queued.
 *   2. unproven executable mission   → the runnable queue + missingCapabilities.
 *   3. mission with no objectives    → NEEDS_CONTRACT: an OUTSTANDING gap, converged=false, and the
 *                                      honest nextMission points at it — NOT "SYSTEM_READY".
 *                                      (This is the mandate: never conclude SYSTEM_READY just
 *                                       because the runnable queue is empty.)
 *   4. evidence-pack / plan          → SKIPPED, never outstanding work, never blocks convergence.
 *   5. converged                     → true ONLY when the queue is empty AND no outstanding gap.
 *
 * Builds a throwaway fixture root and passes it straight to computeRuntimeModel(root) — no chdir,
 * no real repo state touched. Deterministic: the model is timestamp-free.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const { computeRuntimeModel } = require("./runtime-model");

let passed = 0;
function ok(name, cond) {
  assert.ok(cond, name);
  console.log("  ok -", name);
  passed += 1;
}

/** Materialise a minimal fixture repo root with the artefacts the model reads. */
function buildFixture(missions, provenNames, extras = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rt-model-"));
  const missionsDir = path.join(root, "runtime", "missions");
  const pendingDir = path.join(missionsDir, "pending");
  const genDir = path.join(root, "runtime", "generated");
  const govDir = path.join(root, "runtime", "governance");
  const brainDir = path.join(root, "runtime", "brain");
  for (const d of [pendingDir, genDir, govDir, brainDir]) fs.mkdirSync(d, { recursive: true });

  for (const [name, contract] of Object.entries(missions)) {
    fs.writeFileSync(path.join(missionsDir, `${name}.json`), JSON.stringify(contract));
  }
  for (const fix of extras.pendingFixes ?? []) {
    fs.writeFileSync(path.join(pendingDir, fix), "{}");
  }
  fs.writeFileSync(
    path.join(genDir, "mission-ledger.json"),
    JSON.stringify({ entries: provenNames.map((mission) => ({ mission, proven: true })) }),
  );
  // Make pipeline + brain healthy so `runtime` is READY and cannot mask the convergence signal.
  fs.writeFileSync(path.join(genDir, "runtime-pipeline.json"), JSON.stringify(["stage"]));
  fs.writeFileSync(path.join(genDir, "runtime-verify.json"), JSON.stringify({ build: true, typescript: true }));
  fs.writeFileSync(path.join(brainDir, "MASTER_PLAN.md"), "# plan");
  fs.writeFileSync(
    path.join(govDir, "ROADMAP.json"),
    JSON.stringify({ missions: (extras.roadmap ?? []).map((id) => ({ id })) }),
  );
  return root;
}

console.log("Runtime Model — gap-detection contract");

// --- Case A: a real outstanding gap must defeat SYSTEM_READY ---------------------------------
{
  const root = buildFixture(
    {
      DONE_CAP: { objectives: ["already achieved"] },
      RUNNABLE: { objectives: [{ id: "RUNNABLE_1", goal: "do the work" }] },
      NEEDS: { description: "a real mission, but no objectives declared" },
      PACK: { evidencePackContractVersion: "1.0.0" },
    },
    ["DONE_CAP"],
    { roadmap: ["RUNNABLE"], pendingFixes: ["FIX_NEEDS.json"] },
  );
  const m = computeRuntimeModel(root);

  ok("proven mission is a capability", m.capabilities.includes("DONE_CAP"));
  ok("proven mission is not re-queued", !m.queue.some((q) => q.mission === "DONE_CAP"));
  ok("unproven executable mission is queued", m.queue.some((q) => q.mission === "RUNNABLE"));
  ok("unproven executable mission is a missing capability", m.missingCapabilities.some((c) => c.id === "RUNNABLE"));

  ok("no-objectives mission is an outstanding gap", m.outstanding.some((o) => o.mission === "NEEDS"));
  ok("outstanding gap carries its repair nomination", m.outstanding.find((o) => o.mission === "NEEDS").repairNominated === true);
  ok("evidence pack is NOT an outstanding gap", !m.outstanding.some((o) => o.mission === "PACK"));
  ok("runtime health is READY (pipeline+brain green)", m.runtime === "READY");
  ok("not converged while queue non-empty", m.converged === false);
  ok("nextMission is the runnable queue head, not SYSTEM_READY", m.nextMission === "RUNNABLE");
}

// --- Case B: queue empty but a gap remains → still NOT converged, nextMission = the gap -------
{
  const root = buildFixture(
    {
      DONE_CAP: { objectives: ["done"] },
      NEEDS: { description: "no objectives" },
      PACK: { evidencePackContractVersion: "1.0.0" },
    },
    ["DONE_CAP"],
  );
  const m = computeRuntimeModel(root);

  ok("queue is empty", m.queue.length === 0);
  ok("gap still present with empty queue", m.outstanding.some((o) => o.mission === "NEEDS"));
  ok("SYSTEM_READY is refused while a gap remains", m.nextMission === "NEEDS" && m.converged === false);
  ok("repair not nominated when no FIX_ file", m.outstanding.find((o) => o.mission === "NEEDS").repairNominated === false);
}

// --- Case C: truly converged — everything proven, only a skippable pack left -----------------
{
  const root = buildFixture(
    {
      DONE_CAP: { objectives: ["done"] },
      PACK: { evidencePackContractVersion: "1.0.0" },
    },
    ["DONE_CAP"],
  );
  const m = computeRuntimeModel(root);

  ok("queue empty and no outstanding gaps", m.queue.length === 0 && m.outstanding.length === 0);
  ok("converged is true", m.converged === true);
  ok("nextMission is SYSTEM_READY only when truly converged", m.nextMission === "SYSTEM_READY");
}

// --- Case D: a SUCCESS last-run verdict is surfaced but NEVER conflated with governance ------
{
  const root = buildFixture({ MX: { objectives: [{ id: "MX_1", goal: "g" }] } }, [], { roadmap: ["MX"] });
  fs.writeFileSync(path.join(root, "runtime", "generated", "mission-report.json"), JSON.stringify({ mission: "MX", status: "SUCCESS", validated: true }));
  const m = computeRuntimeModel(root);
  ok("lastRun reflects the SUCCESS verdict", m.lastRun && m.lastRun.mission === "MX" && m.lastRun.status === "SUCCESS" && m.lastRun.validated === true);
  ok("SUCCESS lastRun does NOT remove the mission from the queue (no conflation)", m.queue.some((q) => q.mission === "MX"));
  ok("SUCCESS lastRun does NOT add it to capabilities/provenSet", !m.capabilities.includes("MX"));
  ok("nextMission stays governed by the queue, not by lastRun", m.nextMission === "MX");
}

// --- Case E: a BLOCKED last-run verdict is preserved verbatim, queue untouched ----------------
{
  const root = buildFixture({ MX: { objectives: [{ id: "MX_1", goal: "g" }] } }, [], { roadmap: ["MX"] });
  fs.writeFileSync(path.join(root, "runtime", "generated", "mission-report.json"), JSON.stringify({ mission: "MX", status: "BLOCKED", validated: false }));
  const m = computeRuntimeModel(root);
  ok("lastRun reflects the BLOCKED verdict verbatim (never promoted)", m.lastRun && m.lastRun.status === "BLOCKED" && m.lastRun.validated === false);
  ok("BLOCKED lastRun leaves queue + nextMission untouched", m.queue.some((q) => q.mission === "MX") && m.nextMission === "MX");
}

// --- Case F: no verdict artefact ⇒ lastRun is null (absent adds nothing) -----------------------
{
  const root = buildFixture({ MX: { objectives: [{ id: "MX_1", goal: "g" }] } }, [], { roadmap: ["MX"] });
  const m = computeRuntimeModel(root);
  ok("lastRun is null when no mission-report.json exists", m.lastRun === null);
}

console.log(`\n${passed} assertion(s) passed`);
