import assert from "node:assert";
import { IoTPlatform, type AlertRule } from "./iot";
let n = 0; const ok = (c: boolean, m: string) => { assert.ok(c, m); console.log("  ok -", m); n++; };

// --- ingestion validation ---
let p = new IoTPlatform();
ok(p.ingest({ deviceId: "sensor-1", metric: "temp", value: 20.5, ts: "2026-10-08T10:00:00Z" }).ok, "valid reading accepted");
ok(!p.ingest({ deviceId: "", metric: "temp", value: 1, ts: "2026-10-08T10:00:00Z" }).ok, "empty deviceId rejected");
ok(!p.ingest({ deviceId: "d", metric: "temp", value: NaN, ts: "2026-10-08T10:00:00Z" }).ok, "non-finite value rejected");
ok(!p.ingest({ deviceId: "d", metric: "temp", value: 1, ts: "nope" } as any).ok, "bad timestamp rejected");
ok(p.size === 1, "only the 1 valid reading stored");

// --- time-windowed aggregation (1-minute buckets) ---
p = new IoTPlatform();
const t = (s: number) => new Date(Date.parse("2026-10-08T10:00:00Z") + s * 1000).toISOString();
// minute 0: 10,20,30 (avg20) ; minute 1: (empty) ; minute 2: 40 (avg40)
[[0, 10], [20, 20], [40, 30], [120, 40]].forEach(([s, v]) => p.ingest({ deviceId: "s1", metric: "temp", value: v, ts: t(s) }));
const buckets = p.windowAggregate({ metric: "temp", from: t(0), to: t(180), bucketMs: 60000, op: "avg" });
ok(buckets.length === 3, "3 one-minute buckets produced");
ok(buckets[0].value === 20 && buckets[0].n === 3, "bucket0 avg=20 over 3 readings");
ok(buckets[1].value === null && buckets[1].n === 0, "empty bucket ⇒ value null (no fabricated 0)");
ok(buckets[2].value === 40 && buckets[2].n === 1, "bucket2 avg=40");
const mx = p.windowAggregate({ metric: "temp", from: t(0), to: t(60), bucketMs: 60000, op: "max" });
ok(mx[0].value === 30, "max aggregation within a window");
ok(p.windowAggregate({ metric: "temp", from: t(0), to: t(60), bucketMs: 60000, op: "count" })[0].value === 3, "count aggregation");

// --- threshold alerting (boundary-exact) ---
p = new IoTPlatform();
[[0, 70], [10, 90], [70, 50]].forEach(([s, v]) => p.ingest({ deviceId: "pump-A", metric: "psi", value: v, ts: t(s) }));
p.ingest({ deviceId: "pump-B", metric: "psi", value: 95, ts: t(5) });
const rule: AlertRule = { metric: "psi", op: ">", threshold: 80, bucketMs: 60000, agg: "max" };
const alerts = p.evaluateAlerts([rule]);
ok(alerts.some((a) => a.deviceId === "pump-A" && a.observed === 90), "alert fires: pump-A max 90 > 80 in minute0");
ok(alerts.some((a) => a.deviceId === "pump-B" && a.observed === 95), "alert fires: pump-B 95 > 80");
ok(!alerts.some((a) => a.deviceId === "pump-A" && a.windowStart === t(60)), "no alert in minute1 (max 50 ≤ 80)");
const ge = p.evaluateAlerts([{ metric: "psi", op: ">=", threshold: 90, bucketMs: 60000, agg: "max" }]);
ok(ge.some((a) => a.deviceId === "pump-A" && a.observed === 90), "boundary op >= includes exactly-90");
ok(p.evaluateAlerts([{ metric: "psi", op: ">", threshold: 90, bucketMs: 60000, agg: "max" }]).every((a) => a.deviceId !== "pump-A"), "strict > excludes exactly-90 for pump-A");
ok(p.evaluateAlerts([{ metric: "absent", op: ">", threshold: 0, bucketMs: 60000, agg: "max" }]).length === 0, "unknown metric ⇒ no alerts (no crash)");

console.log(`\nIoT telemetry vertical slice — ${n} assertions passed.`);
