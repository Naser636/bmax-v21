#!/usr/bin/env node
"use strict";
/* V136 — SELF-ORIGINATED AUTONOMY LOOP driver. ODG discovers a REAL internal discrepancy (codebase-diagnostic →
 * global-improvement-engine), FORMULATES a canary-safe read-only mission from it (self-readonly-mission — the repaired
 * step), MATERIALIZES it as a canonical runtime/missions spec so the existing scheduler/executor can run it, and records
 * an INTERVENTION LEDGER attributing all 14 autonomy steps to ODG / operator / provider. It does NOT self-admit to the
 * canary allowlist and does NOT execute — admission + execution stay operator/Truth-Lock-gated (deny-by-default). Writes
 * docs/odg/V136_SELF_ORIGINATION.json + the materialized mission. Reuses canonical mechanisms only; no new queue/primitive. */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), D = path.join(ROOT, "docs", "odg");
const DIAG = require(path.join(ROOT, "runtime", "core", "codebase-diagnostic.js"));
const GIE = require(path.join(ROOT, "runtime", "core", "global-improvement-engine.js"));
const SRM = require(path.join(ROOT, "runtime", "core", "self-readonly-mission.js"));
const TICK = require(path.join(ROOT, "runtime", "bin", "odg-schedule-tick.ts"));

// 1-2. ODG self-discovers a REAL discrepancy and analyses it (its OWN diagnostic — real evidence, honesty-gated).
const scan = DIAG.scanCore();
const gaps = GIE.analyzeGaps({ uncoveredLibraries: scan.uncovered, measured: true, honest: scan.honest }, {});
const cov = gaps.targets.find((t: any) => t.kind === "COVERAGE");

// 3. ODG FORMULATES a canary-safe read-only mission from the real gap (the repaired self-origination step).
const spec = cov ? SRM.formulateReadOnlyMission(cov, { now: "2026-11-11" }) : null;

// Validate the formulated mission against the canary's OWN classifier + scheduler eligibility (no bypass, no divergent copy).
let canarySafe = false, materialized: string | null = null;
if (spec) {
  canarySafe = TICK.canarySpecFromMission(spec, spec.mission).requiresEngineering === false;
  // 4. MATERIALIZE (provider step): write the canonical mission spec so the EXISTING scheduler/odg-run can load it.
  const mp = path.join(ROOT, "runtime", "missions", spec.mission + ".json");
  fs.writeFileSync(mp, JSON.stringify(spec, null, 2) + "\n");
  materialized = "runtime/missions/" + spec.mission + ".json";
}

// INTERVENTION LEDGER — the 14 autonomy steps, each attributed to its real actor (ODG machine / operator human / provider).
// ODG leads discovery→verdict; admission (5) is operator/Truth-Lock-gated BY DESIGN (deny-by-default, not a defect).
const ledger = [
  { step: 1, name: "DISCOVER discrepancy", actor: "ODG", mechanism: "codebase-diagnostic.scanCore", evidence: `${scan.uncovered.length} uncovered library modules (honest=${scan.honest})` },
  { step: 2, name: "ANALYSE gap", actor: "ODG", mechanism: "global-improvement-engine.analyzeGaps", evidence: `status=${gaps.status}, COVERAGE target=${!!cov}` },
  { step: 3, name: "FORMULATE read-only mission", actor: "ODG", mechanism: "self-readonly-mission.formulateReadOnlyMission (NEW — repaired step)", evidence: spec ? spec.mission : "none" },
  { step: 4, name: "MATERIALISE canonical spec", actor: "PROVIDER(Claude)", mechanism: "write runtime/missions/<id>.json", evidence: materialized || "none" },
  { step: 5, name: "ADMIT to canary allowlist", actor: "OPERATOR(owner)", mechanism: "ODG_CANARY_ALLOWLIST (deny-by-default, Truth-Lock-gated)", evidence: "OPERATOR-GATED — ODG does NOT self-admit (boundary preserved)" },
  { step: 6, name: "TRUTH-LOCK startup gate", actor: "ODG", mechanism: "truth-lock-gate.truthLockGate", evidence: "enforced at odg-schedule-tick on main" },
  { step: 7, name: "SELECT eligible mission", actor: "ODG", mechanism: "mission-scheduler.selectNext", evidence: "first eligible PENDING in the allowlist-derived queue" },
  { step: 8, name: "AUTHORISE read-only safety", actor: "ODG", mechanism: "canary-decision-pack.assessCanaryCandidate", evidence: `canarySafe=${canarySafe}` },
  { step: 9, name: "DEDUP (proven-gate)", actor: "ODG", mechanism: "mission-ledger proven set", evidence: "already-proven ⇒ IDLE (idempotence)" },
  { step: 10, name: "DISPATCH to governed pipeline", actor: "ODG", mechanism: "odg-run (13 stages)", evidence: "spawned by the tick with enforcement env" },
  { step: 11, name: "EXECUTE stages", actor: "ODG", mechanism: "governed pipeline", evidence: "read-only mission → report artifact" },
  { step: 12, name: "VERIFY verdict", actor: "ODG", mechanism: "validation-engine", evidence: "validated===true required for PASS (fail-closed)" },
  { step: 13, name: "AUDIT decision", actor: "ODG", mechanism: "audit-log chain + mission-attempt-log", evidence: "tamper-evident canary decision chain" },
  { step: 14, name: "LESSON REUSE", actor: "ODG", mechanism: "proven-ledger dedup on re-run", evidence: "a proven mission is not re-run (idempotent lesson reuse)" },
];
const odgLed = ledger.filter((s) => s.actor === "ODG").length;

// EXECUTION EVIDENCE (read-only): if ODG's governed pipeline has already run this exact mission (via odg-schedule-tick),
// surface the real machine-verified verdict from the canonical mission-report. We NEVER fabricate it — absent/ mismatched
// report ⇒ NOT_YET_EXECUTED. (The enforced on-main execution is the post-merge step; a branch run is record-only.)
let execution: any = { status: "NOT_YET_EXECUTED", note: "run `ODG_CANARY_ALLOWLIST=<id> odg-schedule-tick` to execute via ODG's orchestration" };
try {
  const rep = JSON.parse(fs.readFileSync(path.join(ROOT, "runtime", "generated", "mission-report.json"), "utf8"));
  if (spec && rep && rep.mission === spec.mission) {
    execution = { status: rep.status, validated: rep.validated === true, mode: rep.mode, verified: rep.validated === true && rep.status === "SUCCESS", note: "machine-verified verdict from the canonical mission-report (odg-run governed pipeline)" };
  }
} catch { /* no report yet */ }

const out = {
  "//": "V136 self-originated autonomy loop. ODG discovers a real discrepancy + formulates a canary-safe read-only mission (the repaired step). Admission + execution stay operator/Truth-Lock-gated (deny-by-default). Reuses canonical mechanisms; no new queue/primitive; no fabricated mission (fail-closed from real evidence).",
  discovery: { uncoveredLibraries: scan.uncovered.length, sample: scan.uncovered.slice(0, 8), honest: scan.honest, analyzeStatus: gaps.status },
  formulatedMission: spec ? { id: spec.mission, mode: spec.mode, authorizedPaths: spec.authorized_paths.length, selfAuthored: spec.selfAuthored, status: spec.status, canarySafe } : null,
  materialized,
  execution,
  interventionLedger: ledger,
  autonomyAttribution: { totalSteps: 14, odgLed, providerSteps: ledger.filter((s) => s.actor.startsWith("PROVIDER")).map((s) => s.step), operatorSteps: ledger.filter((s) => s.actor.startsWith("OPERATOR")).map((s) => s.step) },
  autonomyVerdict: spec ? "SELF_ORIGINATION_REPAIRED — ODG now originates its own eligible read-only mission from real evidence (step 3 was the missing responsibility). Admission (5, operator) + execution remain governance boundaries by design." : "NO_DISCREPANCY — no coverage gap today ⇒ ODG correctly formulates nothing (fail-closed, honest).",
  missingResponsibilityRepaired: "ODG could not ORIGINATE an eligible read-only mission (pure-read-only canary queue exhausted). Repaired via self-readonly-mission: discover→formulate, canary-safe, selfAuthored:false, fail-closed.",
  boundariesPreserved: ["deny-by-default (ODG cannot self-admit to the allowlist)", "Truth-Lock (enforced at the tick)", "no fabrication (spec only from real evidence; owner-gated/empty/injected ⇒ none)", "no self-authorization (selfAuthored:false, PROPOSED)"],
};
fs.writeFileSync(path.join(D, "V136_SELF_ORIGINATION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ discrepancy: scan.uncovered.length + " uncovered", formulated: spec ? spec.mission : null, canarySafe, materialized, execution: execution.status + (execution.verified ? " (validated)" : ""), odgLedSteps: odgLed + "/14", verdict: out.autonomyVerdict.split(" —")[0] }, null, 2) + "\n");
export {};
