#!/usr/bin/env node
/*
 * Opportunity Policy (D4) — TypeScript port; parity with runtime/core/opportunity-policy.js.
 *
 * The MINIMAL, explicit policy for what an economic DISCOVERY "opportunity" is and which figures count as
 * OBSERVED / CALCULATED / INFERRED / UNKNOWN. Pure + deterministic; invents NO economic value. This is the
 * discovery-classification layer (PROVEN = economically SOURCED & TRACEABLE, NOT that any profit is
 * realized) — NOT the DEC-006-frozen finance perimeter. Strict port: the public exports (classify,
 * classifyOne, classifyField, computeDerived, STATUS, VERDICT), the frozen constants, the 2xx/same-unit
 * guards, the OBSERVED/CALCULATED/INFERRED/UNKNOWN classification, the PROVEN/CANDIDATE/REJECTED verdict
 * and the full traceability chain are preserved EXACTLY. Depends on ./economic-unit (already TS, co-located
 * in dist). The historical .js remains the behavioural reference.
 */

"use strict";

const eu = require("./economic-unit");

const STATUS = Object.freeze({ OBSERVED: "OBSERVED", CALCULATED: "CALCULATED", INFERRED: "INFERRED", UNKNOWN: "UNKNOWN" });
const VERDICT = Object.freeze({ PROVEN: "PROVEN", CANDIDATE: "CANDIDATE", REJECTED: "REJECTED" });

function is2xx(s: any): boolean { return typeof s === "number" && s >= 200 && s <= 299; }
function sameUnit(a: any, b: any): boolean { return a && b && a.unit === b.unit && a.kind === b.kind; }

function findObs(observations: any, url: any, field: any): any {
  return (observations || []).find((o: any) => o && o.url === url && o.field === field) || null;
}

function classifyField(f: any, observations: any): any {
  const obs = findObs(observations, f.source_url, f.name);
  if (obs && obs.status === "OBSERVED" && is2xx(obs.http_status) && typeof obs.content_hash === "string") {
    return {
      name: f.name, status: STATUS.OBSERVED, basis: eu.BASIS.OBSERVED,
      raw: obs.raw, quantity: obs.quantity || null,
      source_url: f.source_url, fetched_at: obs.fetched_at || null,
      http_status: obs.http_status, content_hash: obs.content_hash, evidence_ref: obs.evidence_ref || null,
    };
  }
  if (obs && obs.http_status !== undefined && !is2xx(obs.http_status)) {
    return { name: f.name, status: STATUS.UNKNOWN, source_url: f.source_url, rejectedSource: true, http_status: obs.http_status, reason: "source not 2xx" };
  }
  return { name: f.name, status: STATUS.UNKNOWN, source_url: f.source_url, reason: obs ? (obs.reason || "extractor UNKNOWN") : "no observation for (source,field)" };
}

function computeDerived(d: any, observedByName: any): any {
  const inputs = Array.isArray(d.of) ? d.of : [];
  const qs = inputs.map((n: any) => (observedByName[n] && observedByName[n].quantity) || null);
  if (qs.some((q: any) => q === null)) return { name: d.name, status: STATUS.UNKNOWN, op: d.op, of: inputs, reason: "requires OBSERVED quantity inputs" };
  if (!qs.every((q: any) => sameUnit(q, qs[0]))) return { name: d.name, status: STATUS.UNKNOWN, op: d.op, of: inputs, reason: "unit mismatch (no implicit FX)" };
  let value;
  try {
    if (d.op === "sub") value = qs.reduce((a: any, b: any) => eu.sub(a, b));
    else if (d.op === "add") value = qs.reduce((a: any, b: any) => eu.add(a, b));
    else return { name: d.name, status: STATUS.UNKNOWN, op: d.op, of: inputs, reason: "unsupported op (sub|add only)" };
  } catch (e: any) { return { name: d.name, status: STATUS.UNKNOWN, op: d.op, of: inputs, reason: String(e.message || e) }; }
  return { name: d.name, status: STATUS.CALCULATED, op: d.op, of: inputs, value, formatted: eu.format(value), note: "DERIVED — theoretical, not a realized result" };
}

function classifyOne(opp: any, observations: any, context: any): any {
  const evidence_ref = (context && context.evidence_ref) || null;
  const fields = (Array.isArray(opp.fields) ? opp.fields : []).map((f: any) => classifyField(f, observations));
  const observedByName: any = {};
  for (const f of fields) if (f.status === STATUS.OBSERVED) observedByName[f.name] = f;

  const calculations = (Array.isArray(opp.derived) ? opp.derived : []).map((d: any) => computeDerived(d, observedByName));
  const inferences = (Array.isArray(opp.inferred) ? opp.inferred : []).map((i: any) => ({
    name: i.name, status: STATUS.INFERRED, assumption: i.assumption || null, from: i.from || null,
    note: "INFERRED — assumption-based, NOT proof",
  }));

  const anyRejectedSource = fields.some((f: any) => f.rejectedSource === true);
  const observedCount = fields.filter((f: any) => f.status === STATUS.OBSERVED).length;
  let verification_status;
  if (anyRejectedSource) verification_status = VERDICT.REJECTED;
  else if (observedCount >= 1) verification_status = VERDICT.PROVEN;
  else verification_status = VERDICT.CANDIDATE;

  const reason = verification_status === VERDICT.CANDIDATE ? "no OBSERVED field (insufficient proof) — kept as candidate"
    : verification_status === VERDICT.REJECTED ? "references a source that was not 2xx (fail-closed)" : null;

  // Full traceability chain for the (proven) opportunity.
  const chain = {
    opportunity: opp.identity || { name: opp.id || null },
    evidence_ref,
    sources: [...new Set(fields.map((f: any) => f.source_url).filter(Boolean))].map((url) => {
      const o = (observations || []).find((x: any) => x && x.url === url) || {};
      return { url, date: o.fetched_at || null, http_status: o.http_status ?? null, content_hash: o.content_hash || null };
    }),
    observations: fields,
    calculations,
    inferences,
    unknowns: Array.isArray(opp.unknowns) ? opp.unknowns : [],
    risks: Array.isArray(opp.risks) ? opp.risks : [],
    conditions: Array.isArray(opp.conditions) ? opp.conditions : [],
    verification_status,
    reason,
  };
  return chain;
}

function classify(opportunities: any, observations: any, context: any): any {
  const results = (Array.isArray(opportunities) ? opportunities : []).map((o: any) => classifyOne(o, observations, context));
  const counts = {
    total: results.length,
    proven: results.filter((r: any) => r.verification_status === VERDICT.PROVEN).length,
    candidate: results.filter((r: any) => r.verification_status === VERDICT.CANDIDATE).length,
    rejected: results.filter((r: any) => r.verification_status === VERDICT.REJECTED).length,
    observedFields: results.reduce((n: any, r: any) => n + r.observations.filter((f: any) => f.status === STATUS.OBSERVED).length, 0),
    calculatedFields: results.reduce((n: any, r: any) => n + r.calculations.filter((c: any) => c.status === STATUS.CALCULATED).length, 0),
    unknownFields: results.reduce((n: any, r: any) => n + r.observations.filter((f: any) => f.status === STATUS.UNKNOWN).length, 0),
  };
  return { results, counts };
}

module.exports = { classify, classifyOne, classifyField, computeDerived, STATUS, VERDICT };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (is2xx,
// sameUnit, findObs) are module-scoped, not global script scope (prevents cross-lot TS2393). API unchanged.
export {};
