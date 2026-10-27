#!/usr/bin/env node
/**
 * certification-traceability — axis F (CTO V24): one requirement→evidence→verification-state→gap view that
 * COMPOSES the existing assessors (it does NOT reimplement them):
 *   - iso-operational-evidence.assessOperational  → per-control status / opState / responsible / artifact
 *   - control-evidence-freshness.assessFreshness  → per-control FRESH / STALE (TTL surveillance cadence)
 *   - portfolio-axes.READINESS_STATES             → the canonical readiness vocabulary (shared, not re-invented)
 *
 * The genuinely-new value is the JOIN + a remediation register: a SATISFIED control whose operational evidence is
 * STALE is reported as STALE (no longer current) — the crucial honesty rule FRESH≠SATISFIED works in BOTH directions.
 * Each requirement gets ONE verificationState from the shared vocabulary + a traceable evidence reference, and every
 * non-verified requirement becomes a remediation entry (what is missing + why). Readiness is NOT certification: the
 * consolidated status stays NOT_CERTIFIED and no conformity is inferred from documentation alone. Pure/deterministic.
 */
"use strict";

const OPS = require("./iso-operational-evidence.js");
const FRESH = require("./control-evidence-freshness.js");
const AXES = require("./portfolio-axes.js");

const READINESS = AXES.READINESS_STATES; // NOT_STARTED..EXTERNALLY_CERTIFIED (shared canonical vocabulary)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyString(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** verificationStateFor(row, freshness): map an operational row + its freshness to ONE readiness state. */
function verificationStateFor(row: any, fresh: string | null): string {
  const external = row.status === "EXTERNAL" || row.status === "PARTIAL_EXTERNAL";
  if (external) return "BLOCKED";                                   // external dependency (hosting/premises/people) — human/out-of-scope
  if (row.status === "SATISFIED") {
    if (fresh === "STALE") return "STALE";                          // satisfied but evidence past TTL ⇒ no longer current
    if (fresh === "FRESH") return "INTERNALLY_VERIFIED";            // satisfied + current internal evidence (NOT certification)
    return "EVIDENCE_COLLECTED";                                    // satisfied but no/unknown evidence date ⇒ not yet "verified current"
  }
  if (row.opState === "DOCUMENTED_NOT_APPROVED") return "DRAFTED";
  if (row.opState === "APPROVED_PENDING_EXECUTION") return "GAP";   // approved policy but required EXECUTED evidence missing
  if (row.status === "MECHANISM_PRESENT") return "IMPLEMENTED";     // code mechanism exists, no operational evidence yet
  if (row.status === "GAP") return "GAP";
  return "NOT_STARTED";
}

/**
 * buildTraceability({ gatedSuites, evidence, evidenceDates, now, ttlDays }): the joined requirement→evidence matrix.
 * evidence: { "<ref>": { state, responsible, artifact } } (forwarded to assessOperational).
 * evidenceDates: { "<ref>": ISOdate } (operational-evidence collection date, for freshness).
 */
function buildTraceability(opts: any = {}): any {
  const now = nonEmptyString(opts.now) ? opts.now : null;
  if (!now) return { ok: false, code: "INVALID_INPUT", detail: "now (ISO date) required" };
  const op = OPS.assessOperational({ gatedSuites: opts.gatedSuites, evidence: opts.evidence, now });

  const dates = isObj(opts.evidenceDates) ? opts.evidenceDates : {};
  const freshControls = op.rows.map((r: any) => ({ ref: r.ref, operationalEvidenceAt: dates[r.ref] }));
  const freshAssess = FRESH.assessFreshness(freshControls, { now, ttlDays: opts.ttlDays });
  const freshByRef: Record<string, string> = {};
  if (freshAssess.ok) for (const fr of freshAssess.rows) freshByRef[fr.ref] = fr.status;

  const rows = op.rows.map((r: any) => {
    const fresh = freshByRef[r.ref] || null;
    const verificationState = verificationStateFor(r, fresh === "FRESH" ? "FRESH" : (fresh === "STALE" ? "STALE" : null));
    return {
      ref: r.ref, title: r.title,
      controlStatus: r.status, opState: r.opState,
      responsible: r.responsible, artifact: r.artifact,
      evidenceDate: dates[r.ref] || null, freshness: fresh,
      verificationState,
      traceable: !!(r.responsible && r.artifact),
      gap: !["INTERNALLY_VERIFIED", "EXTERNALLY_CERTIFIED"].includes(verificationState),
    };
  });

  const remediation = rows.filter((r: any) => r.gap && r.verificationState !== "BLOCKED").map((r: any) => ({
    ref: r.ref, title: r.title, state: r.verificationState,
    missing: r.verificationState === "STALE" ? "re-attest: operational evidence past TTL (no longer current)"
      : r.verificationState === "DRAFTED" ? "approve the drafted policy (human/CTO act) + collect evidence"
        : r.verificationState === "GAP" ? "collect the required EXECUTED evidence (drill/audit/incident records)"
          : r.verificationState === "IMPLEMENTED" ? "collect + approve operational evidence (responsible + artifact)"
            : r.verificationState === "EVIDENCE_COLLECTED" ? "record the evidence collection date to establish freshness"
              : "start: no evidence yet",
  }));

  const byState: Record<string, number> = {};
  for (const s of READINESS) byState[s] = 0;
  for (const r of rows) byState[r.verificationState] = (byState[r.verificationState] || 0) + 1;

  return {
    ok: true,
    standard: op.standard,
    certificationStatus: "NOT_CERTIFIED",   // readiness ≠ certification — never inferred from documentation
    now,
    rows,
    byState,
    summary: { total: rows.length, internallyVerified: byState.INTERNALLY_VERIFIED || 0, stale: byState.STALE || 0, gaps: remediation.length, blockedExternal: rows.filter((r: any) => r.verificationState === "BLOCKED").length, traceable: rows.filter((r: any) => r.traceable).length },
    remediation,
    notes: [
      "Readiness ≠ certification: certificationStatus stays NOT_CERTIFIED; no conformity is inferred from documentation or internal tests. External accredited-body audit is required and out of scope.",
      "FRESH ≠ SATISFIED and a SATISFIED control with STALE evidence ⇒ STALE (no longer current). INTERNALLY_VERIFIED = satisfied + current internal evidence only.",
      "Every non-verified requirement has a remediation entry (missing item). DOCUMENTED ≠ APPROVED ≠ EXECUTED is preserved from iso-operational-evidence.",
    ],
  };
}

export { buildTraceability, verificationStateFor, READINESS };
module.exports = { buildTraceability, verificationStateFor, READINESS };

// Read-only CLI: print the readiness vocabulary + the composition; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "certification-traceability/1", readinessStates: READINESS, composes: ["iso-operational-evidence", "control-evidence-freshness", "portfolio-axes"], rule: "readiness≠certification; STALE overrides SATISFIED" }, null, 2) + "\n");
}
