import assert from "node:assert";
import { DataPlatform, type Schema } from "./platform";
let n = 0; const ok = (c: boolean, m: string) => { assert.ok(c, m); console.log("  ok -", m); n++; };

const schema: Schema = {
  id: { type: "integer", required: true },
  region: { type: "string", required: true },
  amount: { type: "number", required: true },
  active: { type: "boolean" },
  created: { type: "date" },
};

// ingestion validation
let p = new DataPlatform(schema);
ok(p.ingest({ id: 1, region: "EU", amount: 100.5, active: true, created: "2026-10-08" }).ok, "valid record accepted");
ok(p.ingest({ id: 2, region: "US", amount: 50 }).ok, "optional fields omitted still valid");
let r = p.ingest({ id: 3.5, region: "EU", amount: 10 });
ok(!r.ok && r.errors.some((e) => /integer/.test(e)), "non-integer id rejected");
r = p.ingest({ id: 4, amount: 10 });
ok(!r.ok && r.errors.some((e) => /missing required.*region/.test(e)), "missing required field rejected");
r = p.ingest({ id: 5, region: "EU", amount: "oops" });
ok(!r.ok && r.errors.some((e) => /finite number/.test(e)), "wrong-type number rejected");
r = p.ingest({ id: 6, region: "EU", amount: 10, created: "not-a-date" });
ok(!r.ok && r.errors.some((e) => /ISO date/.test(e)), "invalid date rejected");
r = p.ingest({ id: 7, region: "EU", amount: 10, rogue: "x" });
ok(!r.ok && r.errors.some((e) => /unknown field/.test(e)), "unknown field rejected (strict schema)");
ok(p.size === 2, "only the 2 valid records were stored");

// query: filter, aggregate, group-by
p = new DataPlatform(schema);
[["EU", 100], ["EU", 200], ["US", 50], ["US", 70], ["EU", 300]].forEach(([region, amount], i) =>
  p.ingest({ id: i + 1, region, amount }));
ok((p.query({ filter: { region: "EU" }, aggregate: { op: "count" } }) as number) === 3, "filter + count");
ok((p.query({ aggregate: { op: "sum", field: "amount" } }) as number) === 720, "global sum");
const grouped = p.query({ groupBy: "region", aggregate: { op: "avg", field: "amount" } }) as Record<string, number>;
ok(grouped.EU === 200 && grouped.US === 60, "group-by avg per region");
const max = p.query({ groupBy: "region", aggregate: { op: "max", field: "amount" } }) as Record<string, number>;
ok(max.EU === 300 && max.US === 70, "group-by max per region");
ok((p.query({ limit: 2 }) as unknown[]).length === 2, "limit paginates");
ok(p.query({ filter: { region: "ZZ" }, aggregate: { op: "avg", field: "amount" } }) === null, "empty group avg ⇒ null (no fabricated 0)");

console.log(`\nData-platform vertical slice — ${n} assertions passed.`);
