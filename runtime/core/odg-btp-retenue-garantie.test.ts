#!/usr/bin/env node
"use strict";
/* Tests for odg-btp-retenue-garantie (BTP guarantee retention + release). PURE. Composes REAL odg-gregorian-calendar. */
const M = require("./odg-btp-retenue-garantie.js");
const CAL = require("./odg-gregorian-calendar.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const W = (i: any) => M.withholdOnSituation(i);
const R = (i: any) => M.releaseState(i);

function main(): void {
  // withholding: retained = round(gross × rate); net = gross − retained
  const w = W({ chantierId: "C1", situationRef: "S1", grossSituationHTMinor: 100000, retentionRate: 0.05 });
  check("5% on 1000.00€ ⇒ retained 50.00€, net 950.00€, cumulative 50.00€", w.retainedThisMinor === 5000 && w.netToPayHTMinor === 95000 && w.cumulativeRetainedMinor === 5000);
  check("identifiers passed through", w.chantierId === "C1" && w.situationRef === "S1");
  // caution bancaire ⇒ nothing withheld (disclosed)
  const caution = W({ grossSituationHTMinor: 100000, retentionRate: 0.05, cautionSubstituted: true });
  check("caution bancaire ⇒ retained 0, net = gross, disclosed", caution.retainedThisMinor === 0 && caution.netToPayHTMinor === 100000 && caution.cautionSubstituted === true && /caution bancaire substitutes/.test(caution.note));
  // cumulative = previous + this (no double-count)
  check("cumulative = previous + this (5000 + 3000 = 8000)", W({ grossSituationHTMinor: 60000, retentionRate: 0.05, previouslyRetainedMinor: 5000 }).cumulativeRetainedMinor === 8000);
  // rounding (round-half)
  check("round-half: 33333 × 0.05 = 1666.65 ⇒ 1667", W({ grossSituationHTMinor: 33333, retentionRate: 0.05 }).retainedThisMinor === 1667);
  // rate 1 ⇒ net 0; rate 0 ⇒ nothing retained
  check("rate 1.0 ⇒ all retained, net 0", W({ grossSituationHTMinor: 100000, retentionRate: 1 }).netToPayHTMinor === 0);
  check("rate 0 ⇒ nothing retained", W({ grossSituationHTMinor: 100000, retentionRate: 0 }).retainedThisMinor === 0);

  // FAIL-CLOSED: the 5% retenue légale is NOT assumed
  check("missing rate ⇒ NO_RATE (5% not assumed)", W({ grossSituationHTMinor: 100000 }).code === "NO_RATE");
  check("rate > 1 ⇒ BAD_RATE", W({ grossSituationHTMinor: 100000, retentionRate: 1.5 }).code === "BAD_RATE");
  check("negative rate ⇒ BAD_RATE", W({ grossSituationHTMinor: 100000, retentionRate: -0.1 }).code === "BAD_RATE");
  check("negative/float gross ⇒ BAD_GROSS", W({ grossSituationHTMinor: -1, retentionRate: 0.05 }).code === "BAD_GROSS" && W({ grossSituationHTMinor: 1.5, retentionRate: 0.05 }).code === "BAD_GROSS");
  check("bad previous ⇒ BAD_PREVIOUS", W({ grossSituationHTMinor: 100000, retentionRate: 0.05, previouslyRetainedMinor: -1 }).code === "BAD_PREVIOUS");
  check("non-object ⇒ BAD_INPUT", W(null).code === "BAD_INPUT");

  // release state: releaseDate = reception + warranty (via the REAL calendar)
  const rel = R({ receptionDate: "2026-01-15", warrantyPeriodDays: 365, cumulativeRetainedMinor: 8000, reservesLifted: true, asOfDate: "2027-02-01" });
  check("releaseDate = reception + 365 = 2027-01-15 (via odg-gregorian-calendar)", rel.releaseDate === "2027-01-15");
  check("release date equals calendar.addDays", (() => { const a = CAL.addDays(2026, 1, 15, 365); return rel.releaseDate === `${a.y}-01-15`; })());
  check("reserves lifted + delay elapsed ⇒ RELEASABLE, releasable = cumulative", rel.status === "RELEASABLE" && rel.releasableMinor === 8000);
  // reserves NOT lifted ⇒ BLOCKED, nothing releasable (even if the delay elapsed)
  check("reserves NOT lifted ⇒ BLOCKED_RESERVES, releasable 0", (() => { const r = R({ receptionDate: "2026-01-15", warrantyPeriodDays: 365, cumulativeRetainedMinor: 8000, reservesLifted: false, asOfDate: "2027-02-01" }); return r.status === "BLOCKED_RESERVES" && r.releasableMinor === 0; })());
  // delay NOT elapsed ⇒ PENDING, releasable 0
  check("delay not elapsed (asOf < releaseDate) ⇒ PENDING_DELAY, releasable 0", (() => { const r = R({ receptionDate: "2026-01-15", warrantyPeriodDays: 365, cumulativeRetainedMinor: 8000, reservesLifted: true, asOfDate: "2026-06-01" }); return r.status === "PENDING_DELAY" && r.releasableMinor === 0; })());
  // boundary asOf == releaseDate ⇒ RELEASABLE
  check("asOf == releaseDate ⇒ RELEASABLE (delay elapsed on the day)", R({ receptionDate: "2026-01-15", warrantyPeriodDays: 365, cumulativeRetainedMinor: 8000, reservesLifted: true, asOfDate: "2027-01-15" }).status === "RELEASABLE");
  // NO asOfDate ⇒ cannot confirm the delay elapsed ⇒ PENDING (fail-closed, never released)
  check("reserves lifted but NO asOfDate ⇒ PENDING_DELAY (fail-closed, releasable 0)", (() => { const r = R({ receptionDate: "2026-01-15", warrantyPeriodDays: 365, cumulativeRetainedMinor: 8000, reservesLifted: true }); return r.status === "PENDING_DELAY" && r.releasableMinor === 0; })());

  // release fail-closed
  check("invalid reception date ⇒ BAD_RECEPTION_DATE", R({ receptionDate: "2026-13-99", warrantyPeriodDays: 365, cumulativeRetainedMinor: 0, reservesLifted: true }).code === "BAD_RECEPTION_DATE");
  check("non-positive warranty ⇒ BAD_WARRANTY (1-year not assumed)", R({ receptionDate: "2026-01-15", warrantyPeriodDays: 0, cumulativeRetainedMinor: 0, reservesLifted: true }).code === "BAD_WARRANTY");
  check("bad cumulative ⇒ BAD_CUMULATIVE", R({ receptionDate: "2026-01-15", warrantyPeriodDays: 365, cumulativeRetainedMinor: -1, reservesLifted: true }).code === "BAD_CUMULATIVE");

  // honesty + determinism + frozen + contract
  check("note: withheld NOT a collected payment; rate not a legal determination", /WITHHELD per contract — NOT a collected payment/.test(w.note) && /not a legal determination/.test(w.note));
  check("release note: never automatic / owner-contract-gated", /release is never automatic/.test(R({ receptionDate: "2026-01-15", warrantyPeriodDays: 365, cumulativeRetainedMinor: 0, reservesLifted: false }).note));
  check("deterministic", JSON.stringify(W({ chantierId: "C1", situationRef: "S1", grossSituationHTMinor: 100000, retentionRate: 0.05 })) === JSON.stringify(w));
  check("frozen", Object.isFrozen(w) && Object.isFrozen(rel));
  check("contract: withheld≠collected, rate/délai caller-supplied, release owner-gated, caution-0, fail-closed",
    M.RETENUE_GARANTIE_CONTRACT.invariants.some((s: string) => /NEVER a realized or collected payment/.test(s)) &&
    M.RETENUE_GARANTIE_CONTRACT.invariants.some((s: string) => /CALLER-SUPPLIED .* NEVER hardcoded as legal truth/.test(s)) &&
    M.RETENUE_GARANTIE_CONTRACT.invariants.some((s: string) => /release is OWNER\/CONTRACT-GATED .* NEVER automatic/.test(s)) &&
    M.RETENUE_GARANTIE_CONTRACT.invariants.some((s: string) => /caution bancaire .* nothing withheld/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-retenue-garantie (withhold round(gross×caller-rate) + net-to-pay + cumulative[previous+this]; caution bancaire⇒0 disclosed; release via REAL odg-gregorian-calendar [reception+365=2027-01-15] gated BLOCKED_RESERVES/PENDING_DELAY/RELEASABLE, no-asOf⇒PENDING fail-closed, boundary asOf==release⇒RELEASABLE; 5%/1-year NOT assumed [NO_RATE/BAD_WARRANTY]; bad gross/rate/previous/date/cumulative fail-closed; withheld≠collected + rate≠legal honest; PURE/deterministic/frozen/clock-free)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
