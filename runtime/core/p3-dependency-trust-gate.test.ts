#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./p3-dependency-trust-gate");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 14 P3 — DEPENDENCY TRUST GATE");

// ADMIT: exact-pinned + safe license + integrity + not a typosquat.
{
  const r = P.vetDependency({ name: "lodash", version: "4.17.21", license: "MIT", integrity: "sha512-abc" });
  check(r.admit === true && r.decision === "ADMIT", "pinned MIT dep with integrity ⇒ ADMIT");
}

// exact-pin enforcement.
{
  check(P.isExactPin("1.2.3") === true, "1.2.3 is exact-pinned");
  check(P.isExactPin("^1.2.3") === false && P.isExactPin("~1.2") === false && P.isExactPin("latest") === false && P.isExactPin("1.x") === false, "ranges/tags are NOT exact pins");
  const r = P.vetDependency({ name: "lodash", version: "^4.17.0", license: "MIT", integrity: "sha512-abc" });
  check(r.admit === false && r.reasons.some((x: any) => /not exact-pinned/.test(x)), "range version ⇒ REJECT");
}

// unsafe license ⇒ REJECT (reuses license-policy fail-closed).
{
  const gpl = P.vetDependency({ name: "somelib", version: "1.0.0", license: "GPL-3.0-only", integrity: "sha512-x" });
  check(gpl.admit === false && gpl.reasons.some((x: any) => /license/.test(x)), "strong-copyleft license ⇒ REJECT");
  const unknown = P.vetDependency({ name: "somelib", version: "1.0.0", license: "", integrity: "sha512-x" });
  check(unknown.admit === false, "unknown/missing license ⇒ REJECT (fail-closed)");
}

// missing integrity ⇒ REJECT.
{
  const r = P.vetDependency({ name: "somelib", version: "1.0.0", license: "MIT" });
  check(r.admit === false && r.reasons.some((x: any) => /integrity/.test(x)), "no integrity hash ⇒ REJECT");
}

// typosquat detection: a name one edit from a popular package ⇒ REJECT.
{
  check(P.typosquatOf("lodahs") === "lodash" || P.typosquatOf("lodas") === "lodash", "'lodas' is a typosquat of lodash");
  const r = P.vetDependency({ name: "expres", version: "1.0.0", license: "MIT", integrity: "sha512-x" }); // 1 edit from express
  check(r.admit === false && r.reasons.some((x: any) => /typosquat/.test(x)), "typosquat 'expres' ⇒ REJECT");
  check(P.typosquatOf("express") === null, "the real 'express' is not flagged");
}

check(P.P3_DEP_TRUST_CONTRACT.invariants.some((i: any) => /exact-pinned/.test(i)), "contract documents exact-pin requirement");

console.log(failures === 0 ? "ALL PASS — SÉRIE 14 P3 DEPENDENCY TRUST GATE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
