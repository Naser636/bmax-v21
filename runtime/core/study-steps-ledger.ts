#!/usr/bin/env node
"use strict";

/*
 * V12.4 §77–§79 (Partie XVII) — SEVEN CTO STUDY STEPS LEDGER. PURE, verifiable. Enumerates the seven study steps in
 * their official order (§77), records the operational correction (§78) and the nature of the steps (§79), with an
 * honest status per step. The seven step INTITULÉS are NOT enumerated in the preserved V12.4 (index only) and are
 * therefore marked NOT_RECOVERABLE — they are NOT fabricated. What IS documented (matrix row XVII) is recorded and
 * made checkable: the §78 operational correction that HISTORICAL PRESERVATION IS TRANSVERSAL (it applies across every
 * step, it is not a single step). A step is never PROVEN on documentation alone (§79/§103). It creates no new roadmap,
 * matrix, or registry; it is the traceable ledger. `checkStep` + `verifyLedger` are fail-closed. Dual export.
 */

const STATUS = Object.freeze(["PROVEN", "PARTIAL", "DOCUMENTED_NOT_VERIFIED", "NOT_RECOVERABLE"]);

// §77 official order 1..7. intitulé NOT_RECOVERABLE (index-only); transversalPreservation per the §78 correction.
const STEPS = Object.freeze([1, 2, 3, 4, 5, 6, 7].map((n) => Object.freeze({
  id: "STEP_" + n, officialOrder: n,
  intitule: "NOT_RECOVERABLE_VERBATIM — preserved V12.4 is an index; step " + n + " title/objective/criteria/deliverable not reconstructed",
  transversalPreservation: true,   // §78 correction: preservation applies to EVERY step
  verifier: "independent end-to-end demonstration (study-step execution), not documentation presence",
  status: "DOCUMENTED_NOT_VERIFIED",
})));

// §78 operational correction (documented in matrix row XVII) + §79 nature framing.
const OPERATIONAL_CORRECTION = Object.freeze({
  section: "§78",
  correction: "Historical preservation is TRANSVERSAL — it is a cross-cutting obligation of all seven steps, not a single ordinal step.",
  recoverable: true,
});
const NATURE = Object.freeze({
  section: "§79",
  nature: "The seven are STUDY steps (knowledge/analysis/reconciliation), distinct from the four execution campaigns (§83-87). A study step completes only when independently demonstrated, not when documented.",
  recoverable: true,
});

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** checkStep(step) -> { ok, problems }. Fail-closed: well-formed id + order 1..7 + transversal preservation carried +
 * valid status; a step claiming PROVEN is unsound unless it ALSO carries a real demonstration flag (demonstrated:true). */
function checkStep(step: any): any {
  const s = step && typeof step === "object" ? step : {};
  const problems: string[] = [];
  if (!isStr(s.id)) problems.push("id required");
  if (!(typeof s.officialOrder === "number" && s.officialOrder >= 1 && s.officialOrder <= 7)) problems.push("officialOrder must be 1..7");
  if (s.transversalPreservation !== true) problems.push("§78: every step must carry transversal preservation");
  if (!STATUS.includes(s.status)) problems.push("invalid status");
  if (!isStr(s.verifier)) problems.push("verifier required");
  // adversarial guard: PROVEN is sound only with an explicit demonstration (never from documentation alone, §103).
  if (s.status === "PROVEN" && s.demonstrated !== true) problems.push("§103: PROVEN requires an explicit demonstration, not documentation");
  return Object.freeze({ ok: problems.length === 0, problems: Object.freeze(problems) });
}

/** verifyLedger() -> fail-closed completeness: exactly 7 steps, contiguous order 1..7, every step sound, correction+nature recorded. */
function verifyLedger(): any {
  const orders = STEPS.map((s) => s.officialOrder).sort((a, b) => a - b);
  const contiguous = orders.length === 7 && orders.every((o, i) => o === i + 1);
  const byStatus: any = { PROVEN: 0, PARTIAL: 0, DOCUMENTED_NOT_VERIFIED: 0, NOT_RECOVERABLE: 0 };
  const unsound: string[] = [];
  const ids = new Set();
  for (const s of STEPS) {
    ids.add(s.id);
    byStatus[s.status] = (byStatus[s.status] || 0) + 1;
    if (!checkStep(s).ok) unsound.push(s.id);
  }
  const transversalAll = STEPS.every((s) => s.transversalPreservation === true);
  return Object.freeze({
    ok: STEPS.length === 7 && ids.size === 7 && contiguous && unsound.length === 0 && transversalAll && OPERATIONAL_CORRECTION.recoverable === true && NATURE.recoverable === true,
    count: STEPS.length, distinct: ids.size, contiguousOrder: contiguous, transversalPreservationAll: transversalAll,
    provenCount: byStatus.PROVEN, byStatus: Object.freeze(byStatus), unsound: Object.freeze(unsound),
  });
}

const STUDY_STEPS_LEDGER_CONTRACT = Object.freeze({
  id: "V124-STUDY-STEPS-77-79-LEDGER",
  source: "V12.4 §77–§79 (Partie XVII) — seven study steps, official order, operational correction, nature",
  statuses: STATUS, count: STEPS.length, operationalCorrection: OPERATIONAL_CORRECTION, nature: NATURE,
  notAuthority: "a traceable ledger of the seven study steps; it reconstructs no intitulé and proves no step by documentation",
  invariants: Object.freeze([
    "exactly seven steps in contiguous official order 1..7 (§77); each step title/objective is NOT_RECOVERABLE (index-only), not fabricated",
    "§78 correction recorded + checkable: historical preservation is TRANSVERSAL — carried by EVERY step, not a single step",
    "§79: these are STUDY steps; a step is PROVEN only when independently demonstrated (§103), never on documentation presence",
    "pure/deterministic; checkStep/verifyLedger fail closed on an incomplete step, a broken order, or an unsound PROVEN claim",
  ]),
});

module.exports = { STATUS, STEPS, OPERATIONAL_CORRECTION, NATURE, checkStep, verifyLedger, STUDY_STEPS_LEDGER_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...STUDY_STEPS_LEDGER_CONTRACT, verify: verifyLedger() }, null, 2) + "\n"); }

export {};
