#!/usr/bin/env node
"use strict";
/* V187 — radar-owned collection adapter. Proves: deny-by-default (no injected provider ⇒ BLOCKED); grant validated
 * (expiry/budget); radar owns collect→qualify→propose; COLLECTED_REAL only with a real provider; autonomous egress
 * NOT_MEASURED; PROPOSED ≠ authorized; no second radar. */
const A = require("./odg-radar-collection-adapter.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const NOW = 1794000000000;
const GRANT = { authorized: true, expiresMs: 1795046400000, budget: { maxCalls: 200 } };
const realFetcher = (q: string) => [{ org: "ISO", title: "t", url: "https://iso.org/" + q, consultedDate: "2026-11-13" }];

function main() {
  // grant validation
  check("grant valid before expiry", A.validateGrant(GRANT, NOW).ok === true);
  check("grant expired ⇒ invalid", A.validateGrant(GRANT, 1795046400001).ok === false && A.validateGrant(GRANT, 1795046400001).code === "GRANT_EXPIRED");
  check("no grant ⇒ invalid", A.validateGrant(null, NOW).ok === false);

  // deny-by-default collection
  check("no injected provider ⇒ BLOCKED (radar does not self-egress)", A.collect("q", { grant: GRANT, nowEpochMs: NOW }).state === "BLOCKED" && A.collect("q", { grant: GRANT, nowEpochMs: NOW }).reason === "NO_INJECTED_PROVIDER");
  check("expired grant ⇒ BLOCKED even with a provider", A.collect("q", { grant: GRANT, nowEpochMs: 1795046400001, fetcher: realFetcher }).state === "BLOCKED");
  check("real injected provider ⇒ COLLECTED_REAL with provenance + providerTag", (() => { const c = A.collect("q", { grant: GRANT, nowEpochMs: NOW, fetcher: realFetcher }); return c.state === "COLLECTED_REAL" && c.records[0].real === true && /injected authorized provider/.test(c.records[0].providerTag); })());
  check("synthetic-only records ⇒ NOT_MEASURED (not presented as real)", A.collect("q", { grant: GRANT, nowEpochMs: NOW, fetcher: () => [{ org: "x", url: "u", synthetic: true }] }).state === "NOT_MEASURED");
  check("every collect result reports autonomousEgress NOT_MEASURED", /NOT_MEASURED/.test(A.collect("q", { grant: GRANT, nowEpochMs: NOW, fetcher: realFetcher }).autonomousEgress));

  // campaign pipeline (radar owns it)
  const camp = A.runCampaign({ id: "t", nowEpochMs: NOW, grant: GRANT, fetcher: realFetcher, items: [{ metier: "P10", query: "P10", buySignal: "REGULATORY_DEADLINE", segmentFit: 4, budgetEvidence: "OBSERVED", regulatoryUrgency: 5 }] });
  check("campaign: real collection ⇒ ANALYZED_REAL + QUALIFIED_REAL, opportunity PROPOSED (not authorized)", camp.runs[0].collectState === "COLLECTED_REAL" && camp.runs[0].analyzed === "ANALYZED_REAL" && camp.runs[0].qualified === "QUALIFIED_REAL" && camp.runs[0].opportunityVerdict === "PROPOSED");
  check("campaign reliability uses radar.validationTier (regulatory+observed ⇒ VALIDATED_MARKET_SIGNAL)", camp.runs[0].reliability === "VALIDATED_MARKET_SIGNAL");
  check("campaign writes nothing canonical / executes nothing (PROPOSED only)", /no canonical write; no execution/.test(camp.note) && /NOT_MEASURED/.test(camp.autonomousEgress));

  // dedup
  check("dedup catches repeated URLs", (() => { const seen = new Set(); const d1 = A.dedup([{ url: "a" }, { url: "b" }], seen); const d2 = A.dedup([{ url: "a" }], seen); return d1.fresh.length === 2 && d2.dupCount === 1; })());

  // autonomous egress + contract
  check("autonomousEgressStatus = NOT_MEASURED + OWNER_GATED runtime binding", A.autonomousEgressStatus().status === "NOT_MEASURED" && A.autonomousEgressStatus().ownerGated === true);
  check("contract: not-a-second-radar, deny-by-default, radar-owns-path, self-egress NOT_MEASURED", A.RADAR_COLLECTION_ADAPTER_CONTRACT.invariants.some((i: string) => /NOT a second radar/.test(i)) && A.RADAR_COLLECTION_ADAPTER_CONTRACT.invariants.some((i: string) => /deny-by-default/.test(i)) && A.RADAR_COLLECTION_ADAPTER_CONTRACT.invariants.some((i: string) => /autonomous self-egress = NOT_MEASURED/.test(i)));
  check("deterministic", JSON.stringify(A.runCampaign({ id: "t", nowEpochMs: NOW, grant: GRANT, fetcher: realFetcher, items: [{ metier: "P10", query: "P10", buySignal: "REGULATORY_DEADLINE", segmentFit: 4, budgetEvidence: "OBSERVED", regulatoryUrgency: 5 }] }).byVerdict) === JSON.stringify(camp.byVerdict));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — radar-collection-adapter (V187: radar-OWNED collection interface; deny-by-default [no injected provider⇒BLOCKED]; grant validated; COLLECTED_REAL→ANALYZED_REAL→QUALIFIED_REAL→PROPOSED via radar.validationTier + V184 gate; autonomous self-egress NOT_MEASURED/OWNER_GATED; no second radar; no canonical write/execution)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
