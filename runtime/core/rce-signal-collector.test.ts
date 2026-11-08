#!/usr/bin/env node
"use strict";
const assert = require("assert");
const C = require("./rce-signal-collector");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 3 / M-CH3-01 — RCE SIGNAL COLLECTOR + DEFECT DETECTION");
// classification by markers.
check(C.classifyDefect({ source: "tsc", detail: "TS2339 type mismatch" }) === "TYPE", "tsc/type ⇒ TYPE");
check(C.classifyDefect({ source: "test", detail: "regression: previously passing" }) === "REGRESSION", "regression marker ⇒ REGRESSION");
check(C.classifyDefect({ source: "security", detail: "CVE-2026-1 injection" }) === "VULNERABILITY", "security/CVE ⇒ VULNERABILITY");
check(C.classifyDefect({ detail: "cannot find module './x'" }) === "IMPORT", "module-not-found ⇒ IMPORT");
check(C.classifyDefect({ kind: "WORKFLOW_FAILURE" }) === "WORKFLOW_FAILURE", "explicit valid kind wins");
check(C.classifyDefect({ source: "???", detail: "???" }) === "UNKNOWN_DEFECT", "unrecognized ⇒ UNKNOWN_DEFECT (never dropped)");
// provenance fail-closed.
{
  const r = C.collect({ signals: [
    { id: "a", source: "tsc", detail: "type error", provenance: "x.ts@abc" },
    { id: "b", source: "test", detail: "assertion failed" },  // no provenance
  ] });
  check(r.counts.confirmed === 1 && r.counts.unattributed === 1, "signal without provenance ⇒ UNATTRIBUTED, not confirmed (fail-closed)");
  check(r.confirmed[0].attributed === true && r.unattributed[0].attributed === false, "attributed flag reflects provenance presence");
}
// aggregation by kind.
{
  const r = C.collect({ signals: [
    { source: "tsc", detail: "type", provenance: "p1" },
    { source: "test", detail: "regression", provenance: "p2" },
    { source: "security", detail: "vuln injection", provenance: "p3" },
  ] });
  check(r.byKind.TYPE === 1 && r.byKind.REGRESSION === 1 && r.byKind.VULNERABILITY === 1, "byKind aggregation");
}
// empty ⇒ zero, no fabrication.
check(C.collect({ signals: [] }).counts.total === 0, "empty ⇒ 0 signals");
check(C.collect(null).counts.total === 0, "null ⇒ 0 (no crash)");
check(C.RCE_SIGNAL_COLLECTOR_CONTRACT.invariants.some((i: any) => /never counted among confirmed defects/.test(i)), "contract: unattributed never confirmed");
console.log(failures === 0 ? "ALL PASS — V5 M-CH3-01 RCE SIGNAL COLLECTOR" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
