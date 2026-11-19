#!/usr/bin/env node
"use strict";
/* Tests for odg-marketing-cycle-latency (opportunity→decision→production→result cycle time). PURE/clock-free. */
const M = require("./odg-marketing-cycle-latency.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const D = 86400000;

function main(): void {
  // full chain: detect d0, decide d2, produce d5, result d12
  const r = M.chainLatency({ opportunityDetectedAt: 0, decidedAt: 2 * D, producedAt: 5 * D, resultObservedAt: 12 * D });
  check("legs OK with correct durations (2d / 3d / 7d)", r.legs[0].status === "OK" && r.legs[0].days === 2 && r.legs[1].days === 3 && r.legs[2].days === 7);
  check("total = detect→result = 12d (OK)", r.totalStatus === "OK" && r.totalDays === 12 && r.totalMs === 12 * D);
  check("bottleneck = slowest OK leg (produce_to_result, 7d)", r.bottleneck.name === "produce_to_result" && r.bottleneck.days === 7);

  // a missing middle timestamp ⇒ its legs UNDETERMINED, but total still resolves if both ends present
  const miss = M.chainLatency({ opportunityDetectedAt: 0, decidedAt: 2 * D, resultObservedAt: 12 * D });
  check("missing producedAt ⇒ two legs UNDETERMINED, total still OK (ends present)", miss.legs[1].status === "UNDETERMINED" && miss.legs[2].status === "UNDETERMINED" && miss.totalStatus === "OK" && miss.totalDays === 12);
  check("all-missing legs ⇒ bottleneck null (no OK leg)", M.chainLatency({ opportunityDetectedAt: 0, resultObservedAt: 12 * D }).bottleneck === null);

  // out-of-order ⇒ INVALID_ORDER, never a negative duration
  const ooo = M.chainLatency({ opportunityDetectedAt: 5 * D, decidedAt: 2 * D, producedAt: 6 * D, resultObservedAt: 10 * D });
  check("decide before detect ⇒ leg INVALID_ORDER, ms null (no negative duration)", ooo.legs[0].status === "INVALID_ORDER" && ooo.legs[0].ms === null);
  check("result before detect ⇒ total INVALID_ORDER", M.chainLatency({ opportunityDetectedAt: 10 * D, resultObservedAt: 2 * D }).totalStatus === "INVALID_ORDER");
  check("equal consecutive timestamps ⇒ 0-duration OK leg (not invalid)", M.chainLatency({ opportunityDetectedAt: D, decidedAt: D }).legs[0].status === "OK" && M.chainLatency({ opportunityDetectedAt: D, decidedAt: D }).legs[0].ms === 0);

  // ISO strings accepted (parsed); epoch and ISO equivalent
  check("ISO timestamps parsed (10 days)", M.chainLatency({ opportunityDetectedAt: "2026-01-01", resultObservedAt: "2026-01-11" }).totalDays === 10);
  check("unparseable timestamp ⇒ UNDETERMINED (not a throw)", M.chainLatency({ opportunityDetectedAt: "nope", decidedAt: 2 * D }).legs[0].status === "UNDETERMINED");

  // no timestamps at all ⇒ everything UNDETERMINED, no throw
  const empty = M.chainLatency({});
  check("empty timestamps ⇒ all legs UNDETERMINED, total UNDETERMINED, bottleneck null", empty.ok === true && empty.legs.every((l: any) => l.status === "UNDETERMINED") && empty.totalStatus === "UNDETERMINED" && empty.bottleneck === null);

  // batch stats over DETERMINABLE cycles only
  const stats = M.cycleLatencyStats([
    { opportunityDetectedAt: 0, decidedAt: D, producedAt: 3 * D, resultObservedAt: 10 * D },
    { opportunityDetectedAt: 0, decidedAt: D, producedAt: 3 * D, resultObservedAt: 20 * D },
    { opportunityDetectedAt: 0 }, // not determinable (no result)
  ]);
  check("stats: 3 total, 2 determinable (non-determinable excluded)", stats.total === 3 && stats.determinable === 2);
  check("stats: median & mean of totals (10,20) = 15 days", stats.medianTotalDays === 15 && stats.meanTotalDays === 15);
  check("stats: bottleneck frequency counts slowest leg per determinable cycle", stats.bottleneckFrequency.produce_to_result === 2);
  // odd-count median
  check("odd-count median is the middle value", M.cycleLatencyStats([{ opportunityDetectedAt: 0, resultObservedAt: 4 * D }, { opportunityDetectedAt: 0, resultObservedAt: 10 * D }, { opportunityDetectedAt: 0, resultObservedAt: 100 * D }]).medianTotalDays === 10);
  check("0 determinable ⇒ median/mean null (never 0/0)", M.cycleLatencyStats([{ opportunityDetectedAt: 0 }]).medianTotalDays === null && M.cycleLatencyStats([{ opportunityDetectedAt: 0 }]).meanTotalDays === null);

  // fail-closed
  check("non-object timestamps ⇒ BAD_INPUT", M.chainLatency(null).ok === false && M.chainLatency(42).code === "BAD_INPUT");
  check("non-array cycles ⇒ BAD_INPUT", M.cycleLatencyStats("x").ok === false && M.cycleLatencyStats("x").code === "BAD_INPUT");
  check("garbage cycle in batch ⇒ handled (not determinable), no throw", (() => { const s = M.cycleLatencyStats([null, 42, { opportunityDetectedAt: 0, resultObservedAt: 5 * D }]); return s.total === 3 && s.determinable === 1; })());

  // honesty + determinism + frozen + contract
  check("note: model-only, result≠sale, shorter≠better, no blended score", /RECORDED EVENT, NEVER a qualified client/.test(r.note) && /SHORTER LATENCY IS NOT A BETTER OUTCOME/.test(r.note) && /No blended speed score/.test(r.note));
  check("deterministic", JSON.stringify(M.chainLatency({ opportunityDetectedAt: 0, decidedAt: 2 * D, producedAt: 5 * D, resultObservedAt: 12 * D })) === JSON.stringify(r));
  check("frozen (result, legs, a leg, bottleneck)", Object.isFrozen(r) && Object.isFrozen(r.legs) && Object.isFrozen(r.legs[0]) && Object.isFrozen(r.bottleneck));
  check("contract: model-only-not-sale, shorter≠better, fail-closed-order, determinable-only, pure",
    M.MARKETING_CYCLE_LATENCY_CONTRACT.invariants.some((s: string) => /NEVER a qualified client, a sale/.test(s)) &&
    M.MARKETING_CYCLE_LATENCY_CONTRACT.invariants.some((s: string) => /SHORTER LATENCY IS NOT A BETTER OUTCOME/.test(s)) &&
    M.MARKETING_CYCLE_LATENCY_CONTRACT.invariants.some((s: string) => /out-of-order timestamp ⇒ UNDETERMINED \/ INVALID_ORDER/.test(s)) &&
    M.MARKETING_CYCLE_LATENCY_CONTRACT.invariants.some((s: string) => /DETERMINABLE cycles ONLY/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-marketing-cycle-latency (opportunity→decision→production→result cycle time, V324 §12: leg durations [2d/3d/7d] + total + slowest-leg bottleneck; missing⇒UNDETERMINED, out-of-order⇒INVALID_ORDER [no negative duration], equal⇒0-OK; ISO+epoch; batch median/mean over DETERMINABLE cycles only + bottleneck frequency; non-object/non-array/garbage fail-closed; MODEL-ONLY result≠sale, shorter≠better, no blended score; PURE/deterministic/frozen/clock-free)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
