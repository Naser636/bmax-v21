#!/usr/bin/env node
"use strict";

/*
 * market-intelligence (mission I1) — PURE, deterministic competitive + market analyzer. It closes the V104/F1 gap
 * (competitive-analysis + market-analysis ABSENT). It analyzes ONLY the signals it is GIVEN — it NEVER fetches live data
 * (that is EXT-AUTH/owner-gated) and NEVER invents a figure: any market number must come from a provided dataPoint with a
 * source, else that output is INSUFFICIENT_DATA (anti-overclaim doctrine). Confidence is bounded by the weakest cited
 * source credibility. No I/O, no clock, no network, no randomness.
 *
 * analyze(input) → frozen {
 *   positioning:[{competitor, priceVsOurs, theirAdvantages[], ourAdvantages[]}],
 *   whitespace: string[] | "INSUFFICIENT_DATA",     // demanded features covered by NO competitor and offered by us
 *   marketSizing: { <metric>: {value, source} | "INSUFFICIENT_DATA" },
 *   opportunityScore: 0..1 | "INSUFFICIENT_DATA",
 *   confidence: "LOW"|"MEDIUM"|"HIGH",
 *   provenance: string[],                           // every figure used, with its source
 *   notes: string[]
 * }
 */

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNum(v: any): boolean { return typeof v === "number" && Number.isFinite(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function uniqSorted(xs: string[]): string[] { return Array.from(new Set(xs)).sort(); }
const CRED = Object.freeze({ LOW: 0, MEDIUM: 1, HIGH: 2 });
function credName(n: number): string { return n >= 2 ? "HIGH" : n >= 1 ? "MEDIUM" : "LOW"; }
function credVal(s: any): number { const u = isStr(s) ? s.toUpperCase() : ""; return (u in CRED) ? (CRED as any)[u] : 0; } // unknown ⇒ LOW (fail-closed)

function analyze(input: any): any {
  const inp = input && typeof input === "object" ? input : {};
  const notes: string[] = [];
  const provenance: string[] = [];
  const our = inp.ourOffer && typeof inp.ourOffer === "object" ? inp.ourOffer : null;
  const ourFeatures = our ? uniqSorted(arr(our.features).filter(isStr)) : [];
  const ourPrice = our && isNum(our.price) ? our.price : null;
  const competitors = arr(inp.competitors).filter((c) => c && isStr(c.name));

  // 1 — positioning (only from provided attributes; unknown stays unknown)
  const positioning = competitors.map((c) => {
    const a = c.attributes && typeof c.attributes === "object" ? c.attributes : {};
    const theirFeatures = uniqSorted(arr(a.features).filter(isStr));
    const priceVsOurs = (ourPrice === null || !isNum(a.price)) ? "UNKNOWN" : (a.price > ourPrice ? "WE_ARE_CHEAPER" : a.price < ourPrice ? "WE_ARE_PRICIER" : "PARITY");
    const theirAdvantages = theirFeatures.filter((f) => !ourFeatures.includes(f));
    const ourAdvantages = ourFeatures.filter((f) => !theirFeatures.includes(f));
    return Object.freeze({ competitor: c.name, priceVsOurs, theirAdvantages: Object.freeze(theirAdvantages), ourAdvantages: Object.freeze(ourAdvantages) });
  }).sort((x: any, y: any) => x.competitor.localeCompare(y.competitor));

  // 2 — whitespace: demanded features we offer that NO competitor offers
  const demanded = uniqSorted(arr(inp.demandedFeatures).filter(isStr));
  let whitespace: any = "INSUFFICIENT_DATA";
  if (demanded.length && our) {
    const competitorFeatureUnion = new Set<string>();
    competitors.forEach((c) => arr(c.attributes && c.attributes.features).filter(isStr).forEach((f: string) => competitorFeatureUnion.add(f)));
    whitespace = demanded.filter((f) => ourFeatures.includes(f) && !competitorFeatureUnion.has(f));
    whitespace = Object.freeze(whitespace);
  } else { notes.push("whitespace: needs both demandedFeatures and ourOffer.features"); }

  // 3 — market sizing: ONLY from provided dataPoints; never invented
  const dataPoints = arr(inp.market && inp.market.dataPoints).filter((d) => d && isStr(d.metric));
  const marketSizing: Record<string, any> = {};
  const requested = uniqSorted(arr(inp.market && inp.market.metricsRequested).filter(isStr));
  const metricsToReport = requested.length ? requested : uniqSorted(dataPoints.map((d) => d.metric));
  for (const metric of metricsToReport) {
    const dp = dataPoints.find((d) => d.metric === metric && isNum(d.value) && isStr(d.source));
    if (dp) { marketSizing[metric] = Object.freeze({ value: dp.value, source: dp.source, credibility: credName(credVal(dp.credibility)) }); provenance.push(`${metric}=${dp.value} [${dp.source}, ${credName(credVal(dp.credibility))}]`); }
    else { marketSizing[metric] = "INSUFFICIENT_DATA"; notes.push(`marketSizing.${metric}: no sourced numeric dataPoint provided — not invented`); }
  }

  // 4 — opportunity score (deterministic) + confidence (weakest cited source)
  let opportunityScore: any = "INSUFFICIENT_DATA";
  const haveMarket = Object.values(marketSizing).some((v) => v !== "INSUFFICIENT_DATA");
  if (our && competitors.length && (Array.isArray(whitespace))) {
    const wsSignal = Math.min(1, whitespace.length / Math.max(1, demanded.length));          // coverage of unmet demand
    const priceSignal = positioning.length ? positioning.filter((p: any) => p.priceVsOurs === "WE_ARE_CHEAPER").length / positioning.length : 0;
    const dataSignal = haveMarket ? 1 : 0;
    opportunityScore = Math.round(((0.5 * wsSignal) + (0.3 * priceSignal) + (0.2 * dataSignal)) * 10000) / 10000;
  } else { notes.push("opportunityScore: needs ourOffer + >=1 competitor + demandedFeatures"); }

  const citedCreds = dataPoints.filter((d) => isNum(d.value) && isStr(d.source)).map((d) => credVal(d.credibility));
  const confidence = citedCreds.length ? credName(Math.min(...citedCreds)) : "LOW";
  if (!citedCreds.length) notes.push("confidence LOW: no sourced market data cited");

  return Object.freeze({
    positioning: Object.freeze(positioning),
    whitespace,
    marketSizing: Object.freeze(marketSizing),
    opportunityScore,
    confidence,
    provenance: Object.freeze(provenance),
    notes: Object.freeze(uniqSorted(notes)),
    liveDataFetched: false,
  });
}

module.exports = { analyze, credName };
export {};
