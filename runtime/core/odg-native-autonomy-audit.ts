#!/usr/bin/env node
"use strict";
/*
 * V193 §5 — ODG + Ollama native-engineering autonomy audit. PURE, READ-ONLY, deterministic.
 *
 * NOTE: the directive references an addendum "V192-A" whose results were to be presented. That addendum was NOT
 * delivered to this provider as a directive or document in this session (only docs/odg/V192_SANDBOX_NET_AND_LOT4.json
 * exists). This audit therefore reads the REAL repo modules + the live environment directly, and reports honestly.
 *
 * Maps the §5 eight-step engineering loop to REAL modules + an honest status, and distinguishes a PRESENT+TESTED
 * capability PIPELINE from a DEMONSTRATED end-to-end autonomous construction (not done this session). Code generation
 * is NOT engineering autonomy: the native-engineering EXEC taxonomy already escalates novel reasoning to CLAUDE_CODE.
 */

// live-environment fact verified by a read-only probe on 2026-11-13.
const ENV = Object.freeze({ ollamaDaemon: "LISTENING on 127.0.0.1:11434 (reachable)", model: "qwen2.5-coder (per ollama-provider V50)" });

// §5 steps 1..8 → real module + honest status.
const STEPS = Object.freeze([
  { step: "1 analyse a mission", module: "mission-context-builder.ts", status: "EXISTING_VALIDATED" },
  { step: "2 design a solution", module: "odg-native-engineering.ts (native catalog) / mission-context-builder", status: "EXISTING_PARTIAL", note: "native for catalog specs; novel design escalates to CLAUDE_CODE" },
  { step: "3 generate code with Ollama", module: "ollama-provider.ts (V50, qwen2.5-coder) + ollama-control-plane.ts", status: "EXISTING_VALIDATED", note: "daemon reachable; output is UNTRUSTED (OUTPUT-boundary confinement, not process-sandboxed — Ollama is client/server)" },
  { step: "4 modify an authorized work copy", module: "generative-repair-adapter.ts (proposal→edits, write-set validated, isolated workspace)", status: "EXISTING_VALIDATED" },
  { step: "5 execute tests", module: "odg-native-engineering.ts → odg-closed-executor.ts (CLOSED executor, NO eval/new Function)", status: "EXISTING_VALIDATED" },
  { step: "6 repair errors", module: "generative-repair-adapter.ts runRepairWorkflow (accept or rollback)", status: "EXISTING_VALIDATED" },
  { step: "7 produce a DIFF", module: "generative-repair-adapter (output observed as DIFF)", status: "EXISTING_VALIDATED" },
  { step: "8 independent verification", module: "evaluator-independence.ts + mission-independent-validation.ts", status: "EXISTING_PARTIAL", note: "deterministic independence checks; a distinct MODEL reviewer is NOT_AVAILABLE" },
]);

/* whatOdgCanDoSolo — honest verdict: the PIPELINE exists + is tested; a real end-to-end autonomous improvement was
 * NOT built this session (construction awaits isolation), so demonstrated autonomy for a specific improvement is NOT_MEASURED. */
function autonomy(): any {
  return Object.freeze({
    env: ENV, steps: STEPS,
    pipelineStatus: "EXISTING_VALIDATED (generate → strict-parse → write-set validate → isolated-workspace apply → closed-executor test → repair/rollback → DIFF; modules present + gate-tested; Ollama daemon reachable)",
    demonstratedEndToEndAutonomy: "NOT_MEASURED this session — no real improvement was built (construction awaits validated isolation, OWNER_GATED). Code generation ≠ demonstrated engineering autonomy.",
    confinementHonesty: "Ollama runs as a pre-existing local daemon (client/server) — it CANNOT run inside a no-network bwrap; ODG's confinement is at the OUTPUT boundary (untrusted proposal, write-set validated, isolated apply, independent test, rollback).",
    note: "ODG+Ollama should be PREFERRED for the work they can really do (ODG_NATIVE catalog tasks + deterministic views); novel reasoning escalates to Claude Code. Neither is a substitute for ODG's authority.",
  });
}

/* improvementRouting — of the 8 prepared improvements, which are ODG_NATIVE candidates vs likely CLAUDE_CODE escalation.
 * Honest: all remain BLOCKED_AWAITING_ISOLATION regardless of who builds them. */
function improvementRouting(): any {
  const rows = Object.freeze([
    { id: "IMP-P9-FINOPS-KPIS", route: "ODG_NATIVE_CANDIDATE", why: "deterministic KPI math over supplied data — no novel reasoning" },
    { id: "IMP-P7-SLO-VIEW", route: "ODG_NATIVE_CANDIDATE", why: "deterministic SLO/error-budget math over real events" },
    { id: "IMP-M1-CRA-TRACKER", route: "ODG_NATIVE_CANDIDATE", why: "structured deadline/obligation table from sourced data" },
    { id: "IMP-P1-DORA-VIEW", route: "ODG_NATIVE_CANDIDATE", why: "deterministic metric aggregation over real events" },
    { id: "IMP-P3-SSDF-SLSA", route: "MIXED", why: "mostly mapping (native) + some control judgement (may escalate)" },
    { id: "IMP-P5-CNCF-RATING", route: "MIXED", why: "self-rating rubric (native) + interpretation (may escalate)" },
    { id: "IMP-P8-API-POSTURE", route: "CLAUDE_CODE_LIKELY", why: "OpenAPI positive-security validator = novel parsing/validation logic" },
    { id: "IMP-P11-CONF-CALIB", route: "CLAUDE_CODE_LIKELY", why: "confidence-calibration logic = non-trivial statistical reasoning" },
  ]);
  return Object.freeze({ rows, note: "routing is a HYPOTHESIS to confirm at build time via the native-engineering escalation (ODG_NATIVE vs CLAUDE_CODE — never a fabricated 'ODG wrote it'); ALL remain BLOCKED_AWAITING_ISOLATION." });
}

const NATIVE_AUTONOMY_AUDIT_CONTRACT = Object.freeze({
  id: "V193-NATIVE-AUTONOMY-AUDIT",
  purpose: "§5 — audit real ODG+Ollama engineering capability; distinguish present pipeline from demonstrated autonomy",
  invariants: Object.freeze([
    "V192-A was NOT delivered to this provider — stated honestly; audit reads the real repo + live env",
    "the 8-step pipeline EXISTS + is tested; Ollama daemon reachable; but end-to-end autonomy for a real improvement is NOT_MEASURED this session",
    "code generation ≠ demonstrated engineering autonomy; novel reasoning escalates to CLAUDE_CODE (never a fabricated ODG_NATIVE)",
    "Ollama confinement is at the OUTPUT boundary (client/server daemon), not process-sandboxed — stated honestly",
    "improvement routing is a HYPOTHESIS; all 8 remain BLOCKED_AWAITING_ISOLATION; deterministic; read-only",
  ]),
});

module.exports = { ENV, STEPS, autonomy, improvementRouting, NATIVE_AUTONOMY_AUDIT_CONTRACT };
export {};
