#!/usr/bin/env node
"use strict";
/* V146 MÉTIER 4 — data-connector battery (SYNTHETIC CSV/JSON, labelled ≠ real data). Proves controlled import + schema/quality
 * (reusing assessDataQuality) + dedup + anomaly report; fail-closed on empty/ragged/invalid-JSON/not-an-array; field mapping;
 * timeliness pass-through; deterministic number coercion; READ-ONLY (no write/fetch). */
const D = require("./data-connector.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const SCH = { id: { type: "string", required: true }, age: { type: "number", min: 0, max: 120, required: true } };

function main() {
  const csv = "id,age,updatedAt\nr1,30,2026-11-12\nr2,200,2026-01-01\nr1,30,2026-11-12\nr3,bad,2026-11-12";
  const r = D.importCsv(csv, { schema: SCH, keyField: "id", timeliness: { field: "updatedAt", maxAgeMs: 86400000, nowMs: Date.parse("2026-11-12T12:00:00Z") } });
  check("CSV import ⇒ ok, deduped to 3 rows, 1 duplicate", r.ok === true && r.rowCount === 3 && r.duplicates.length === 1);
  check("anomalies via assessDataQuality: TYPE_MISMATCH + OUT_OF_RANGE + STALE + DUPLICATE", r.anomalies.map((a: any) => a.kind).sort().join(",") === "DUPLICATE,OUT_OF_RANGE,STALE,TYPE_MISMATCH");
  check("quality uses the 6-dim engine (timeliness checked ⇒ stale flagged)", r.quality.timelinessChecked === true && r.quality.stale >= 1 && r.clean === false);

  // deterministic coercion: numeric strings become numbers only when exact.
  const r3 = r.rows.find((x: any) => x.id === "r3");
  check("number coercion exact (age 30 is number, non-numeric 'bad' stays string)", r.rows[0].age === 30 && typeof r.rows[0].age === "number" && r3 && r3.age === "bad" && typeof r3.age === "string");

  // field mapping
  const mapped = D.importCsv("Ref,Montant\nA,100\nB,200", { schema: {}, fieldMap: { Ref: "id", Montant: "amount" }, keyField: "id" });
  check("field mapping (Ref→id, Montant→amount)", mapped.ok === true && mapped.rows[0].id === "A" && mapped.rows[0].amount === 100);

  // JSON import
  const j = D.importJson(JSON.stringify([{ id: "a", age: 30 }, { id: "a", age: 30 }, { id: "b", age: 40 }]), { schema: SCH, keyField: "id" });
  check("JSON array import ⇒ deduped (a×2→1), 2 unique", j.ok === true && j.rowCount === 2 && j.duplicates.length === 1);
  check("JSON { records: [...] } shape accepted", D.importJson(JSON.stringify({ records: [{ id: "x" }] }), { schema: {}, keyField: "id" }).ok === true);

  // fail-closed cases
  check("empty input ⇒ ok:false EMPTY_INPUT", D.importCsv("").ok === false && D.importCsv("").code === "EMPTY_INPUT" && D.importJson("").code === "EMPTY_INPUT");
  check("header only (no data rows) ⇒ ok:false NO_DATA_ROWS", D.importCsv("id,age").code === "NO_DATA_ROWS");
  check("ragged CSV row ⇒ dropped (fail-closed, counted)", D.importCsv("id,age\nr1,30\nr2", { schema: SCH, keyField: "id" }).dropped === 1);
  check("invalid JSON ⇒ ok:false INVALID_JSON (no throw)", D.importJson("{bad").ok === false && D.importJson("{bad").code === "INVALID_JSON");
  check("JSON not an array ⇒ ok:false NOT_AN_ARRAY", D.importJson(JSON.stringify({ foo: 1 })).code === "NOT_AN_ARRAY");
  check("garbage ⇒ fail-closed, no throw", D.importCsv(null).ok === false && D.importJson(null).ok === false);

  check("READ-ONLY note (no write/fetch)", /no write\/fetch/.test(r.note));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — data-connector (controlled CSV/JSON import; schema+quality via assessDataQuality; dedup; field-map; fail-closed; read-only)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
