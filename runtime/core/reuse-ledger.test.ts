#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the reuse-outcome write-back that closes the loop: a measured
// before/after is classified (VALIDATED / FAILED / INCONCLUSIVE with no-fabricated-effect), written back to
// the asset's usageHistory + knownRegressions, and a net-regressing asset becomes SUPPRESSED (de-selected).
// Hermetic: an in-memory store is injected, so nothing touches runtime/generated.
"use strict";
const assert = require("assert");
const RL = require("./reuse-ledger.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const memStore = () => { const m = {}; return { _m: m, read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; };
const sig = (s) => "rc|" + s + "|t";

// (1) classifyReuseOutcome — the four branches.
ok("classify: net improvement ⇒ VALIDATED", RL.classifyReuseOutcome({ summary: { improved: 2, regressed: 0, flat: 0, unmeasured: 0 } }).outcome === "REUSE_VALIDATED");
ok("classify: net regression ⇒ FAILED", RL.classifyReuseOutcome({ summary: { improved: 0, regressed: 2, flat: 0, unmeasured: 0 } }).outcome === "REUSE_FAILED");
ok("classify: no measured change ⇒ INCONCLUSIVE (no fabricated effect)", RL.classifyReuseOutcome({ summary: { improved: 0, regressed: 0, flat: 3, unmeasured: 1 } }).outcome === "REUSE_INCONCLUSIVE");
ok("classify: measured tie ⇒ INCONCLUSIVE", RL.classifyReuseOutcome({ summary: { improved: 1, regressed: 1, flat: 0, unmeasured: 0 } }).outcome === "REUSE_INCONCLUSIVE");
ok("classify: missing summary ⇒ INCONCLUSIVE, not measurable", RL.classifyReuseOutcome(null).outcome === "REUSE_INCONCLUSIVE" && RL.classifyReuseOutcome(null).measured === false);

// (2) recordReuseOutcome — a real improvement is VALIDATED and written back.
let st = memStore();
const r1 = RL.recordReuseOutcome(sig("a"), { before: { signals: { score: 1 } }, after: { signals: { score: 2 } }, context: "m1", at: "2026-10-27T00:00:00Z" }, { store: st });
ok("record: improvement ⇒ VALIDATED + usageHistory written", r1.ok && r1.outcome === "REUSE_VALIDATED" && r1.asset.validated === 1 && r1.asset.usageHistory.length === 1 && r1.asset.suppressed === false);

// (3) a regression is FAILED and recorded as a known regression naming the metric.
st = memStore();
const rf = RL.recordReuseOutcome(sig("b"), { before: { signals: { score: 2 } }, after: { signals: { score: 1 } }, context: "m2", at: "2026-10-27T00:01:00Z" }, { store: st });
ok("record: regression ⇒ FAILED + knownRegressions[metric]", rf.ok && rf.outcome === "REUSE_FAILED" && rf.asset.failed === 1 && rf.asset.knownRegressions.length === 1 && rf.asset.knownRegressions[0].metrics.includes("score"));

// (4) SUPPRESSION — two net regressions (failed≥2 and failed>validated) ⇒ suppressed + listed for de-selection.
st = memStore();
RL.recordReuseOutcome(sig("c"), { before: { signals: { score: 2 } }, after: { signals: { score: 1 } }, at: "t1" }, { store: st });
const r2 = RL.recordReuseOutcome(sig("c"), { before: { signals: { score: 2 } }, after: { signals: { score: 1 } }, at: "t2" }, { store: st });
ok("suppression: 2 failures ⇒ suppressed + in suppressedSignatures", r2.asset.suppressed === true && RL.suppressedSignatures({ store: st }).includes(sig("c")));

// (5) enough validations outweigh failures ⇒ NOT suppressed (asset recovers).
RL.recordReuseOutcome(sig("c"), { before: { signals: { score: 1 } }, after: { signals: { score: 2 } }, at: "t3" }, { store: st });
const h = RL.reuseHealth(sig("c"), { store: st });
ok("recovery: validated(1) !> failed(2) still suppressed; adding more validations flips it", (() => {
  // currently failed=2 validated=1 ⇒ suppressed; add two more validations ⇒ validated=3 > failed=2 ⇒ not suppressed
  RL.recordReuseOutcome(sig("c"), { before: { signals: { score: 1 } }, after: { signals: { score: 2 } }, at: "t4" }, { store: st });
  RL.recordReuseOutcome(sig("c"), { before: { signals: { score: 1 } }, after: { signals: { score: 2 } }, at: "t5" }, { store: st });
  const hh = RL.reuseHealth(sig("c"), { store: st });
  return h.suppressed === true && hh.suppressed === false && hh.validated === 3 && hh.failed === 2;
})());

// (6) fail-closed input.
ok("fail-closed: empty/non-string signature ⇒ INVALID_INPUT", RL.recordReuseOutcome("", {}, { store: memStore() }).code === "INVALID_INPUT" && RL.recordReuseOutcome(42, {}, { store: memStore() }).code === "INVALID_INPUT");

// (7) reuseHealth for an unknown signature ⇒ known:false, zeros.
ok("health: unknown signature ⇒ known:false, uses 0", (() => { const u = RL.reuseHealth(sig("zzz"), { store: memStore() }); return u.ok && u.known === false && u.uses === 0 && u.suppressed === false; })());

// (8) no fabricated effect — before===after ⇒ INCONCLUSIVE, counted as inconclusive, never a regression.
st = memStore();
const ri = RL.recordReuseOutcome(sig("d"), { before: { signals: { score: 1 } }, after: { signals: { score: 1 } }, at: "t" }, { store: st });
ok("no fabricated effect: flat ⇒ INCONCLUSIVE, no regression recorded", ri.outcome === "REUSE_INCONCLUSIVE" && ri.asset.inconclusive === 1 && ri.asset.validated === 0 && ri.asset.knownRegressions.length === 0);

// (9) persistence/write-back accumulates across calls via the injected store.
st = memStore();
RL.recordReuseOutcome(sig("e"), { before: { signals: { score: 1 } }, after: { signals: { score: 2 } }, at: "t1" }, { store: st });
RL.recordReuseOutcome(sig("e"), { before: { signals: { score: 1 } }, after: { signals: { score: 3 } }, at: "t2" }, { store: st });
const led = RL.loadLedger({ store: st });
ok("persistence: usageHistory accumulates to 2 in the stored ledger", led.assets[sig("e")].usageHistory.length === 2 && led.assets[sig("e")].uses === 2);

// (10) senseMap passthrough — a debt (lower-is-better) signal that DECREASES is an improvement ⇒ VALIDATED.
st = memStore();
const rd = RL.recordReuseOutcome(sig("f"), { before: { signals: { jsRemaining: 10 } }, after: { signals: { jsRemaining: 5 } }, senseMap: { jsRemaining: "lower" }, at: "t" }, { store: st });
ok("senseMap: lower-is-better debt reduced ⇒ VALIDATED", rd.outcome === "REUSE_VALIDATED");

console.log(`\nREUSE-LEDGER suite — ${pass} assertions passed. (reuse-outcome write-back: VALIDATED/FAILED/INCONCLUSIVE + usageHistory + knownRegressions + suppression)`);
