#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 21 (P4 data observability — world-research gap, SELF-DECLARED) — DATASET FRESHNESS + VOLUME detector. PURE,
 * deterministic. World reference: Monte Carlo / Barr Moses "5 Pillars of Data Observability" (freshness, volume,
 * schema, distribution, lineage), reaffirmed 2026. ODG already covers schema (schemaCompatibility), lineage
 * (checkLineage), distribution (p4-distribution-drift PSI) and quality — but FRESHNESS and VOLUME were explicitly
 * marked NOT_YET_IMPLEMENTED in dataset-quality-assertions.ts ("requires a timestamp + clock"). This closes them the
 * same way p7-sre-reference.chaosRecovery handles time: take `asOf` + `lastUpdatedAt` as INPUTS, not from a clock —
 * keeping it pure/deterministic. Fail-closed: a missing timestamp / baseline ⇒ a finding, never a silent pass. Emits
 * findings in the existing dataset-quality shape so they flow through the SARIF adapter. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isNum(v: any): boolean { return typeof v === "number" && isFinite(v); }
function finding(id: string, area: string, severity: string, detail: string, remediation: string, evidence: string): any {
  return { id, area, severity, detail, remediation, evidence };
}

/** assessFreshness({asOf, lastUpdatedAt, maxStalenessMs}) -> { fresh, stalenessMs, findings }. Fail-closed on missing ts. */
function assessFreshness(input: any): any {
  const o = isObj(input) ? input : {};
  const findings: any[] = [];
  if (!isNum(o.asOf) || !isNum(o.lastUpdatedAt)) {
    findings.push(finding("freshness:missing-timestamp", "freshness", "HIGH", "freshness cannot be assessed — asOf or lastUpdatedAt missing/invalid", "supply both asOf and lastUpdatedAt (ms epoch)", `asOf=${o.asOf} lastUpdatedAt=${o.lastUpdatedAt}`));
    return Object.freeze({ fresh: false, stalenessMs: null, findings: Object.freeze(findings) });
  }
  const staleness = o.asOf - o.lastUpdatedAt;
  const max = isNum(o.maxStalenessMs) ? o.maxStalenessMs : Infinity;
  if (staleness < 0) findings.push(finding("freshness:future-timestamp", "freshness", "HIGH", "lastUpdatedAt is AFTER asOf (clock skew / bad data)", "verify the pipeline clock + source timestamp", `staleness=${staleness}ms`));
  else if (staleness > max) findings.push(finding("freshness:stale", "freshness", "HIGH", `dataset is STALE: ${staleness}ms old > SLA ${max}ms`, "investigate the upstream pipeline freshness SLA breach", `staleness=${staleness}ms > max=${max}ms`));
  const fresh = findings.length === 0;
  return Object.freeze({ fresh, stalenessMs: staleness, findings: Object.freeze(findings) });
}

/** assessVolume({rowCount, baseline, maxDropPct, maxSpikePct}) -> { ok, deltaPct, findings }. Fail-closed on missing baseline. */
function assessVolume(input: any): any {
  const o = isObj(input) ? input : {};
  const findings: any[] = [];
  if (!isNum(o.rowCount) || o.rowCount < 0 || !isNum(o.baseline) || o.baseline <= 0) {
    findings.push(finding("volume:missing-baseline", "volume", "HIGH", "volume cannot be assessed — rowCount or a positive baseline missing/invalid", "supply rowCount (≥0) and a positive expected baseline", `rowCount=${o.rowCount} baseline=${o.baseline}`));
    return Object.freeze({ ok: false, deltaPct: null, findings: Object.freeze(findings) });
  }
  const deltaPct = Number((((o.rowCount - o.baseline) / o.baseline) * 100).toFixed(2));
  const maxDrop = isNum(o.maxDropPct) ? o.maxDropPct : 50;    // default: a >50% drop is an anomaly
  const maxSpike = isNum(o.maxSpikePct) ? o.maxSpikePct : 200; // default: a >200% spike is an anomaly
  if (deltaPct < -maxDrop) findings.push(finding("volume:drop", "volume", "HIGH", `row-count DROP ${deltaPct}% vs baseline (> ${maxDrop}% drop threshold)`, "investigate missing upstream data / partial load", `rowCount=${o.rowCount} baseline=${o.baseline}`));
  else if (deltaPct > maxSpike) findings.push(finding("volume:spike", "volume", "MEDIUM", `row-count SPIKE +${deltaPct}% vs baseline (> ${maxSpike}% spike threshold)`, "investigate duplicate load / unexpected backfill", `rowCount=${o.rowCount} baseline=${o.baseline}`));
  if (o.rowCount === 0) findings.push(finding("volume:empty", "volume", "HIGH", "dataset is EMPTY (0 rows) — a load likely failed", "investigate the upstream pipeline", "rowCount=0"));
  return Object.freeze({ ok: findings.length === 0, deltaPct, findings: Object.freeze(findings) });
}

/** assess(input) -> combined freshness + volume (the two previously-NOT_YET_IMPLEMENTED pillars). */
function assess(input: any): any {
  const f = assessFreshness(input); const v = assessVolume(input);
  const findings = [...f.findings, ...v.findings];
  const highFindings = findings.filter((x) => x.severity === "HIGH").length;
  return Object.freeze({ fresh: f.fresh, volumeOk: v.ok, stalenessMs: f.stalenessMs, deltaPct: v.deltaPct, clean: highFindings === 0, findings: Object.freeze(findings) });
}

const DATASET_FRESHNESS_VOLUME_CONTRACT = Object.freeze({
  id: "V124-DATASET-FRESHNESS-VOLUME",
  source: "SÉRIE 21 P4 — freshness + volume pillars (Monte Carlo 5 Pillars; closes dataset-quality-assertions NOT_YET_IMPLEMENTED)",
  completes: "the Monte Carlo 5-pillar set alongside schema (schemaCompatibility) + lineage (checkLineage) + distribution (p4-distribution-drift PSI) + quality (dataset-quality-service)",
  notAuthority: "a pure point-in-time freshness/volume detector; it reads no clock and no live data (timestamps are inputs)",
  invariants: Object.freeze([
    "freshness uses asOf + lastUpdatedAt as INPUTS (no clock) — pure; staleness > SLA (or future timestamp) ⇒ HIGH finding",
    "volume compares rowCount to a positive baseline; a drop > maxDropPct, a spike > maxSpikePct, or 0 rows ⇒ a finding",
    "fail-closed: a missing/invalid timestamp or baseline ⇒ a HIGH finding, NEVER a silent pass",
    "emits findings in the existing dataset-quality {id,area,severity,detail,remediation,evidence} shape (SARIF-ready); no new engine",
  ]),
});

module.exports = { assessFreshness, assessVolume, assess, DATASET_FRESHNESS_VOLUME_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...DATASET_FRESHNESS_VOLUME_CONTRACT, demo: assess({ asOf: 1000000, lastUpdatedAt: 900000, maxStalenessMs: 50000, rowCount: 40, baseline: 100, maxDropPct: 50 }) }, null, 2) + "\n"); }

export {};
