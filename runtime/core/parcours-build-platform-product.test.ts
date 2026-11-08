#!/usr/bin/env node
"use strict";
const assert = require("assert");
const A = require("./parcours-build-platform-product");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-INT-25 — PARCOURS A (P5→P14→P1)");

check(A.runBuildToProduct({ template: "library-ts", params: { name: "lib" } }).verdict === "READY", "library-ts ⇒ READY (generated+built+product-ready)");
check(A.runBuildToProduct({ template: "service-ts", params: { name: "svc" } }).verdict === "REJECTED", "service-ts without config.port ⇒ REJECTED at P14 (fail-closed)");
{
  const r = A.runBuildToProduct({ template: "service-ts", params: { name: "svc", config: { port: 80 } } });
  check(r.verdict === "READY" && r.p5.reproducible === true && r.p1.ok === true, "service-ts with port ⇒ READY, reproducible, product-ready");
}
check(A.runBuildToProduct({ template: "library-ts", params: { name: "lib" }, driftSource: true }).p5.driftedOnChange.length > 0, "changed source ⇒ drift detected (P5)");
check(A.runBuildToProduct({ template: "nope", params: { name: "x" } }).verdict === "REJECTED", "unknown template ⇒ REJECTED");
check(JSON.stringify(A.runBuildToProduct({ template: "cli-ts", params: { name: "t" } })) === JSON.stringify(A.runBuildToProduct({ template: "cli-ts", params: { name: "t" } })), "deterministic parcours A");
console.log(failures === 0 ? "ALL PASS — WI-INT-25 PARCOURS A" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
