#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P4 = require("./profession-p4-data-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P4 — DATA REFERENCE (E2/E3)");

const schema = { id: { type: "string", required: true }, age: { type: "number", min: 0, max: 120, required: true } };

// quality: clean rows ⇒ clean; bad rows ⇒ defects.
{
  check(P4.assessDataQuality([{ id: "a", age: 30 }, { id: "b", age: 50 }], schema).clean === true, "clean rows ⇒ quality clean (score 1)");
  const bad = P4.assessDataQuality([{ id: "a", age: 200 }, { id: "b" }, { id: "a", age: 30 }], schema);
  check(bad.rangeErrors >= 1 && bad.nulls >= 1 && bad.duplicates >= 1 && bad.clean === false, "range violation + null + duplicate ⇒ defects flagged");
}

// lineage fail-closed.
check(P4.checkLineage({ source: "s", transforms: ["t"] }).ok === true && P4.checkLineage({}).ok === false, "lineage: present ⇒ ok; missing ⇒ fail-closed");

// schema compatibility (reuses api-contract): a new required field ⇒ BREAKING.
{
  const compat = P4.schemaCompatibility(schema, Object.assign({}, schema, { email: { type: "string", required: true } }));
  check(compat.compatible === false && compat.breaking.length >= 1, "schema: new required field ⇒ BREAKING (via api-contract)");
  const typeChange = P4.schemaCompatibility(schema, { id: { type: "number", required: true }, age: { type: "number", required: true } });
  check(typeChange.compatible === false, "schema: field type change ⇒ BREAKING");
}

// idempotent replay.
check(P4.idempotentReplay([{ id: "a" }, { id: "b" }]).idempotent === true, "idempotent replay: ingesting twice ⇒ same deduped set");

// E2 reference ⇒ clean, level E2; E3 with a breaking schema ⇒ degraded.
{
  const e2 = P4.runReferenceProject({});
  check(e2.synthetic === true && e2.profession === "P4" && e2.quality.clean === true && e2.level === "E2" && e2.degraded === false, "E2: clean synthetic dataset ⇒ level E2, not degraded");
  const e3 = P4.runReferenceProject({ newSchema: Object.assign({}, schema, { ssn: { type: "string", required: true } }) });
  check(e3.level === "E3" && e3.degraded === true, "E3: breaking schema change ⇒ degradation flagged");
}
check(P4.P4_DATA_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P4 DATA REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
