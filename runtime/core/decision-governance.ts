#!/usr/bin/env node
"use strict";

/*
 * decision-governance (mission M14, V12.4 CTO §3 — decision integrity & governance). PURE, deterministic, fail-closed.
 * Closes an evidenced gap: evidence-provenance stamps ARTIFACTS and control-evidence-freshness ages ISO controls, but
 * nothing audits DECISIONS against their cited evidence for integrity. Given {evidence, decisions}, it detects:
 *   - PROVENANCE_INCOMPLETE : a decision missing the observation->decision->mission->result trace,
 *   - UNKNOWN_EVIDENCE      : a decision citing evidence that does not exist,
 *   - FACT_FROM_NONFACT     : a decision asserting a FACT from HYPOTHESIS/SIMULATION evidence (never pass a hypothesis
 *                             or a simulation off as a fact),
 *   - STALE_BASIS           : a decision relying on evidence older than the freshness TTL,
 *   - CONTRADICTED_BASIS    : a decision whose basis is contradicted by another source (same subject, incompatible claim),
 *   - SUPERSEDED_BASIS      : a decision whose basis is superseded by NEWER evidence (⇒ the decision must be REVISED).
 * A decision is SOUND only with none of the above; otherwise UNSOUND with named reasons. It ANALYSES provided
 * evidence/decisions and STORES NOTHING — it is NOT a second memory, knowledge base or decision authority (ODG keeps
 * authority). Reuses the canonical ISO-date check. No I/O, no clock (nowMs injected), no randomness, no network.
 */

const GOV = require("./research-governor.js");   // REUSE canonical isIsoDate (shared date semantics)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function ms(d: any): number | null { const t = isStr(d) && GOV.isIsoDate(d) ? Date.parse(d) : NaN; return Number.isFinite(t) ? t : null; }
// Canonical evidence kind. Anything not canonically FACT is a NON-FACT for a FACT assertion (fail-closed: a garbled /
// lowercase / unknown kind can NEVER satisfy a FACT claim — never pass a hypothesis/simulation/unknown off as a fact).
function normKind(k: any): string { return isStr(k) ? k.trim().toUpperCase() : ""; }
// Canonical claim key by VALUE (not just strings) — a numeric/boolean claim must still be comparable for
// contradiction/supersession. undefined/null ⇒ no claim (null key, excluded from comparison).
function claimKey(v: any): string | null { if (v === undefined || v === null) return null; try { const k = JSON.stringify(v); return typeof k === "string" ? k : null; } catch { return null; } }   // non-serializable (bigint/circular) ⇒ no comparable claim (isolated, never collapses the report)

/**
 * assessDecisions({ evidence, decisions, nowMs, freshnessMs }): PURE decision-integrity audit. evidence item =
 * { id, subject, claim, kind:"FACT"|"HYPOTHESIS"|"SIMULATION", source, date }. decision = { id, basis:[evidenceIds],
 * assertedKind:"FACT"|"HYPOTHESIS", provenance:{observation,mission,result} }. Returns a frozen report. Never throws.
 */
function assessDecisions(input: any = {}): any {
  try {
    const i = isObj(input) ? input : {};
    const evidence = arr(i.evidence).filter((e) => isObj(e) && isStr(e.id));
    const byId = new Map(evidence.map((e) => [e.id, e]));
    const nowMs = isNum(i.nowMs) ? i.nowMs : null;
    const freshnessMs = isNum(i.freshnessMs) && i.freshnessMs > 0 ? i.freshnessMs : null;

    // GLOBAL CONTRADICTIONS: two evidence items, same subject, DIFFERENT source, incompatible (different) claim.
    const contradictions: Array<{ subject: string; a: string; b: string }> = [];
    const contradicted = new Set<string>();
    for (let x = 0; x < evidence.length; x++) for (let y = x + 1; y < evidence.length; y++) {
      const a = evidence[x], b = evidence[y];
      const ka = claimKey(a.claim), kb = claimKey(b.claim);
      if (isStr(a.subject) && a.subject === b.subject && isStr(a.source) && isStr(b.source) && a.source !== b.source && ka !== null && kb !== null && ka !== kb) {
        contradictions.push({ subject: a.subject, a: a.id, b: b.id }); contradicted.add(a.id); contradicted.add(b.id);
      }
    }
    // SUPERSEDED: evidence E is superseded if a NEWER evidence on the same subject makes a different claim (any value type).
    const superseded = new Set<string>();
    for (const e of evidence) {
      const te = ms(e.date); if (te === null) continue;
      const ke = claimKey(e.claim); if (ke === null) continue;
      for (const o of evidence) {
        if (o === e) continue;
        const to = ms(o.date); const ko = claimKey(o.claim);
        if (to !== null && to > te && isStr(e.subject) && e.subject === o.subject && ko !== null && ke !== ko) { superseded.add(e.id); break; }
      }
    }

    const results = arr(i.decisions).filter((d) => isObj(d) && isStr(d.id)).map((d) => {
      const reasons: string[] = [];
      const prov = isObj(d.provenance) ? d.provenance : {};
      if (!(isStr(prov.observation) && isStr(prov.mission) && isStr(prov.result))) reasons.push("PROVENANCE_INCOMPLETE");
      const basis = arr(d.basis).filter((x) => typeof x === "string");
      const asserted = normKind(d.assertedKind);
      let factFromNonFact = false, stale = false, contra = false, supers = false, unknown = false;
      for (const eid of basis) {
        const e = byId.get(eid);
        if (!e) { unknown = true; continue; }
        // FACT assertion: EVERY basis must be canonically FACT. Any non-FACT (hypothesis/simulation/unknown/garbled
        // casing) ⇒ FACT_FROM_NONFACT (fail-closed — a hypothesis/simulation is never a fact).
        if (asserted === "FACT" && normKind(e.kind) !== "FACT") factFromNonFact = true;
        if (nowMs !== null && freshnessMs !== null) { const te = ms(e.date); if (te !== null && nowMs - te > freshnessMs) stale = true; }
        if (contradicted.has(eid)) contra = true;
        if (superseded.has(eid)) supers = true;
      }
      // A FACT asserted with NO cited evidence is unsupported (fail-closed — a fact needs a basis; a hypothesis may not).
      if (asserted === "FACT" && basis.length === 0) reasons.push("UNSUPPORTED_ASSERTION");
      if (unknown) reasons.push("UNKNOWN_EVIDENCE");
      if (factFromNonFact) reasons.push("FACT_FROM_NONFACT");
      if (stale) reasons.push("STALE_BASIS");
      if (contra) reasons.push("CONTRADICTED_BASIS");
      if (supers) reasons.push("SUPERSEDED_BASIS");
      return Object.freeze({ id: d.id, verdict: reasons.length === 0 ? "SOUND" : "UNSOUND", reasons: Object.freeze(reasons), revisionNeeded: contra || supers });
    });

    const sound = results.filter((r) => r.verdict === "SOUND").length;
    return Object.freeze({
      total: results.length,
      sound,
      unsound: results.length - sound,
      contradictions: Object.freeze(contradictions.map((c) => Object.freeze(c))),
      revisionsNeeded: Object.freeze(results.filter((r) => r.revisionNeeded).map((r) => r.id)),
      results: Object.freeze(results),
    });
  } catch { return Object.freeze({ total: 0, sound: 0, unsound: 0, contradictions: Object.freeze([]), revisionsNeeded: Object.freeze([]), results: Object.freeze([]), error: "ASSESS_ERROR" }); }
}

module.exports = { assessDecisions };
export {};

if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "decision-governance/1", detects: ["PROVENANCE_INCOMPLETE", "UNKNOWN_EVIDENCE", "FACT_FROM_NONFACT", "STALE_BASIS", "CONTRADICTED_BASIS", "SUPERSEDED_BASIS"] }, null, 2) + "\n");
}
