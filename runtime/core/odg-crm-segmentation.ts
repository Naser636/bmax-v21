#!/usr/bin/env node
"use strict";
/*
 * CRM CLIENT-BOOK SEGMENTATION (D14: "full CRM — segmentation — not consolidated"). PURE, deterministic, fail-closed.
 *
 * THE GAP (reconciled): odg-prospect-qualification segments PROSPECTS in the forward funnel (QUALIFIED/NURTURE/
 * DISQUALIFIED from ICP fit + budget + buy-signal). NOTHING segments the EXISTING client book (customers you already
 * have) by observable attributes — value tier, sector/region, contact recency. This adds exactly that, as a DESCRIPTIVE
 * grouping over caller-supplied observables.
 *
 * Honesty (the whole point — segmentation is where fabricated "judgment" sneaks in):
 *  - the DIMENSIONS and THRESHOLDS are CALLER-supplied (the policy). The engine invents NO threshold and NO business
 *    judgment — it only applies the policy the caller declared;
 *  - value is a SUPPLIED observable (a different module owns how value is computed); this engine fabricates no revenue;
 *  - a client missing the attribute a dimension needs is UNSEGMENTED for that dimension — never forced into a bucket,
 *    never guessed;
 *  - a segment is a DESCRIPTIVE grouping, NOT a priority / decision / value by itself (grouping ≠ "contact these first");
 *  - no clock: asOfDay / lastContactDay are caller-supplied integer day-indices ⇒ deterministic. No network/randomness.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isNonNegInt(v: any): boolean { return isInt(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }
const UNSEGMENTED = "UNSEGMENTED";

/** Validate the policy; returns normalised dimensions or an error. At least one dimension is required (no silent no-op). */
function normalisePolicy(policy: any): any {
  if (!isObj(policy)) return { ok: false, code: "NO_POLICY" };
  const dims: any = {};
  if (policy.valueTiers !== undefined) {
    if (!Array.isArray(policy.valueTiers) || !policy.valueTiers.length) return { ok: false, code: "BAD_VALUE_TIERS" };
    const tiers = policy.valueTiers.map((t: any) => isObj(t) && isStr(t.label) && isNonNegInt(t.minMinor) ? { label: t.label, minMinor: t.minMinor } : null);
    if (tiers.some((t: any) => t === null)) return { ok: false, code: "BAD_VALUE_TIERS", detail: "each tier needs { label, minMinor:nonNegInt }" };
    dims.valueTiers = tiers.slice().sort((a: any, b: any) => b.minMinor - a.minMinor); // descending: pick highest tier a value clears
  }
  if (policy.categorical !== undefined) {
    if (!Array.isArray(policy.categorical) || !policy.categorical.length) return { ok: false, code: "BAD_CATEGORICAL" };
    const cats = policy.categorical.map((c: any) => isObj(c) && isStr(c.name) && isStr(c.field) ? { name: c.name, field: c.field } : null);
    if (cats.some((c: any) => c === null)) return { ok: false, code: "BAD_CATEGORICAL", detail: "each needs { name, field }" };
    dims.categorical = cats;
  }
  if (policy.recency !== undefined) {
    const r = policy.recency;
    if (!isObj(r) || !isStr(r.field) || !Array.isArray(r.windows) || !r.windows.length) return { ok: false, code: "BAD_RECENCY" };
    const windows = r.windows.map((w: any) => isObj(w) && isStr(w.label) && isNonNegInt(w.maxDaysSince) ? { label: w.label, maxDaysSince: w.maxDaysSince } : null);
    if (windows.some((w: any) => w === null)) return { ok: false, code: "BAD_RECENCY", detail: "each window needs { label, maxDaysSince:nonNegInt }" };
    dims.recency = { field: r.field, windows: windows.slice().sort((a: any, b: any) => a.maxDaysSince - b.maxDaysSince) }; // ascending: tightest window first
  }
  if (!dims.valueTiers && !dims.categorical && !dims.recency) return { ok: false, code: "NO_DIMENSIONS", detail: "policy must declare at least one of valueTiers / categorical / recency" };
  return { ok: true, dims };
}

function valueSegment(tiers: any[], client: any): string {
  if (!isNonNegInt(client.totalValueMinor)) return UNSEGMENTED;        // missing/invalid value ⇒ not forced into a bucket
  const hit = tiers.find((t: any) => client.totalValueMinor >= t.minMinor);
  return hit ? hit.label : UNSEGMENTED;                                // below the lowest declared threshold ⇒ UNSEGMENTED (policy gap, not guessed)
}
function recencySegment(rec: any, client: any, asOfDay: any): string {
  if (!isNonNegInt(asOfDay)) return UNSEGMENTED;
  const last = client[rec.field];
  if (!isNonNegInt(last) || last > asOfDay) return UNSEGMENTED;        // missing or future ⇒ not guessed
  const daysSince = asOfDay - last;
  const hit = rec.windows.find((w: any) => daysSince <= w.maxDaysSince);
  return hit ? hit.label : UNSEGMENTED;                                // beyond the widest window ⇒ UNSEGMENTED
}

/**
 * segmentClients(clients, policy, opts?) -> { ok, dimensions[], clients[], rollups, note }.
 * clients: [{ id, totalValueMinor?, <categorical fields>, <recency field> }]. opts = { asOfDay? } (needed for recency).
 * Fail-closed: no clients ⇒ NO_CLIENTS; bad/empty policy ⇒ policy error code. A dimension's attribute missing on a
 * client ⇒ UNSEGMENTED for that dimension (never forced, never guessed).
 */
function segmentClients(clients: any, policy: any, opts: any): any {
  const list = Array.isArray(clients) ? clients.filter(isObj) : [];
  if (!list.length) return freeze({ ok: false, code: "NO_CLIENTS" });
  const np = normalisePolicy(policy);
  if (!np.ok) return freeze(np);
  const asOfDay = isObj(opts) && isNonNegInt(opts.asOfDay) ? opts.asOfDay : null;
  const dims = np.dims;

  const dimensionNames: string[] = [];
  if (dims.valueTiers) dimensionNames.push("value");
  if (dims.categorical) for (const c of dims.categorical) dimensionNames.push(c.name);
  if (dims.recency) dimensionNames.push("recency");

  const rollups: Record<string, Record<string, number>> = {};
  for (const d of dimensionNames) rollups[d] = {};
  const bump = (d: string, label: string) => { rollups[d][label] = (rollups[d][label] || 0) + 1; };

  const out = list.map((client: any) => {
    const segments: Record<string, string> = {};
    if (dims.valueTiers) { const s = valueSegment(dims.valueTiers, client); segments.value = s; bump("value", s); }
    if (dims.categorical) for (const c of dims.categorical) { const v = isStr(client[c.field]) ? client[c.field] : UNSEGMENTED; segments[c.name] = v; bump(c.name, v); }
    if (dims.recency) { const s = recencySegment(dims.recency, client, asOfDay); segments.recency = s; bump("recency", s); }
    return freeze({ id: isStr(client.id) ? client.id : null, segments: freeze(segments) });
  });

  const frozenRollups: any = {}; for (const d of dimensionNames) frozenRollups[d] = freeze(rollups[d]);
  return freeze({ ok: true, dimensions: freeze(dimensionNames), clients: freeze(out), rollups: freeze(frozenRollups),
    note: "DESCRIPTIVE grouping only — dimensions/thresholds are the CALLER's policy; the engine invents no threshold, no value, no judgment. UNSEGMENTED = the client lacks the attribute or falls outside declared buckets (never forced/guessed). A segment is NOT a priority/decision." });
}

const CRM_SEGMENTATION_CONTRACT = Object.freeze({
  id: "CRM-SEGMENTATION",
  purpose: "D14 client-book segmentation: DESCRIPTIVE grouping of EXISTING clients by caller-declared dimensions (value tier / categorical / recency) — distinct from prospect qualification (forward funnel)",
  reuses: Object.freeze(["observable client attributes (e.g. totalValueMinor owned by billing/profitability; lastContactDay from odg-crm-followup) — this engine fabricates none", "integer day-index convention (no clock)"]),
  invariants: Object.freeze([
    "dimensions AND thresholds are CALLER-supplied (the policy) — the engine invents NO threshold and NO business judgment",
    "value is a SUPPLIED observable — no revenue is fabricated here",
    "a client missing a dimension's attribute ⇒ UNSEGMENTED for that dimension — never forced into a bucket, never guessed",
    "a segment is a DESCRIPTIVE grouping, NOT a priority / decision / value by itself",
    "no clock (asOfDay/lastContactDay are caller day-indices ⇒ deterministic); fail-closed on empty clients / bad policy; PURE/frozen",
  ]),
});

module.exports = { UNSEGMENTED, normalisePolicy, segmentClients, CRM_SEGMENTATION_CONTRACT };
export {};
