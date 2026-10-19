// @ts-nocheck — test harness (runtime/core): runs under tsx; migration-debt convention.
// maintenance-alerts (P5) — pure threshold evaluator: unknown signals ⇒ INFO (never silent pass), breaches ⇒
// WARN/CRIT with values, dedup by prior ids, JS/TS parity.
const assert = require("assert");
const TS = require("./maintenance-alerts.ts");
const JS = require("./maintenance-alerts.js");

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

// 1. all-healthy ⇒ ok:true, zero WARN/CRIT (unknowns only when a signal is absent — here all present).
t("all signals healthy ⇒ ok, no WARN/CRIT", () => {
  const r = TS.evaluateMaintenance({ healthCode: 200, diskUsedPct: 40, memUsedPct: 55, nRestarts: 0, backupAgeDays: 1, releaseCurrentPresent: true });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.counts.CRIT, 0);
  assert.strictEqual(r.counts.WARN, 0);
  assert.strictEqual(r.counts.INFO, 0);
});

// 2. absent signals ⇒ INFO _UNKNOWN alerts, NEVER a silent pass; ok stays true (unknown ≠ failure) but visible.
t("absent signals ⇒ INFO *_UNKNOWN (no silent pass)", () => {
  const r = TS.evaluateMaintenance({});
  const ids = r.alerts.map((a) => a.id).sort();
  assert.deepStrictEqual(ids, ["BACKUP_AGE_UNKNOWN", "DISK_UNKNOWN", "HEALTH_UNKNOWN", "MEM_UNKNOWN", "RELEASE_CURRENT_UNKNOWN", "RESTARTS_UNKNOWN"]);
  assert.ok(r.alerts.every((a) => a.severity === "INFO"));
  assert.strictEqual(r.ok, true); // unknown does not fail ok, but every unknown IS surfaced
});

// 3. breaches ⇒ WARN/CRIT with observed values; health!=200 and missing release are CRIT.
t("breaches ⇒ WARN/CRIT with values", () => {
  const r = TS.evaluateMaintenance({ healthCode: 503, diskUsedPct: 98, memUsedPct: 91, nRestarts: 9, backupAgeDays: 30, releaseCurrentPresent: false });
  const by = Object.fromEntries(r.alerts.map((a) => [a.id, a]));
  assert.strictEqual(by.HEALTH_NOT_200.severity, "CRIT");
  assert.strictEqual(by.HEALTH_NOT_200.value, 503);
  assert.strictEqual(by.DISK_CRITICAL.severity, "CRIT");   // 98 >= 97
  assert.strictEqual(by.MEM_HIGH.severity, "WARN");         // 91 >= 90 but < 97
  assert.strictEqual(by.RESTARTS_HIGH.severity, "WARN");
  assert.strictEqual(by.BACKUP_STALE.value, 30);
  assert.strictEqual(by.RELEASE_CURRENT_MISSING.severity, "CRIT");
  assert.strictEqual(r.ok, false);
});

// 4. dedup against prior ids.
t("newAlerts filters already-emitted ids", () => {
  const r = TS.evaluateMaintenance({ healthCode: 503, diskUsedPct: 40, memUsedPct: 40, nRestarts: 0, backupAgeDays: 1, releaseCurrentPresent: true });
  const fresh = TS.newAlerts(r.alerts, ["HEALTH_NOT_200"]);
  assert.strictEqual(fresh.length, 0, "the only alert was already emitted ⇒ deduped");
  const fresh2 = TS.newAlerts(r.alerts, []);
  assert.strictEqual(fresh2.length, 1);
});

// 5. custom thresholds + JS/TS parity.
t("custom thresholds honoured + JS/TS parity", () => {
  const sig = { healthCode: 200, diskUsedPct: 85, memUsedPct: 10, nRestarts: 2, backupAgeDays: 3, releaseCurrentPresent: true };
  const strict = TS.evaluateMaintenance(sig, { diskPct: 80 });
  assert.ok(strict.alerts.some((a) => a.id === "DISK_HIGH"), "85 >= custom 80 ⇒ WARN");
  assert.deepStrictEqual(TS.evaluateMaintenance(sig, { diskPct: 80 }), JS.evaluateMaintenance(sig, { diskPct: 80 }));
  assert.deepStrictEqual(TS.evaluateMaintenance({}), JS.evaluateMaintenance({}));
});

console.log(`\nALL PASS — maintenance-alerts (${n} tests)`);
