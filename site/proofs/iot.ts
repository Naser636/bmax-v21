/* Proof-of-capability — vertical slice of an IoT telemetry platform core (for the Scottish Gov IoT DPS,
 * CPV 72000000). Device-reading ingestion with validation + time-windowed aggregation + threshold
 * alert-rule evaluation + query. Deterministic & dependency-free (timestamps are inputs, no wall clock). */

export interface Reading { deviceId: string; metric: string; value: number; ts: string }
export interface IngestResult { ok: boolean; errors: string[] }

function parseTs(ts: unknown): number | null {
  if (typeof ts !== "string") return null;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? null : ms;
}

export type AggOp = "avg" | "min" | "max" | "sum" | "count";
export interface WindowQuery { metric: string; deviceId?: string; from: string; to: string; bucketMs: number; op: AggOp }
export interface Bucket { start: string; value: number | null; n: number }

export interface AlertRule { metric: string; op: ">" | ">=" | "<" | "<="; threshold: number; bucketMs: number; agg: AggOp }
export interface Alert { deviceId: string; metric: string; windowStart: string; observed: number; rule: AlertRule }

const CMP: Record<AlertRule["op"], (a: number, b: number) => boolean> = {
  ">": (a, b) => a > b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, "<=": (a, b) => a <= b,
};

function aggregate(op: AggOp, values: number[]): number | null {
  if (op === "count") return values.length;
  if (values.length === 0) return null;
  if (op === "sum") return values.reduce((a, b) => a + b, 0);
  if (op === "avg") return values.reduce((a, b) => a + b, 0) / values.length;
  if (op === "min") return Math.min(...values);
  return Math.max(...values);
}

export class IoTPlatform {
  private readings: Array<Reading & { _ms: number }> = [];

  ingest(r: Reading): IngestResult {
    const errors: string[] = [];
    if (typeof r !== "object" || r === null) return { ok: false, errors: ["reading must be an object"] };
    if (typeof r.deviceId !== "string" || !r.deviceId) errors.push('deviceId must be a non-empty string');
    if (typeof r.metric !== "string" || !r.metric) errors.push('metric must be a non-empty string');
    if (typeof r.value !== "number" || !Number.isFinite(r.value)) errors.push('value must be a finite number');
    const ms = parseTs(r.ts);
    if (ms === null) errors.push('ts must be an ISO timestamp');
    if (errors.length) return { ok: false, errors };
    this.readings.push({ ...r, _ms: ms! });
    return { ok: true, errors: [] };
  }

  get size(): number { return this.readings.length; }

  /** Time-bucketed aggregation over [from,to) for a metric (optionally one device). Buckets are aligned
   *  to epoch multiples of bucketMs; empty buckets are included with value=null (never a fabricated 0). */
  windowAggregate(q: WindowQuery): Bucket[] {
    if (!(q.bucketMs > 0)) throw new Error("bucketMs must be > 0");
    const from = parseTs(q.from), to = parseTs(q.to);
    if (from === null || to === null) throw new Error("from/to must be ISO timestamps");
    const inScope = this.readings.filter(
      (r) => r.metric === q.metric && (!q.deviceId || r.deviceId === q.deviceId) && r._ms >= from && r._ms < to,
    );
    const start0 = Math.floor(from / q.bucketMs) * q.bucketMs;
    const buckets: Bucket[] = [];
    for (let b = start0; b < to; b += q.bucketMs) {
      const vals = inScope.filter((r) => r._ms >= b && r._ms < b + q.bucketMs).map((r) => r.value);
      buckets.push({ start: new Date(b).toISOString(), value: aggregate(q.op, vals), n: vals.length });
    }
    return buckets;
  }

  /** Evaluate threshold rules per device+metric over aligned windows; emit an alert per breaching window. */
  evaluateAlerts(rules: AlertRule[]): Alert[] {
    const alerts: Alert[] = [];
    const devices = [...new Set(this.readings.map((r) => r.deviceId))];
    for (const rule of rules) {
      const relevant = this.readings.filter((r) => r.metric === rule.metric);
      if (relevant.length === 0) continue;
      const minMs = Math.min(...relevant.map((r) => r._ms));
      const maxMs = Math.max(...relevant.map((r) => r._ms));
      for (const deviceId of devices) {
        const start0 = Math.floor(minMs / rule.bucketMs) * rule.bucketMs;
        for (let b = start0; b <= maxMs; b += rule.bucketMs) {
          const vals = relevant.filter((r) => r.deviceId === deviceId && r._ms >= b && r._ms < b + rule.bucketMs).map((r) => r.value);
          const observed = aggregate(rule.agg, vals);
          if (observed !== null && CMP[rule.op](observed, rule.threshold)) {
            alerts.push({ deviceId, metric: rule.metric, windowStart: new Date(b).toISOString(), observed, rule });
          }
        }
      }
    }
    return alerts;
  }
}
