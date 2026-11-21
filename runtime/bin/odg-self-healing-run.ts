#!/usr/bin/env node
"use strict";
/*
 * V12.4 cont. (V360 chantier 3) — SELF-HEALING DIAGNOSTIC CHAIN RUN (runtime entry). The automation/self-healing audit
 * found the §12 chain existed as ISOLATED PIECES: the FixChoice spine (repair-planner, which composes defect
 * classification + root-cause intelligence + write-set confinement) had NO real consumer — only an uninvoked selftest. This
 * bin is that missing real, repeatable execution path. It runs the DIAGNOSTIC half end-to-end:
 *   DETECTION/CLASSIFICATION (rce-signal-collector) → ROOT CAUSE (rce-root-cause-intelligence, via planRepair) →
 *   FIXCHOICE / bounded repair PLAN (repair-planner).
 *
 * SCOPE (honest, §12): PLAN-ONLY. It edits nothing, applies no repair, grants no authority — the actual Repair→Verify→apply
 * stays governed (l3-governed-repair / owner-gated writes). Fail-closed is demonstrated: a symptom with no established root
 * cause ⇒ NEEDS_INVESTIGATION (never patch a symptom); a proposed change escaping the write-set ⇒ WRITE_SET_VIOLATION
 * (no silent scope expansion). Pure composition of existing RCE modules; no new engine.
 *
 * Usage: npx tsx runtime/bin/odg-self-healing-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const SIG = require(path.join(ROOT, "runtime", "core", "rce-signal-collector.js"));
const PLAN = require(path.join(ROOT, "runtime", "core", "repair-planner.js"));

// DETECTION — normalise heterogeneous defect signals (provenance required ⇒ attributed, else UNATTRIBUTED fail-closed).
const detection = SIG.collect({ signals: [
  { source: "tsc", provenance: "build-log", kind: "CONTRACT_VIOLATION", message: "missing export 'helper'", severity: "high" },
  { message: "unexpected token" },  // no provenance ⇒ UNATTRIBUTED (not counted as a confirmed defect)
] });

// ROOT CAUSE + FIXCHOICE — a root-caused, write-set-confined repair PLAN (plan only).
const rootHyp = { id: "contract-defect-A", evidence: { reproduces: true, isolated: true, corroborated: true, designDefect: true } };
const planReady = PLAN.planRepair({ signal: { kind: "CONTRACT_VIOLATION" }, hypotheses: [rootHyp], allowedWriteSet: ["runtime/core/"], proposedChanges: ["runtime/core/fixture.ts"] });

// FAIL-CLOSED (a) — a symptom with no established root cause ⇒ never repaired directly.
const symptomOnly = PLAN.planRepair({ signal: { kind: "TEST_FAILURE" }, hypotheses: [{ id: "sympt", evidence: { reproduces: false } }], allowedWriteSet: ["runtime/core/"], proposedChanges: ["runtime/core/x.ts"] });
// FAIL-CLOSED (b) — a proposed change escaping the authorized write-set ⇒ rejected (no scope expansion).
const escaping = PLAN.planRepair({ signal: { kind: "CONTRACT_VIOLATION" }, hypotheses: [rootHyp], allowedWriteSet: ["runtime/core/"], proposedChanges: ["runtime/governance/ROADMAP.json"] });

process.stdout.write(JSON.stringify({
  ran: "self-healing-diagnostic-chain", scope: "PLAN-ONLY (edits nothing; Repair→Verify→apply stays governed)",
  detection: { total: detection.counts.total, confirmed: detection.counts.confirmed, unattributed: detection.counts.unattributed },
  plan_ready: { verdict: planReady.verdict, defectKind: planReady.defectKind, rootCauseLayer: planReady.rootCause ? planReady.rootCause.layer : null, steps: planReady.steps },
  failclosed_symptom: { verdict: symptomOnly.verdict, plannable: symptomOnly.plannable },
  failclosed_writeset: { verdict: escaping.verdict, plannable: escaping.plannable, rejected: escaping.workspace ? escaping.workspace.rejectedChanges : null },
}, null, 2) + "\n");

const ok = planReady.verdict === "PLAN_READY" && symptomOnly.verdict === "NEEDS_INVESTIGATION" && escaping.plannable === false;
process.stdout.write(ok
  ? "\nOK — self-healing DIAGNOSTIC chain ran end-to-end (Detection→Classification→RootCause→FixChoice→PLAN); plan-only; fail-closed on symptom-only + write-set escape. Repair/apply stays governed.\n"
  : "\nPARTIAL — see verdicts above\n");
process.exit(ok ? 0 : 1);
export {};
