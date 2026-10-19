// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// supervision-summary — the odg-health §G formatter: OK / UNKNOWN(absent) / STALE(perimé) / DRIFT / ATTENTION /
// one-half-missing. Deterministic (nowMs injected). JS/TS parity.
const assert = require("assert");
const TS = require("./supervision-summary.ts");
const JS = require("./supervision-summary.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const ex = (over) => Object.assign({ at: "2026-10-19T11:58:00.000Z", verdict: "LOOPBACK_OK", odgLoopback: 1, drift: 0, foreign: 0 }, over);
const mt = (over) => Object.assign({ at: "2026-10-19T11:58:00.000Z", ok: true, CRIT: 0, WARN: 0, INFO: 0 }, over);

// 1. both absent ⇒ UNKNOWN, never healthy.
t("both absent ⇒ UNKNOWN (never healthy)", () => {
  const s = TS.summarizeSupervision(null, null, NOW);
  assert.ok(/^UNKNOWN — no odg-monitor status/.test(s));
});

// 2. fresh OK ⇒ shows verdicts + 'monitor fresh'.
t("fresh healthy ⇒ OK + monitor fresh", () => {
  const s = TS.summarizeSupervision(ex(), mt(), NOW);
  assert.ok(/exposure=LOOPBACK_OK\(odg=1,drift=0\)/.test(s));
  assert.ok(/maintenance=OK\(C0\/W0\/I0\)/.test(s));
  assert.ok(/monitor fresh$/.test(s));
});

// 3. stale (>25min) ⇒ 'monitor STALE' (perimé = never fresh).
t("stale status ⇒ monitor STALE", () => {
  const s = TS.summarizeSupervision(ex({ at: "2026-10-19T11:00:00.000Z" }), mt({ at: "2026-10-19T11:00:00.000Z" }), NOW);
  assert.ok(/monitor STALE$/.test(s), s);
});

// 4. DRIFT + maintenance ATTENTION surfaced honestly.
t("DRIFT + ATTENTION surfaced", () => {
  const s = TS.summarizeSupervision(ex({ verdict: "DRIFT", drift: 1 }), mt({ ok: false, CRIT: 1 }), NOW);
  assert.ok(/exposure=DRIFT\(odg=1,drift=1\)/.test(s));
  assert.ok(/maintenance=ATTENTION\(C1\/W0\/I0\)/.test(s));
});

// 5. one half missing ⇒ that half UNKNOWN; other half shown; freshness from the present one.
t("one half missing ⇒ half UNKNOWN", () => {
  const s1 = TS.summarizeSupervision(ex(), null, NOW);
  assert.ok(/maintenance=UNKNOWN/.test(s1) && /exposure=LOOPBACK_OK/.test(s1), s1);
  const s2 = TS.summarizeSupervision(null, mt(), NOW);
  assert.ok(/exposure=UNKNOWN/.test(s2) && /maintenance=OK/.test(s2), s2);
});

// 6. parity.
t("JS/TS parity across branches", () => {
  for (const args of [[null, null, NOW], [ex(), mt(), NOW], [ex({ verdict: "DRIFT", drift: 2 }), mt({ ok: false, WARN: 3 }), NOW], [ex({ at: "2026-10-19T10:00:00.000Z" }), null, NOW]]) {
    assert.strictEqual(TS.summarizeSupervision.apply(null, args), JS.summarizeSupervision.apply(null, args));
  }
});

console.log(`\nALL PASS — supervision-summary (${n} tests)`);
