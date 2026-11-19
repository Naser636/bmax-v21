#!/usr/bin/env node
"use strict";
/* Tests for odg-crm-segmentation (client-book segmentation, D14). PURE. */
const S = require("./odg-crm-segmentation.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const POLICY = {
  valueTiers: [{ label: "A", minMinor: 10000000 }, { label: "B", minMinor: 1000000 }, { label: "C", minMinor: 1 }], // supplied by caller
  categorical: [{ name: "sector", field: "sector" }],
  recency: { field: "lastContactDay", windows: [{ label: "ACTIVE", maxDaysSince: 30 }, { label: "LAPSING", maxDaysSince: 90 }] },
};
function clients(): any[] { return [
  { id: "c1", totalValueMinor: 25000000, sector: "plomberie", lastContactDay: 95 }, // A, plomberie, ACTIVE(100-95=5)
  { id: "c2", totalValueMinor: 5000000, sector: "elec", lastContactDay: 10 },        // B, elec, LAPSING(90)
  { id: "c3", totalValueMinor: 500, sector: "plomberie" },                            // C (value 500>=1), plomberie, recency UNSEGMENTED(no lastContact)
  { id: "c4", sector: "maconnerie", lastContactDay: 100 },                            // value UNSEGMENTED(no value), maconnerie, ACTIVE(0)
]; }

function main(): void {
  const res = S.segmentClients(clients(), POLICY, { asOfDay: 100 });
  const c = (id: string) => res.clients.find((x: any) => x.id === id).segments;
  check("ok, dimensions = [value, sector, recency]", res.ok === true && JSON.stringify(res.dimensions) === JSON.stringify(["value", "sector", "recency"]));

  // value tier: highest tier the supplied value clears (A≥10M, B≥1M, C≥1)
  check("c1 value A (25M ≥ 10M)", c("c1").value === "A");
  check("c2 value B (5M: ≥1M, <10M)", c("c2").value === "B");
  check("c3 value C (500 ≥ 1)", c("c3").value === "C");
  check("c4 value UNSEGMENTED (no totalValueMinor — not forced)", c("c4").value === S.UNSEGMENTED);

  // categorical: verbatim field value; missing ⇒ UNSEGMENTED
  check("categorical sector verbatim", c("c1").sector === "plomberie" && c("c2").sector === "elec" && c("c4").sector === "maconnerie");

  // recency: daysSince = asOfDay - lastContactDay, first window it fits; missing ⇒ UNSEGMENTED
  check("c1 recency ACTIVE (100-95=5 ≤30)", c("c1").recency === "ACTIVE");
  check("c2 recency LAPSING (100-10=90 ≤90, >30)", c("c2").recency === "LAPSING");
  check("c3 recency UNSEGMENTED (no lastContactDay — not guessed)", c("c3").recency === S.UNSEGMENTED);
  check("c4 recency ACTIVE (100-100=0)", c("c4").recency === "ACTIVE");

  // future lastContact ⇒ UNSEGMENTED (never negative daysSince)
  check("future lastContactDay ⇒ UNSEGMENTED", S.segmentClients([{ id: "f", lastContactDay: 200 }], { recency: POLICY.recency }, { asOfDay: 100 }).clients[0].segments.recency === S.UNSEGMENTED);
  // beyond widest window ⇒ UNSEGMENTED (not forced into LAPSING)
  check("beyond widest window ⇒ UNSEGMENTED", S.segmentClients([{ id: "d", lastContactDay: 0 }], { recency: POLICY.recency }, { asOfDay: 500 }).clients[0].segments.recency === S.UNSEGMENTED);
  // below lowest value tier ⇒ UNSEGMENTED (policy gap, not guessed) — tiers min 1, value 0
  check("value 0 (below lowest tier min 1) ⇒ UNSEGMENTED", S.segmentClients([{ id: "z", totalValueMinor: 0 }], { valueTiers: POLICY.valueTiers }, {}).clients[0].segments.value === S.UNSEGMENTED);

  // rollups are COUNTS (not fabricated revenue)
  check("rollups value: A1 B1 C1 UNSEGMENTED1", res.rollups.value.A === 1 && res.rollups.value.B === 1 && res.rollups.value.C === 1 && res.rollups.value.UNSEGMENTED === 1);
  check("rollups sector: plomberie 2", res.rollups.sector.plomberie === 2);
  check("rollups recency: ACTIVE2 LAPSING1 UNSEGMENTED1", res.rollups.recency.ACTIVE === 2 && res.rollups.recency.LAPSING === 1 && res.rollups.recency.UNSEGMENTED === 1);

  // recency without asOfDay ⇒ all UNSEGMENTED (no clock, never invents a date)
  check("recency without asOfDay ⇒ UNSEGMENTED (no clock)", S.segmentClients(clients(), { recency: POLICY.recency }, {}).clients[0].segments.recency === S.UNSEGMENTED);

  // fail-closed
  check("no clients ⇒ NO_CLIENTS", S.segmentClients([], POLICY, {}).code === "NO_CLIENTS");
  check("no policy ⇒ NO_POLICY", S.segmentClients(clients(), null, {}).code === "NO_POLICY");
  check("empty policy (no dimensions) ⇒ NO_DIMENSIONS", S.segmentClients(clients(), {}, {}).code === "NO_DIMENSIONS");
  check("bad value tier (no minMinor) ⇒ BAD_VALUE_TIERS", S.segmentClients(clients(), { valueTiers: [{ label: "X" }] }, {}).code === "BAD_VALUE_TIERS");
  check("bad recency window ⇒ BAD_RECENCY", S.segmentClients(clients(), { recency: { field: "lastContactDay", windows: [{ label: "W" }] } }, {}).code === "BAD_RECENCY");

  // determinism + frozen + contract
  check("deterministic", JSON.stringify(S.segmentClients(clients(), POLICY, { asOfDay: 100 })) === JSON.stringify(res));
  check("frozen", Object.isFrozen(res) && Object.isFrozen(res.clients) && Object.isFrozen(res.rollups) && Object.isFrozen(res.clients[0].segments));
  check("contract: caller thresholds, no fabricated value, missing⇒UNSEGMENTED, segment≠priority",
    S.CRM_SEGMENTATION_CONTRACT.invariants.some((s: string) => /CALLER-supplied/.test(s)) &&
    S.CRM_SEGMENTATION_CONTRACT.invariants.some((s: string) => /no revenue is fabricated/.test(s)) &&
    S.CRM_SEGMENTATION_CONTRACT.invariants.some((s: string) => /never forced into a bucket/.test(s)) &&
    S.CRM_SEGMENTATION_CONTRACT.invariants.some((s: string) => /NOT a priority/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-crm-segmentation (D14 client-book segmentation: caller-declared value/categorical/recency dimensions; highest-tier-cleared value, recency daysSince windows; missing attr or out-of-bucket ⇒ UNSEGMENTED never guessed; rollups=counts not revenue; no clock; segment≠priority; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
