#!/usr/bin/env node

/*
 * Opportunity Policy (D4) — the MINIMAL, explicit policy for what an economic "opportunity" is and
 * which figures count as OBSERVED / CALCULATED / INFERRED / UNKNOWN. Pure + deterministic. It invents
 * NO economic value: every OBSERVED figure comes from the governed economic-extractor over a really
 * acquired source; CALCULATED is exact arithmetic (economic-unit) over OBSERVED inputs only.
 *
 * POLICY (scoped to this mission):
 *   - An opportunity CANDIDATE is operator INPUT: an identity (name/activity/market[/country]) plus
 *     declared `fields` (name + source_url) whose VALUES are never supplied by the operator — they are
 *     filled in only by OBSERVED extractor observations keyed by (source_url, field name).
 *   - FIELD classification:
 *       OBSERVED   = an extractor observation with status OBSERVED, a 2xx source and a content_hash.
 *       CALCULATED = a `derived` field computed by exact arithmetic (sub/add) over OBSERVED fields only.
 *       INFERRED   = a declared value carrying an explicit `assumption`; NEVER counts toward PROVEN.
 *       UNKNOWN    = no observation / extractor UNKNOWN / missing input (never fabricated).
 *   - OPPORTUNITY verification_status:
 *       REJECTED  = references a source that was acquired but NOT 2xx (fail-closed; no partial fake).
 *       PROVEN    = ≥1 OBSERVED field with complete provenance (url+date+http_status 2xx+content_hash);
 *                   "PROVEN" means economically SOURCED & TRACEABLE — NOT that any profit is realized.
 *       CANDIDATE = declared but zero OBSERVED field (kept, never deleted, with a reason).
 *   - Every PROVEN opportunity keeps the full chain:
 *       OPPORTUNITY -> EVIDENCE -> SOURCE -> URL -> DATE -> OBSERVATION -> CALCULATION -> VERIFICATION_STATUS
 */

"use strict";

const eu = require("./economic-unit");

const STATUS = Object.freeze({ OBSERVED: "OBSERVED", CALCULATED: "CALCULATED", INFERRED: "INFERRED", UNKNOWN: "UNKNOWN" });
const VERDICT = Object.freeze({ PROVEN: "PROVEN", CANDIDATE: "CANDIDATE", REJECTED: "REJECTED" });

function is2xx(s) { return typeof s === "number" && s >= 200 && s <= 299; }
function sameUnit(a, b) { return a && b && a.unit === b.unit && a.kind === b.kind; }

function findObs(observations, url, field) {
  return (observations || []).find((o) => o && o.url === url && o.field === field) || null;
}

function classifyField(f, observations) {
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

function computeDerived(d, observedByName) {
  const inputs = Array.isArray(d.of) ? d.of : [];
  const qs = inputs.map((n) => (observedByName[n] && observedByName[n].quantity) || null);
  if (qs.some((q) => q === null)) return { name: d.name, status: STATUS.UNKNOWN, op: d.op, of: inputs, reason: "requires OBSERVED quantity inputs" };
  if (!qs.every((q) => sameUnit(q, qs[0]))) return { name: d.name, status: STATUS.UNKNOWN, op: d.op, of: inputs, reason: "unit mismatch (no implicit FX)" };
  let value;
  try {
    if (d.op === "sub") value = qs.reduce((a, b) => eu.sub(a, b));
    else if (d.op === "add") value = qs.reduce((a, b) => eu.add(a, b));
    else return { name: d.name, status: STATUS.UNKNOWN, op: d.op, of: inputs, reason: "unsupported op (sub|add only)" };
  } catch (e) { return { name: d.name, status: STATUS.UNKNOWN, op: d.op, of: inputs, reason: String(e.message || e) }; }
  return { name: d.name, status: STATUS.CALCULATED, op: d.op, of: inputs, value, formatted: eu.format(value), note: "DERIVED — theoretical, not a realized result" };
}

function classifyOne(opp, observations, context) {
  const evidence_ref = (context && context.evidence_ref) || null;
  const fields = (Array.isArray(opp.fields) ? opp.fields : []).map((f) => classifyField(f, observations));
  const observedByName = {};
  for (const f of fields) if (f.status === STATUS.OBSERVED) observedByName[f.name] = f;

  const calculations = (Array.isArray(opp.derived) ? opp.derived : []).map((d) => computeDerived(d, observedByName));
  const inferences = (Array.isArray(opp.inferred) ? opp.inferred : []).map((i) => ({
    name: i.name, status: STATUS.INFERRED, assumption: i.assumption || null, from: i.from || null,
    note: "INFERRED — assumption-based, NOT proof",
  }));

  const anyRejectedSource = fields.some((f) => f.rejectedSource === true);
  const observedCount = fields.filter((f) => f.status === STATUS.OBSERVED).length;
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
    sources: [...new Set(fields.map((f) => f.source_url).filter(Boolean))].map((url) => {
      const o = (observations || []).find((x) => x && x.url === url) || {};
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

function classify(opportunities, observations, context) {
  const results = (Array.isArray(opportunities) ? opportunities : []).map((o) => classifyOne(o, observations, context));
  const counts = {
    total: results.length,
    proven: results.filter((r) => r.verification_status === VERDICT.PROVEN).length,
    candidate: results.filter((r) => r.verification_status === VERDICT.CANDIDATE).length,
    rejected: results.filter((r) => r.verification_status === VERDICT.REJECTED).length,
    observedFields: results.reduce((n, r) => n + r.observations.filter((f) => f.status === STATUS.OBSERVED).length, 0),
    calculatedFields: results.reduce((n, r) => n + r.calculations.filter((c) => c.status === STATUS.CALCULATED).length, 0),
    unknownFields: results.reduce((n, r) => n + r.observations.filter((f) => f.status === STATUS.UNKNOWN).length, 0),
  };
  return { results, counts };
}

module.exports = { classify, classifyOne, classifyField, computeDerived, STATUS, VERDICT };
