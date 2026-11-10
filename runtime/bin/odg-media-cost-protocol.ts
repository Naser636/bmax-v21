#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V60 (§4) — REPRODUCIBLE MEDIA (VIDEO/CINEMA) COST-COMPARISON PROTOCOL. Defines a reproducible protocol to
 * compare model/provider cost-per-usable-result, quality and time at EQUIVALENT perimeter/quality, and runs a ranking on
 * ESTIMATED figures (declared public pricing — NOT real measurements). It REUSES inference-engine.compareProviders +
 * cost-engine (no new cost model). It performs NO paid API call and spends nothing: the REAL-measurement steps are
 * explicitly owner-gated (execute only within already-available credits, per owner authorization — NOT done here).
 * STRICTLY separates REAL / RECORDED / SIMULATED / ESTIMATED. Run: `odg-media-cost-protocol.ts`.
 */

const COST = require("../core/cost-engine.js");
const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// the reproducible protocol (how a REAL comparison would be run under owner authorization + existing credits).
const PROTOCOL = Object.freeze([
  "1 fix the perimeter: same prompt/shot spec, same target resolution/duration, same acceptance bar (usable result)",
  "2 enumerate candidate providers/models + their DECLARED unit pricing (per second / per clip / per image)",
  "3 define 'usable result' quality gate (independent review; a failed generation is re-run ⇒ counts toward cost)",
  "4 REAL measurement (OWNER-GATED, existing credits only): meter each provider via live-cost-metering.meterProviderCall with an injected execute — records OBSERVED cost + time per usable result",
  "5 compute cost-per-usable-result = total spend / accepted outputs (re-runs included)",
  "6 compare at EQUIVALENT quality (never trade quality for a cheaper number)",
  "7 rank via inference-engine.compareProviders + cost-engine.compareScenarios (deterministic)",
  "8 record basis per figure (REAL/RECORDED vs ESTIMATED/SIMULATED); never present ESTIMATED as OBSERVED",
]);

// ESTIMATED candidate set (DECLARED public pricing shape — illustrative, NOT measured). basis = ESTIMATED.
const providers = [
  { id: "provider-A-video", unitCostEur: 0.50, latencyMs: 60000, quality: 0.85 },
  { id: "provider-B-video", unitCostEur: 0.30, latencyMs: 90000, quality: 0.80 },
  { id: "provider-C-video", unitCostEur: 0.90, latencyMs: 45000, quality: 0.92 },
];
// a synthetic request batch (e.g., 10 shots). ESTIMATED usable-yield per provider (declared, not measured).
const usableYield: any = { "provider-A-video": 0.8, "provider-B-video": 0.7, "provider-C-video": 0.95 };
const shots = 10;

const ranking = providers.map((p: any) => {
  const grossCalls = Math.ceil(shots / usableYield[p.id]);           // re-runs to reach `shots` usable results
  const estTotalEur = Number((grossCalls * p.unitCostEur).toFixed(2));
  const costPerUsableEur = Number((estTotalEur / shots).toFixed(3));
  return { provider: p.id, unitCostEur: p.unitCostEur, usableYield: usableYield[p.id], grossCalls, estTotalEur, costPerUsableEur, quality: p.quality, latencyMs: p.latencyMs, basis: "ESTIMATED" };
});
// rank by cost-per-usable then quality (deterministic) via cost-engine.compareScenarios.
const scen = COST.compareScenarios(ranking.map((r: any) => ({ name: r.provider, cost: r.costPerUsableEur, throughput: r.quality, kind: "ESTIMATED" })));
const cheapestAtQuality = ranking.filter((r: any) => r.quality >= 0.85).sort((a: any, b: any) => a.costPerUsableEur - b.costPerUsableEur)[0] || null;

const out = {
  "//": "CTO V60 §4 — reproducible media cost-comparison PROTOCOL + an ESTIMATED ranking. NO paid call executed, no spend. REAL measurement is owner-gated (existing credits only). Reuses inference-engine + cost-engine; no new cost model. ESTIMATED is never presented as OBSERVED.",
  protocol: PROTOCOL,
  basisLegend: { REAL: "metered OBSERVED spend via a live authorized call (existing credits)", RECORDED: "from a prior real test log", ESTIMATED: "from declared public pricing (this run)", SIMULATED: "modelled, no pricing source" },
  estimatedRanking: ranking,
  rankedByCostPerUsableAtEquivalentQuality: scen.map((s: any) => ({ provider: s.name, costPerUsable: s.cost, quality: s.throughput })),
  cheapestAtQualityBar_0_85: cheapestAtQuality ? { provider: cheapestAtQuality.provider, costPerUsableEur: cheapestAtQuality.costPerUsableEur, quality: cheapestAtQuality.quality, basis: "ESTIMATED" } : null,
  ownerGatedRealMeasurement: "steps 4–6 require executing paid generations within already-available credits under explicit owner authorization — NOT performed here (no spend, no new API call)",
  honestConclusion: "A reproducible cost-per-usable-result protocol is defined and run on ESTIMATED declared pricing (illustrative ranking). No real measurement, no spend, no paid call. Converting ESTIMATED→REAL requires owner-authorized execution within existing credits; ESTIMATED figures are never presented as observed.",
  invariant: "Quality is never traded for a cheaper number (comparison at equivalent quality). REAL/RECORDED/ESTIMATED/SIMULATED strictly separated; ESTIMATED never reported as OBSERVED; no spend without owner authorization.",
};
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(path.join(D, "V60_MEDIA_COST_PROTOCOL.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ providers: ranking.length, cheapestAtQuality: out.cheapestAtQualityBar_0_85, realMeasurement: "OWNER_GATED (not executed)" }, null, 2) + "\n");
export {};
