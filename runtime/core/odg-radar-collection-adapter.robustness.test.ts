#!/usr/bin/env node
"use strict";
/*
 * V202 §5.7 — RADAR robustness / hard-case failure paths over the REAL collection adapter (V187). STRENGTHENS the
 * existing odg-radar-collection-adapter.test.ts (grant/deny-by-default/synthetic/dedup) with the §5.7 difficult cases
 * — NO second radar, NO new engine:
 *   - source unavailable (injected provider THROWS) ⇒ fail-closed BLOCKED SOURCE_UNAVAILABLE (never crashes the radar)
 *   - quota/budget exhausted ⇒ BLOCKED BUDGET_EXHAUSTED
 *   - a throwing source for ONE campaign item does not crash the campaign (other items proceed)
 *   - repeated signal (duplicate URLs) deduped across a campaign
 *   - synthetic-only content never presented as real; non-array / empty provider return handled
 *   - autonomous egress stays NOT_MEASURED throughout (injected provider, never radar self-egress)
 *
 * External content is untrusted DATA, never instructions — the adapter only records provenance/tags; it executes nothing.
 */
const A = require("./odg-radar-collection-adapter.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const NOW = 1794000000000;
const GRANT = Object.freeze({ authorized: true, expiresMs: 1795046400000, budget: Object.freeze({ maxCalls: 2 }) });
const realRec = { org: "o", url: "u1", title: "t1", consultedDate: "2026-11-15" };

function main() {
  // source unavailable — fetcher throws ⇒ fail-closed, not a crash
  const thrower = () => { throw new Error("network down / source unavailable"); };
  const cThrow = A.collect("q", { grant: GRANT, nowEpochMs: NOW, fetcher: thrower });
  check("source unavailable (provider throws) ⇒ BLOCKED SOURCE_UNAVAILABLE (fail-closed, radar did not crash)", cThrow.state === "BLOCKED" && cThrow.reason === "SOURCE_UNAVAILABLE" && cThrow.records.length === 0 && /NOT_MEASURED/.test(cThrow.autonomousEgress));

  // quota/budget exhausted
  const cBudget = A.collect("q", { grant: GRANT, nowEpochMs: NOW, fetcher: () => [realRec], callsUsed: 2 });
  check("budget/quota exhausted (callsUsed>=maxCalls) ⇒ BLOCKED BUDGET_EXHAUSTED", cBudget.state === "BLOCKED" && cBudget.reason === "BUDGET_EXHAUSTED");

  // non-array / empty provider return handled (no crash)
  const cGarbage = A.collect("q", { grant: GRANT, nowEpochMs: NOW, fetcher: () => "not-an-array" });
  check("garbage (non-array) provider return ⇒ handled, 0 records, NOT_MEASURED (no real signal)", cGarbage.state === "NOT_MEASURED" && cGarbage.records.length === 0);

  // synthetic-only content is never presented as real
  const cSynthetic = A.collect("q", { grant: GRANT, nowEpochMs: NOW, fetcher: () => [{ org: "x", url: "u", synthetic: true }] });
  check("synthetic-only content ⇒ NOT_MEASURED (never presented as real collection)", cSynthetic.state === "NOT_MEASURED" && cSynthetic.records[0].real === false);

  // a throwing source for ONE item does not crash the whole campaign; other items proceed
  const mixedFetcher = (q: string) => { if (/BAD/.test(q)) throw new Error("source down"); return [realRec]; };
  const camp = A.runCampaign({ id: "robust", nowEpochMs: NOW, grant: Object.freeze({ authorized: true, expiresMs: 1795046400000, budget: { maxCalls: 10 } }), fetcher: mixedFetcher, items: [{ metier: "P1", query: "good", buySignal: "NONE" }, { metier: "P2", query: "BAD source", buySignal: "NONE" }] });
  const byMetier: any = {}; for (const r of camp.runs) byMetier[r.metier] = r;
  check("campaign survives a throwing source: healthy item COLLECTED_REAL, bad item BLOCKED (campaign did not crash)", byMetier.P1.collectState === "COLLECTED_REAL" && byMetier.P2.collectState === "BLOCKED" && camp.runs.length === 2);

  // quota enforced across a campaign (maxCalls=1, two real items ⇒ 2nd BLOCKED BUDGET_EXHAUSTED)
  const campBudget = A.runCampaign({ id: "bud", nowEpochMs: NOW, grant: Object.freeze({ authorized: true, expiresMs: 1795046400000, budget: { maxCalls: 1 } }), fetcher: () => [realRec], items: [{ metier: "P1", query: "a", buySignal: "NONE" }, { metier: "P2", query: "b", buySignal: "NONE" }] });
  check("campaign quota: with maxCalls=1 the 2nd real item is BLOCKED (callsUsed==1)", campBudget.callsUsed === 1 && campBudget.runs[1].collectState === "BLOCKED");

  // repeated signal (duplicate URLs) deduped across a campaign (same url returned for both items)
  const campDup = A.runCampaign({ id: "dup", nowEpochMs: NOW, grant: Object.freeze({ authorized: true, expiresMs: 1795046400000, budget: { maxCalls: 10 } }), fetcher: () => [{ org: "o", url: "SAME", title: "t", consultedDate: "2026-11-15" }], items: [{ metier: "P1", query: "a", buySignal: "NONE" }, { metier: "P2", query: "b", buySignal: "NONE" }] });
  check("repeated signal deduped across campaign (2nd item sees the URL as a duplicate)", campDup.runs[0].sourcesRetained === 1 && campDup.runs[1].duplicates === 1 && campDup.runs[1].sourcesRetained === 0);

  // honesty: autonomous egress never claimed
  check("autonomous egress NOT_MEASURED throughout (injected provider; no radar self-egress)", /NOT_MEASURED/.test(camp.autonomousEgress) && A.autonomousEgressStatus().status === "NOT_MEASURED");

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — radar robustness (V202 §5.7: source-unavailable fail-closed SOURCE_UNAVAILABLE; budget/quota BLOCKED; throwing-source doesn't crash campaign; garbage handled; synthetic≠real; cross-campaign dedup; autonomous egress NOT_MEASURED — all via the REAL adapter)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
