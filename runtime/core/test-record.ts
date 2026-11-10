#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V75 §6 — STRUCTURED TEST-RECORD HARNESS. Improves ODG's test strategy: wraps a check into the full
 * canonical record schema — test_id, domain, scenario, input, expected, observed, status, duration, resource_metrics,
 * evidence, reproducibility, limitations. status ∈ PASS|FAIL|BLOCKED|NOT_MEASURED|NOT_APPLICABLE; a non-measured result
 * is NEVER converted to PASS. Composes resource-meter (V73) for real duration/CPU/memory. PURE wrapper (runs the check,
 * records the truth); no new primitive. Domains: unit, integration, e2e, adversarial, recovery, load, business. Dual export.
 */

const RM = require("./resource-meter.js");

const STATUS = Object.freeze(["PASS", "FAIL", "BLOCKED", "NOT_MEASURED", "NOT_APPLICABLE"]);
const DOMAINS = Object.freeze(["unit", "integration", "e2e", "adversarial", "recovery", "load", "business"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/*
 * record(spec) -> a structured test record. spec:
 *   { test_id, domain, scenario, input, expected, run:()=>observed, assert:(observed)=>bool,
 *     status?, evidence?, limitations?, applicable?(default true) }
 * If applicable===false ⇒ NOT_APPLICABLE (not run). If run throws ⇒ BLOCKED. If an explicit status is given
 * (e.g. NOT_MEASURED) it is honoured and never upgraded to PASS. Otherwise status = assert(observed) ? PASS : FAIL.
 */
function record(spec: any): any {
  const s = isObj(spec) ? spec : {};
  const base = { test_id: s.test_id || "(unnamed)", domain: DOMAINS.includes(s.domain) ? s.domain : "unit", scenario: s.scenario || "", input: s.input !== undefined ? s.input : null, expected: s.expected !== undefined ? s.expected : null };
  if (s.applicable === false) return Object.freeze({ ...base, observed: null, status: "NOT_APPLICABLE", duration: null, resource_metrics: null, evidence: s.evidence || "n/a", reproducibility: "n/a", limitations: s.limitations || "declared not applicable" });
  if (s.status === "NOT_MEASURED") return Object.freeze({ ...base, observed: null, status: "NOT_MEASURED", duration: null, resource_metrics: null, evidence: s.evidence || null, reproducibility: "n/a", limitations: s.limitations || "metric not measurable in this environment" });

  let observed: any = null, status: string, metered: any = null, threw: any = null;
  if (typeof s.run === "function") {
    metered = RM.meter(() => s.run());
    if (!metered.ok) { threw = metered.error; } else { observed = metered.result; }
  } else { observed = s.observed !== undefined ? s.observed : null; }

  if (threw !== null) status = "BLOCKED";
  else if (typeof s.assert === "function") { try { status = s.assert(observed) === true ? "PASS" : "FAIL"; } catch { status = "FAIL"; } }
  else status = STATUS.includes(s.status) ? s.status : "NOT_MEASURED";   // no assert + no explicit ⇒ NOT_MEASURED (never fake PASS)

  const rsc = metered && metered.ok ? { wallMs: metered.resources.wallMs.value, cpuUserMs: metered.resources.cpuUserMs.value, rssBytes: metered.resources.rssBytes.value, tokens: metered.resources.tokens.basis } : null;
  return Object.freeze({ ...base, observed, status, duration: rsc ? rsc.wallMs : null, resource_metrics: rsc, evidence: s.evidence || (threw ? ("threw: " + threw) : null), reproducibility: typeof s.run === "function" ? "re-runnable (deterministic check)" : "static", limitations: s.limitations || null });
}

/* runMatrix(specs) -> { records, tally } over a list of specs. Tally per status; a non-measured never counts as PASS. */
function runMatrix(specs: any): any {
  const records = (Array.isArray(specs) ? specs : []).map(record);
  const tally: any = { PASS: 0, FAIL: 0, BLOCKED: 0, NOT_MEASURED: 0, NOT_APPLICABLE: 0 };
  const byDomain: any = {};
  for (const r of records) { tally[r.status] = (tally[r.status] || 0) + 1; byDomain[r.domain] = byDomain[r.domain] || { total: 0, pass: 0 }; byDomain[r.domain].total++; if (r.status === "PASS") byDomain[r.domain].pass++; }
  return Object.freeze({ total: records.length, tally, byDomain, records, honest: tally.FAIL === 0 && tally.BLOCKED === 0 });
}

const TEST_RECORD_CONTRACT = Object.freeze({
  id: "V75-TEST-RECORD", source: "CTO V75 §6 — structured test-record harness (improves ODG test strategy)",
  schema: Object.freeze(["test_id", "domain", "scenario", "input", "expected", "observed", "status", "duration", "resource_metrics", "evidence", "reproducibility", "limitations"]),
  statuses: STATUS, domains: DOMAINS,
  reuses: Object.freeze(["resource-meter (real duration/CPU/memory)"]),
  invariants: Object.freeze([
    "status ∈ PASS|FAIL|BLOCKED|NOT_MEASURED|NOT_APPLICABLE; a non-measured result is NEVER upgraded to PASS",
    "a thrown check ⇒ BLOCKED (not PASS); no assert + no explicit status ⇒ NOT_MEASURED",
    "resource_metrics are OBSERVED where the meter reports them; tokens stay NOT_MEASURED",
    "pure wrapper; runs the check and records the truth; no new primitive",
  ]),
});

module.exports = { STATUS, DOMAINS, record, runMatrix, TEST_RECORD_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(TEST_RECORD_CONTRACT, null, 2) + "\n"); }
export {};
