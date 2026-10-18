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

// --- Case G (V60): projection excludes non-identifier ledger pollution from proven capabilities -------
// The immutable ledger holds proven entries whose `mission` is a parsing accident (CLI flags, free-text
// goal sentences). Those must NOT appear as proven capabilities, while genuine ids (incl. verbose NL ids)
// stay visible. The ledger is NEVER mutated — the filter is purely at projection time (runtime-model).
{
  const root = buildFixture(
    { VALID_CAP: { objectives: ["done"] } },
    [
      "VALID_CAP",                 // genuine UPPER_SNAKE id ⇒ KEPT
      "NL_ANALYZE_DEADBEEF",       // genuine NL id ⇒ KEPT
      "--help",                    // CLI flag mis-recorded ⇒ EXCLUDED
      "--repair-mandate",          // CLI flag mis-recorded ⇒ EXCLUDED
      "Register the new capabilities in the registry", // free-text goal sentence (whitespace) ⇒ EXCLUDED
    ],
    { roadmap: [] },
  );
  const m = computeRuntimeModel(root);
  ok("V60: genuine id KEPT (VALID_CAP)", m.capabilities.includes("VALID_CAP"));
  ok("V60: genuine NL id KEPT (NL_ANALYZE_DEADBEEF)", m.capabilities.includes("NL_ANALYZE_DEADBEEF"));
  ok("V60: CLI flag --help EXCLUDED", !m.capabilities.includes("--help"));
  ok("V60: CLI flag --repair-mandate EXCLUDED", !m.capabilities.includes("--repair-mandate"));
  ok("V60: whitespace goal-sentence EXCLUDED", !m.capabilities.some((c) => /\s/.test(c)));
  ok("V60: exactly the 2 valid ids remain (no pollution counted)", m.capabilities.length === 2);
}

// --- Case: CM-3 governed DEPRECATED — excluded from queue/missing, still reported (not deleted) ---------
{
  const root = buildFixture(
    {
      LIVE: { objectives: [{ id: "LIVE_1", goal: "real forward work" }] },
      OLD: { objectives: [{ id: "OLD_1", goal: "covered elsewhere" }], governedStatus: "DEPRECATED", deprecationReason: "intent covered", coveredBy: "existing-mechanism" },
    },
    [],
    {},
  );
  const m = computeRuntimeModel(root);
  ok("CM-3: DEPRECATED mission NOT queued", !m.queue.some((q) => q.mission === "OLD"));
  ok("CM-3: DEPRECATED mission NOT a missing capability", !m.missingCapabilities.some((c) => c.id === "OLD"));
  ok("CM-3: DEPRECATED mission NOT an outstanding gap", !m.outstanding.some((o) => o.mission === "OLD"));
  // Preserved + traceable (NOT deleted/hidden): still present in the classified mission list, flagged deprecated + non-executable.
  const dep = (m.missions || []).find((x) => x.mission === "OLD");
  ok("CM-3: DEPRECATED mission preserved in model (deprecated=true, executable=false)", !!dep && dep.deprecated === true && dep.executable === false);
  ok("CM-3: a non-deprecated executable mission is STILL queued (no collateral exclusion)", m.queue.some((q) => q.mission === "LIVE"));
}

// --- Case: RESERVED (human-gated) — fully governance-excluded mission skipped, next eligible selected ---
// Repairs the blocker-handling defect where a reserved production-deployment mission sat at the head of
// the queue and stalled all unrelated work. The reserved mission must NOT be queued/missing/outstanding,
// must be surfaced with a RESERVED disposition (visible, not hidden), and selection must advance to the
// next genuinely-eligible mission.
{
  const root = buildFixture(
    {
      DEPLOY_X: {
        mode: "OPERATIONAL",
        objectives: [{ id: "DEPLOY_X_1", goal: "activate prod", authorization: { eligible: false, authorized: false, excluded: true, reason: "Human-gated: production activation requires a separate CTO authorization." } }],
      },
      WORK_Y: { objectives: [{ id: "WORK_Y_1", goal: "eligible forward work" }] },
    },
    [],
    { roadmap: ["DEPLOY_X", "WORK_Y"] }, // DEPLOY_X is FIRST in roadmap order — would be selected but for the reserved skip
  );
  const m = computeRuntimeModel(root);
  ok("RESERVED: human-gated mission NOT queued", !m.queue.some((q) => q.mission === "DEPLOY_X"));
  ok("RESERVED: human-gated mission NOT a missing capability", !m.missingCapabilities.some((c) => c.id === "DEPLOY_X"));
  ok("RESERVED: human-gated mission NOT an outstanding gap", !m.outstanding.some((o) => o.mission === "DEPLOY_X"));
  const res = ((m.scan && m.scan.incompleteContracts) || []).find((c) => c.mission === "DEPLOY_X");
  ok("RESERVED: surfaced with a RESERVED disposition (visible, not hidden)", !!res && res.disposition === "RESERVED" && /human-gated/.test(res.reason));
  const rm = (m.missions || []).find((x) => x.mission === "DEPLOY_X");
  ok("RESERVED: preserved in model (reserved=true, executable=false)", !!rm && rm.reserved === true && rm.executable === false);
  ok("RESERVED: selection ADVANCES past the reserved head to the next eligible mission", m.nextMission === "WORK_Y" && m.queue.some((q) => q.mission === "WORK_Y"));
}

// --- Case: a mission with at least ONE non-excluded objective is NOT reserved (no over-exclusion) -----
{
  const root = buildFixture(
    {
      MIXED_Z: {
        objectives: [
          { id: "MIXED_Z_1", goal: "excluded", authorization: { eligible: false, excluded: true, reason: "reserved" } },
          { id: "MIXED_Z_2", goal: "eligible" },
        ],
      },
    },
    [],
    {},
  );
  const m = computeRuntimeModel(root);
  ok("RESERVED: a mission with a non-excluded objective stays executable (not over-excluded)", m.queue.some((q) => q.mission === "MIXED_Z"));
}

// --- Case: INVALID MISSION ID — CLI-flag / free-text capture artifacts never surface as executable ----
// argv/NL ingestion can drop files like "--help" or a free-text sentence into runtime/missions/. These
// are NOT real work and must never be proposed as Next Mission. They are SKIPPED (excluded from queue /
// missing / outstanding), while valid ids (incl. NL_*) are unaffected.
{
  const root = buildFixture(
    {
      "--help": { mode: "SEQUENTIAL", objectives: [{ id: "HELP_1", goal: "Help" }] },
      NL_ANALYZE_ABC123: { objectives: [{ id: "NL_ANALYZE_ABC123_1", goal: "valid NL mission" }] },
      REAL_WORK: { objectives: [{ id: "REAL_WORK_1", goal: "real forward work" }] },
    },
    [],
    {},
  );
  const m = computeRuntimeModel(root);
  ok("INVALID-ID: '--help' artifact NOT queued", !m.queue.some((q) => q.mission === "--help"));
  ok("INVALID-ID: '--help' NOT a missing capability", !m.missingCapabilities.some((c) => c.id === "--help"));
  ok("INVALID-ID: '--help' NOT an outstanding gap", !m.outstanding.some((o) => o.mission === "--help"));
  const inv = ((m.scan && m.scan.incompleteContracts) || []).find((c) => c.mission === "--help");
  ok("INVALID-ID: '--help' SKIPPED with a 'not a valid mission identifier' reason", !!inv && inv.disposition === "SKIPPED" && /not a valid mission identifier/.test(inv.reason));
  ok("INVALID-ID: a valid NL_* mission IS still queued (no collateral exclusion)", m.queue.some((q) => q.mission === "NL_ANALYZE_ABC123"));
  ok("INVALID-ID: a valid plain mission IS still queued", m.queue.some((q) => q.mission === "REAL_WORK"));
}

console.log(`\n${passed} assertion(s) passed`);
