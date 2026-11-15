#!/usr/bin/env node
"use strict";
/* IMP-P8-API-POSTURE — positive-security validator; deny-by-default on undeclared path/method/field. */
const A = require("./odg-api-security-posture.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const spec = { paths: { "/orders": { POST: { required: ["sku", "qty"], params: { sku: "string", qty: "number" } } } } };

function main() {
  check("conformant request admitted", A.validate(spec, { path: "/orders", method: "POST", body: { sku: "x", qty: 2 } }).admitted === true);
  check("undeclared path ⇒ REJECTED (deny-by-default)", A.validate(spec, { path: "/admin", method: "POST", body: {} }).admitted === false);
  check("undeclared method ⇒ REJECTED", A.validate(spec, { path: "/orders", method: "DELETE", body: {} }).admitted === false);
  check("missing required field ⇒ REJECTED", (() => { const r = A.validate(spec, { path: "/orders", method: "POST", body: { sku: "x" } }); return r.admitted === false && r.violations.some((v: string) => /missing required field 'qty'/.test(v)); })());
  check("undeclared body field ⇒ REJECTED (mass-assignment guard)", (() => { const r = A.validate(spec, { path: "/orders", method: "POST", body: { sku: "x", qty: 2, isAdmin: true } }); return r.admitted === false && r.violations.some((v: string) => /undeclared field 'isAdmin'/.test(v)); })());
  check("wrong field type ⇒ REJECTED", A.validate(spec, { path: "/orders", method: "POST", body: { sku: "x", qty: "two" } }).admitted === false);
  check("rate-limit headers specified as expected posture", A.RATE_LIMIT_HEADERS.includes("RateLimit-Limit") && A.validate(spec, { path: "/orders", method: "POST", body: { sku: "x", qty: 2 } }).rateLimitHeadersExpected.length === 3);
  check("contract + honesty (deny-by-default, no execution)", A.API_SECURITY_POSTURE_CONTRACT.invariants.some((i: string) => /never admitted by omission/.test(i)) && /NO request is executed/.test(A.validate(spec, { path: "/x", method: "GET" }).honesty));
  check("deterministic", JSON.stringify(A.validate(spec, { path: "/orders", method: "POST", body: { sku: "x", qty: 2 } })) === JSON.stringify(A.validate(spec, { path: "/orders", method: "POST", body: { sku: "x", qty: 2 } })));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — api-security-posture (IMP-P8: positive-security OpenAPI validator; deny-by-default undeclared path/method/field; rate-limit posture; no execution)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
