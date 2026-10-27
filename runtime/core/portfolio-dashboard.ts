#!/usr/bin/env node
/**
 * portfolio-dashboard — ONE consolidated read-model (V25 Priority 3) that COMPOSES the existing modules; it
 * duplicates none of them and invents no data:
 *   - portfolio-axes.assessWorkstreams        → six-axis A–F status + invariant violations
 *   - pipeline-forecast.forecast              → realized cash (actual) SEPARATE from weighted open pipeline (forecast)
 *   - enterprise-mission-model.assessMission  → axis-E mission sizing (priced scope, NOT sold)
 *   - certification-traceability.buildTraceability → axis-F readiness (NOT_CERTIFIED) + gaps + stale
 *   - reuse-ledger.loadLedger                 → learning-loop aggregate (assets / suppressed / outcomes)
 *
 * HARD HONESTY RULES (mandate): forecast ≠ cash — `actual.netCollected` counts ONLY independently-evidenced
 * collections (default €0; never the weighted pipeline); readiness ≠ certification; a section with no input is
 * NO_DATA (unknown stays unknown, not filled with zeros that would read as real). The €500k gap is measured
 * against ACTUAL collected net only. Pure/deterministic read-model; each composed module keeps its own fail-closed
 * behaviour. This is a VIEW — it changes nothing and claims nothing is sold, collected, or certified.
 */
"use strict";

const AXES = require("./portfolio-axes.js");
const FORECAST = require("./pipeline-forecast.js");
const ENT = require("./enterprise-mission-model.js");
const TRACE = require("./certification-traceability.js");
const RL = require("./reuse-ledger.js");

const NET_TARGET_DEFAULT = 500000;   // €500k NET cash target (binding; never lowered to fit a forecast)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function r2(x: number): number { return Math.round(x * 100) / 100; }

/** learning-loop aggregate over the reuse-ledger (pure read via loadLedger). */
function learningSummary(opts: any): any {
  const ledger = RL.loadLedger(opts || {});
  const assets = isObj(ledger.assets) ? Object.values(ledger.assets) : [];
  const sum: any = assets.reduce((a: any, x: any) => ({
    totalUses: a.totalUses + (x.uses || 0),
    validated: a.validated + (x.validated || 0),
    failed: a.failed + (x.failed || 0),
    inconclusive: a.inconclusive + (x.inconclusive || 0),
    suppressed: a.suppressed + (x.suppressed ? 1 : 0),
  }), { totalUses: 0, validated: 0, failed: 0, inconclusive: 0, suppressed: 0 });
  return { assets: assets.length, ...sum, suppressedSignatures: RL.suppressedSignatures(opts || {}) };
}

/**
 * buildDashboard(input): compose the unified portfolio + readiness view.
 * input: { workstreams, opportunities, missions, certification:{gatedSuites,evidence,evidenceDates,now,ttlDays},
 *          collectedNet, netTarget, reuseLedgerOpts }. Missing section inputs ⇒ NO_DATA (never invented).
 */
function buildDashboard(input: any = {}): any {
  const netTarget = typeof input.netTarget === "number" && input.netTarget > 0 ? input.netTarget : NET_TARGET_DEFAULT;

  // Six-axis status (invariant-checked).
  const axes = input.workstreams !== undefined ? AXES.assessWorkstreams(input.workstreams) : { status: "NO_DATA" };

  // Forecast — realized cash SEPARATE from weighted open pipeline.
  const forecast = input.opportunities !== undefined ? FORECAST.forecast(input.opportunities, input.forecastOpts || {}) : { status: "NO_DATA" };

  // Axis-E enterprise mission sizing + delivery capacity (V28). Consumes the FULL enterprise-mission-model output:
  // scope-derived price, delivery hours, capacity (available vs required), margin, and flags (incl. PRICE_EXCEEDS_SCOPE
  // + CAPACITY_EXCEEDED). A modeled mission is NOT a qualified opportunity, a signed contract, or collected cash.
  const enterprise = Array.isArray(input.missions)
    ? input.missions.map((m: any) => {
        const a = ENT.assessMission(m);
        if (!a.ok) return { ref: (m && m.ref) || null, error: a.code };
        return {
          ref: m.ref || null,
          justifiedPrice: a.justifiedPrice, proposedPrice: a.proposedPrice, priceJustified: a.priceJustified,
          totalHours: a.totalHours, soloCapacityHours: a.soloCapacityHours, capacityExceeded: a.capacityExceeded,
          grossMargin: a.grossMargin, marginPct: a.marginPct,
          flags: a.flags,
          stage: "MODELED",   // modeled ≠ qualified ≠ signed ≠ collected
        };
      })
    : { status: "NO_DATA" };
  const enterpriseSummary = Array.isArray(enterprise)
    ? {
        count: enterprise.length,
        modeled: enterprise.length,                         // all are MODELED (none qualified/signed/collected)
        totalJustifiedPrice: r2(enterprise.reduce((s: number, e: any) => s + (e.justifiedPrice || 0), 0)),
        totalProposedPrice: r2(enterprise.reduce((s: number, e: any) => s + (e.proposedPrice || 0), 0)),
        capacityShortfalls: enterprise.filter((e: any) => e.capacityExceeded === true).map((e: any) => e.ref),
        priceNotJustified: enterprise.filter((e: any) => e.priceJustified === false).map((e: any) => e.ref),
        flagged: enterprise.filter((e: any) => Array.isArray(e.flags) && e.flags.length > 0).map((e: any) => ({ ref: e.ref, flags: e.flags })),
        stageDistinction: "MODELED missions only — NOT qualified opportunities, NOT signed contracts, NOT collected cash. Taxes/social charges are NOT in grossMargin — they are separate estimates requiring qualified professional validation (net via net-cash-model).",
      }
    : { status: "NO_DATA" };

  // Axis-F certification readiness.
  const certification = isObj(input.certification)
    ? (() => { const t = TRACE.buildTraceability(input.certification); return t.ok ? { certificationStatus: t.certificationStatus, summary: t.summary, byState: t.byState, remediationCount: t.remediation.length } : { status: "INVALID_INPUT", code: t.code }; })()
    : { status: "NO_DATA" };

  // Learning loop aggregate.
  const learning = learningSummary(input.reuseLedgerOpts);

  // ACTUAL vs FORECAST — the central honesty boundary.
  const collectedNet = typeof input.collectedNet === "number" && input.collectedNet >= 0 ? input.collectedNet : 0;
  const weightedPipeline = (forecast as any).weightedOpenPipeline;  // forecast only — NOT cash
  const realizedCashInForecast = (forecast as any).realizedCash;    // modelled CASHED entries (still a model, not evidenced receipts)
  const cashVsForecast = {
    actualNetCollected: r2(collectedNet),                           // ONLY independently-evidenced receipts (default €0)
    netTarget,
    gapToTarget: r2(Math.max(0, netTarget - collectedNet)),
    forecastWeightedPipeline: typeof weightedPipeline === "number" ? weightedPipeline : null,
    modelledRealizedCash: typeof realizedCashInForecast === "number" ? realizedCashInForecast : null,
    note: "actualNetCollected counts ONLY independently-evidenced receipts (default €0). forecastWeightedPipeline and modelledRealizedCash are MODEL outputs, NOT cash. The €500k gap is measured against actual collected net only.",
  };

  return {
    ok: true,
    axes, forecast, enterprise, enterpriseSummary, certification, learning,
    cashVsForecast,
    notes: [
      "This is a read-model VIEW: it sells nothing, collects nothing, certifies nothing. Forecast ≠ cash; readiness ≠ certification.",
      "Sections with no supplied input are NO_DATA — unknown stays unknown, never filled with zeros that would read as real.",
      "€500k NET target is binding and never lowered to fit a forecast; the gap is quantified against actual collected net.",
    ],
  };
}

export { buildDashboard, learningSummary, NET_TARGET_DEFAULT };
module.exports = { buildDashboard, learningSummary, NET_TARGET_DEFAULT };

// Read-only CLI: print the composition + honesty rules; mutates nothing.
if (require.main === module) {
  process.stdout.write(JSON.stringify({ model: "portfolio-dashboard/1", composes: ["portfolio-axes", "pipeline-forecast", "enterprise-mission-model", "certification-traceability", "reuse-ledger"], rules: ["forecast≠cash", "readiness≠certification", "no-input⇒NO_DATA", "€500k never lowered"] }, null, 2) + "\n");
}
