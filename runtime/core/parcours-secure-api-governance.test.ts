#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("./parcours-secure-api-governance");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-INT-34 — SECURE-API-GOVERNANCE (P3→P8→P15→P6)");

const contract = { version: "1.0", requiredIn: ["id"], requiredOut: ["status"] };
const goodDeps = [{ name: "left-pad", license: "MIT" }, { name: "lodash", license: "MIT" }];
const goodExchange = { version: "1.0", in: { id: "x" }, out: { status: "ok" } };

// clean ⇒ READY
{
  const r = S.runSecureApiGovernance({ deps: goodDeps, contract, exchange: goodExchange });
  check(r.verdict === "READY" && r.p3.ok && r.p8.ok && r.p15.status === "COMPLETED", "clean deps + valid exchange ⇒ READY");
}
// P3: copyleft/denied license ⇒ BLOCKED
{
  const r = S.runSecureApiGovernance({ deps: [{ name: "x", license: "GPL-3.0" }], contract, exchange: goodExchange });
  check(r.verdict === "BLOCKED" && r.p3.ok === false && r.p3.violations.length === 1, "GPL-3.0 dependency ⇒ P3 violation ⇒ BLOCKED");
}
// P8: version mismatch ⇒ BLOCKED
check(S.runSecureApiGovernance({ deps: goodDeps, contract, exchange: { version: "2.0", in: { id: "x" }, out: { status: "ok" } } }).verdict === "BLOCKED", "API version mismatch ⇒ BLOCKED");
// P8: missing required field ⇒ BLOCKED
{
  const r = S.runSecureApiGovernance({ deps: goodDeps, contract, exchange: { version: "1.0", in: {}, out: { status: "ok" } } });
  check(r.verdict === "BLOCKED" && r.p8.ok === false && r.p8.errors.some((e: any) => /missing input field 'id'/.test(e)), "missing input 'id' ⇒ P8 error ⇒ BLOCKED");
}
// both fail ⇒ BLOCKED, both surfaced
{
  const r = S.runSecureApiGovernance({ deps: [{ name: "x", license: "AGPL-3.0" }], contract, exchange: { version: "9", in: {}, out: {} } });
  check(r.verdict === "BLOCKED" && r.p3.ok === false && r.p8.ok === false, "P3 + P8 both fail ⇒ BLOCKED, both surfaced");
}
// unit: validators
check(S.validateApiExchange(contract, goodExchange).ok === true, "validateApiExchange: valid exchange ok");
check(S.securityGate([{ name: "a", license: "MIT" }]).ok === true && S.securityGate([{ name: "a", license: "GPL-2.0" }]).ok === false, "securityGate: MIT ok, GPL-2.0 blocked");
// determinism
check(JSON.stringify(S.runSecureApiGovernance({ deps: goodDeps, contract, exchange: goodExchange })) === JSON.stringify(S.runSecureApiGovernance({ deps: goodDeps, contract, exchange: goodExchange })), "deterministic parcours");
console.log(failures === 0 ? "ALL PASS — WI-INT-34 SECURE-API-GOVERNANCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
