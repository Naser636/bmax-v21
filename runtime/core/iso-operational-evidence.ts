#!/usr/bin/env node
/**
 * iso-operational-evidence — overlays OPERATIONAL evidence state onto the ISO/IEC 27001 clause matrix, enforcing the
 * mandate's distinction between DOCUMENTED, APPROVED and EXECUTED. It extends iso-27001-clause-matrix: a control that
 * is MECHANISM_PRESENT (gated code mechanism) is promoted to SATISFIED ONLY when operational evidence is APPROVED or
 * EXECUTED **and** carries a named responsible + a concrete artifact reference. FAIL-CLOSED / no fabrication:
 *   - a mere DRAFTED template ⇒ stays MECHANISM_PRESENT (DOCUMENTED_NOT_APPROVED) — a drafted doc is not an approval;
 *   - an APPROVED/EXECUTED claim WITHOUT responsible+artifact is DOWNGRADED to DRAFTED and flagged (no fabricated
 *     approval/incident/restore-test);
 *   - an unknown state ⇒ treated as NONE (deny-by-default).
 * The DEFAULT (no evidence supplied) keeps every control MECHANISM_PRESENT ⇒ 0 SATISFIED — the honest current reality.
 * Pure, deterministic. NOT a certification.
 */
"use strict";

const CM = require("./iso-27001-clause-matrix.js");

const STATE_RANK: Record<string, number> = { NONE: 0, DRAFTED: 1, APPROVED: 2, EXECUTED: 3 };

// Controls whose satisfaction requires EXECUTED evidence (a drill/audit/incident actually performed with records) —
// an APPROVED policy alone is NOT sufficient for these (mandate §3). Clause 9 = performance evaluation / internal
// audit; Clause 10 = improvement / corrective action from real incidents; A.5 = organizational theme that folds in
// incident management (A.5.24–A.5.28), which must be operated, not merely policy-approved. All other controls accept
// APPROVED policy (+ the gated code mechanism) as satisfying readiness.
const EXECUTION_REQUIRED = new Set(["9", "10", "A.5 (Organizational, 37)"]);
function requiredState(ref: string): string { return EXECUTION_REQUIRED.has(String(ref)) ? "EXECUTED" : "APPROVED"; }

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** normaliseEvidence(e): validate a single operational-evidence record; fail-closed downgrade if approval unsupported. */
function normaliseEvidence(e: any): { state: string; responsible: string | null; artifact: string | null; flag: string | null } {
  const raw = e && typeof e === "object" ? e : {};
  let state = isStr(raw.state) && STATE_RANK[raw.state] !== undefined ? raw.state : "NONE";
  const responsible = isStr(raw.responsible) ? String(raw.responsible).trim() : null;
  const artifact = isStr(raw.artifact) ? String(raw.artifact).trim() : null;
  let flag: string | null = null;
  // APPROVED/EXECUTED require BOTH a named responsible and a concrete artifact — else downgrade (no fabricated approval).
  if (STATE_RANK[state] >= STATE_RANK.APPROVED && !(responsible && artifact)) {
    flag = `claimed ${state} without responsible+artifact ⇒ downgraded to DRAFTED (no fabricated approval/execution)`;
    state = "DRAFTED";
  }
  return { state, responsible, artifact, flag };
}

export interface OperationalAssessment {
  standard: string; certificationStatus: string; now: string;
  rows: Array<{ ref: string; title: string; baseStatus: string; opState: string; status: string; responsible: string | null; artifact: string | null; flag: string | null; note: string }>;
  summary: { satisfied: number; mechanismPresent: number; documentedNotApproved: number; external: number; gap: number; total: number };
  notes: string[]; markdown: string;
}

/**
 * assessOperational({ gatedSuites, evidence, now }): evidence = { "<ref>": { state, responsible, artifact } }.
 * Promotes MECHANISM_PRESENT → SATISFIED only with APPROVED|EXECUTED (+ responsible + artifact). No evidence ⇒ no promotion.
 */
function assessOperational(opts: any): OperationalAssessment {
  const o = opts || {};
  const base = CM.buildClauseMatrix({ gatedSuites: o.gatedSuites, now: o.now });
  const ev = o.evidence && typeof o.evidence === "object" ? o.evidence : {};
  const now = String(o.now || "");
  const rows = base.rows.map((r: any) => {
    if (r.status !== "MECHANISM_PRESENT") {
      return { ref: r.ref, title: r.title, baseStatus: r.status, opState: "N/A", status: r.status, responsible: null, artifact: null, flag: null, note: r.note };
    }
    const n = normaliseEvidence(ev[r.ref]);
    const needRank = STATE_RANK[requiredState(r.ref)];
    let status: string, opState: string, note: string;
    if (STATE_RANK[n.state] >= needRank) { status = "SATISFIED"; opState = n.state; note = `code mechanism + ${n.state} operational evidence (responsible: ${n.responsible}; artifact: ${n.artifact})`; }
    else if (n.state === "APPROVED") { status = "MECHANISM_PRESENT"; opState = "APPROVED_PENDING_EXECUTION"; note = "policy approved but this control requires EXECUTED evidence (drill/audit/incident records) ⇒ not satisfied"; }
    else if (n.state === "DRAFTED") { status = "MECHANISM_PRESENT"; opState = "DOCUMENTED_NOT_APPROVED"; note = "template drafted but NOT approved ⇒ not satisfied" + (n.flag ? ` [${n.flag}]` : ""); }
    else { status = "MECHANISM_PRESENT"; opState = "NONE"; note = "code mechanism only; no operational evidence ⇒ not satisfied"; }
    return { ref: r.ref, title: r.title, baseStatus: r.status, opState, status, responsible: n.responsible, artifact: n.artifact, flag: n.flag, note };
  });
  const summary = {
    satisfied: rows.filter((r: any) => r.status === "SATISFIED").length,
    mechanismPresent: rows.filter((r: any) => r.status === "MECHANISM_PRESENT").length,
    documentedNotApproved: rows.filter((r: any) => r.opState === "DOCUMENTED_NOT_APPROVED").length,
    external: rows.filter((r: any) => r.status === "EXTERNAL" || r.status === "PARTIAL_EXTERNAL").length,
    gap: rows.filter((r: any) => r.status === "GAP").length,
    total: rows.length,
  };
  const notes = [
    "DOCUMENTED ≠ APPROVED ≠ EXECUTED: a drafted template is not an approval; SATISFIED requires APPROVED or EXECUTED operational evidence with a named responsible + a concrete artifact.",
    "No approval, incident, restore-test or security operation is fabricated. Absent real operational evidence, controls stay MECHANISM_PRESENT.",
    "Responsible party for approvals/operation is a HUMAN act (CTO) — ODG prepares templates/registers, it does not self-approve.",
    "Execution-required controls (clause 9 internal audit, clause 10 improvement/incident) are NOT satisfied by an approved policy alone — they require EXECUTED evidence (a drill/audit/incident actually performed with records).",
  ];
  const L: string[] = [];
  L.push("# ODG — ISO/IEC 27001 operational-evidence assessment");
  L.push("");
  L.push("> **NOT_CERTIFIED. DOCUMENTED ≠ APPROVED ≠ EXECUTED. ODG does not self-approve; approval is a human (CTO) act.**");
  L.push("");
  L.push(`Summary: SATISFIED ${summary.satisfied} · MECHANISM_PRESENT ${summary.mechanismPresent} (of which documented-not-approved ${summary.documentedNotApproved}) · external ${summary.external} · gap ${summary.gap} / ${summary.total}.`);
  L.push("");
  L.push("| ref | title | status | op-evidence state | responsible | artifact | note |");
  L.push("|---|---|---|---|---|---|---|");
  for (const r of rows) L.push(`| ${r.ref} | ${r.title} | ${r.status} | ${r.opState} | ${r.responsible || "—"} | ${r.artifact || "—"} | ${r.note} |`);
  L.push("");
  for (const n of notes) L.push(`> ${n}`);
  return { standard: base.standard, certificationStatus: base.certificationStatus, now, rows, summary, notes, markdown: L.join("\n") };
}

export { assessOperational, normaliseEvidence, STATE_RANK, EXECUTION_REQUIRED, requiredState };
module.exports = { assessOperational, normaliseEvidence, STATE_RANK, EXECUTION_REQUIRED, requiredState };
