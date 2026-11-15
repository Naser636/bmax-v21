#!/usr/bin/env node
"use strict";
/*
 * IMP-M4-DATA-CONTRACTS (lot-6 contract, owner-authorized block) — M4 Data Engineering: a data-contract validation +
 * medallion quality-gate REFERENCE/HARNESS. PURE, deterministic. NO external data platform is integrated. It validates
 * a batch of records against a declared contract (schema + freshness + non-null + referential) and, per the medallion
 * principle, FAILS THE LAYER where the data broke (not the dashboard).
 *
 * Acceptance (contract): harness/reference only; NO external data platform; quality failures fail the layer not the dashboard.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const LAYERS = Object.freeze(["bronze", "silver", "gold"]);

/* validateBatch({layer, contract, records, nowEpochMs}) -> quality gate. contract = { schema:{field:type}, required:[],
 * freshnessMaxMs?, referential?:{field:Set-like array} }. Fails the LAYER on any violation. */
function validateBatch(input: any): any {
  const i = isObj(input) ? input : {};
  const layer = LAYERS.includes(i.layer) ? i.layer : "unknown";
  const c = isObj(i.contract) ? i.contract : {};
  const schema = isObj(c.schema) ? c.schema : {};
  const required = arr(c.required);
  const records = arr(i.records);
  const now = typeof i.nowEpochMs === "number" ? i.nowEpochMs : null;
  const refSet = isObj(c.referential) ? c.referential : null;

  const violations: any[] = [];
  records.forEach((r: any, idx: number) => {
    if (!isObj(r)) { violations.push({ record: idx, rule: "not-an-object" }); return; }
    for (const f of required) if (!(f in r) || r[f] === null || r[f] === undefined) violations.push({ record: idx, rule: "null/missing required", field: f });
    for (const [f, t] of Object.entries(schema)) if (f in r && r[f] !== null && typeof r[f] !== t) violations.push({ record: idx, rule: "schema type", field: f, expected: t, got: typeof r[f] });
    if (c.freshnessMaxMs && now !== null && typeof r.__ts === "number" && (now - r.__ts) > c.freshnessMaxMs) violations.push({ record: idx, rule: "stale", field: "__ts" });
    if (refSet) for (const [f, allowed] of Object.entries(refSet)) if (f in r && !arr(allowed).includes(r[f])) violations.push({ record: idx, rule: "referential integrity", field: f });
  });

  const passed = violations.length === 0;
  return Object.freeze({
    metier: "M4", layer, records: records.length, violations: Object.freeze(violations.slice(0, 50)), violationCount: violations.length,
    verdict: passed ? "PASS" : "FAIL_AT_LAYER",
    failedLayer: passed ? null : layer,
    note: passed ? `${layer} contract satisfied` : `TRIPWIRE: failed at the ${layer} layer (not the dashboard) — ${violations.length} violation(s); downstream layers must not consume`,
    externalPlatform: Object.freeze({ status: "NOT_INTEGRATED", reason: "no external data platform (Iceberg/dbt/Monte Carlo) is integrated — this is a validation harness/reference only" }),
    honesty: "data-contract validation harness ONLY; a failure FAILS THE LAYER where the data broke (medallion tripwire), never silently passes to a dashboard; no external data platform integrated.",
  });
}

const DATA_CONTRACT_QUALITY_CONTRACT = Object.freeze({
  id: "IMP-M4-DATA-CONTRACTS",
  purpose: "M4 — data-contract validation + medallion quality-gate harness; no external data platform",
  invariants: Object.freeze([
    "validation harness/reference ONLY — NO external data platform integrated",
    "a quality failure FAILS THE LAYER where the data broke (medallion tripwire), not the dashboard",
    "schema/required/freshness/referential checks; deterministic; read-only; no new engine",
  ]),
});

module.exports = { LAYERS, validateBatch, DATA_CONTRACT_QUALITY_CONTRACT };
export {};
