/* Proof-of-capability: vertical slice of an "ICT Data Platform" technical core.
 * Typed ingestion with schema validation + queryable store with filter/group-by/aggregate.
 * Dependency-free, deterministic, testable — the buildable heart of such a tender's deliverable. */

export type FieldType = "string" | "number" | "integer" | "boolean" | "date";
export interface FieldSpec { type: FieldType; required?: boolean; }
export type Schema = Record<string, FieldSpec>;
export type Record_ = Record<string, unknown>;
export interface IngestResult { ok: boolean; errors: string[]; }

const isISODate = (v: unknown): boolean =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(v) && !Number.isNaN(Date.parse(v));

function validateField(name: string, spec: FieldSpec, v: unknown): string | null {
  if (v === undefined || v === null) return spec.required ? `missing required field "${name}"` : null;
  switch (spec.type) {
    case "string": return typeof v === "string" ? null : `"${name}" must be string`;
    case "number": return typeof v === "number" && Number.isFinite(v) ? null : `"${name}" must be a finite number`;
    case "integer": return Number.isInteger(v) ? null : `"${name}" must be an integer`;
    case "boolean": return typeof v === "boolean" ? null : `"${name}" must be boolean`;
    case "date": return isISODate(v) ? null : `"${name}" must be an ISO date`;
  }
}

export interface Query {
  filter?: Partial<Record<string, unknown>>;
  groupBy?: string;
  aggregate?: { op: "count" | "sum" | "avg" | "min" | "max"; field?: string };
  limit?: number;
}

export class DataPlatform {
  private rows: Record_[] = [];
  constructor(private readonly schema: Schema) {}

  ingest(record: Record_): IngestResult {
    const errors: string[] = [];
    if (typeof record !== "object" || record === null) return { ok: false, errors: ["record must be an object"] };
    for (const [name, spec] of Object.entries(this.schema)) {
      const e = validateField(name, spec, record[name]);
      if (e) errors.push(e);
    }
    const unknown = Object.keys(record).filter((k) => !(k in this.schema));
    if (unknown.length) errors.push(`unknown field(s): ${unknown.join(", ")}`);
    if (errors.length) return { ok: false, errors };
    this.rows.push({ ...record });
    return { ok: true, errors: [] };
  }

  get size(): number { return this.rows.length; }

  query(q: Query = {}): unknown {
    let rows = this.rows;
    if (q.filter) {
      const entries = Object.entries(q.filter);
      rows = rows.filter((r) => entries.every(([k, v]) => r[k] === v));
    }
    const agg = (subset: Record_[]): number | null => {
      const op = q.aggregate?.op ?? "count";
      if (op === "count") return subset.length;
      const f = q.aggregate?.field;
      if (!f) throw new Error(`aggregate "${op}" requires a field`);
      const nums = subset.map((r) => r[f]).filter((x): x is number => typeof x === "number");
      if (nums.length === 0) return null;
      if (op === "sum") return nums.reduce((a, b) => a + b, 0);
      if (op === "avg") return nums.reduce((a, b) => a + b, 0) / nums.length;
      if (op === "min") return Math.min(...nums);
      if (op === "max") return Math.max(...nums);
      return null;
    };
    if (q.groupBy) {
      const groups = new Map<unknown, Record_[]>();
      for (const r of rows) {
        const key = r[q.groupBy];
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
      }
      const out: Record<string, number | null> = {};
      for (const [key, subset] of groups) out[String(key)] = agg(subset);
      return out;
    }
    if (q.aggregate) return agg(rows);
    return typeof q.limit === "number" ? rows.slice(0, q.limit) : rows;
  }
}
