#!/usr/bin/env node
"use strict";
const assert = require("assert");
const A = require("./api-contract");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("P8 — API CONTRACT");

const contract = {
  version: "1.0", operationId: "createOrder",
  requiredIn: ["id"], requiredOut: ["status"],
  inputSchema: { id: "string", qty: "number" }, outputSchema: { status: "string" },
  errors: ["NOT_FOUND", "RATE_LIMITED"], idempotent: true,
  auth: { required: true, scopes: ["orders:write"] },
};
function req(over?: any): any { return Object.assign({ version: "1.0", in: { id: "x", qty: 2 }, principal: "user-1", scopes: ["orders:write"], idempotencyKey: "k1" }, over || {}); }
function res(over?: any): any { return Object.assign({ version: "1.0", out: { status: "ok" } }, over || {}); }

// POSITIVE — valid request/response/exchange.
check(A.validateRequest(contract, req()).ok === true, "valid request ⇒ ok");
check(A.validateResponse(contract, res()).ok === true, "valid response ⇒ ok");
check(A.validateExchange(contract, { ...req(), ...res() }, { seenKeys: [] }).ok === true, "valid full exchange ⇒ ok");

// NEGATIVE — version / missing field / type / auth.
check(A.validateRequest(contract, req({ version: "2.0" })).errors.some((e: any) => e.code === "VERSION"), "version mismatch ⇒ VERSION error");
check(A.validateRequest(contract, req({ in: { qty: 2 } })).errors.some((e: any) => e.code === "VALIDATION" && e.field === "in.id"), "missing required input ⇒ VALIDATION error");
check(A.validateRequest(contract, req({ in: { id: "x", qty: "two" } })).errors.some((e: any) => e.code === "TYPE" && e.field === "in.qty"), "wrong input type ⇒ TYPE error");
check(A.validateResponse(contract, res({ out: {} })).errors.some((e: any) => e.field === "out.status"), "missing required output ⇒ VALIDATION error");
check(A.validateResponse(contract, res({ out: { status: 200 } })).errors.some((e: any) => e.code === "TYPE"), "wrong output type ⇒ TYPE error");

// AUTH — missing scope / unauthenticated.
check(A.authCheck(contract, req({ scopes: [] })).errors.some((e: any) => /orders:write/.test(e.detail)), "missing required scope ⇒ AUTH error");
check(A.authCheck(contract, req({ principal: undefined, authenticated: false })).ok === false, "unauthenticated when contract requires auth ⇒ AUTH error");
check(A.authCheck({ auth: { required: false } }, {}).ok === true, "contract not requiring auth ⇒ ok");

// ERROR response — declared vs undeclared.
check(A.validateResponse(contract, { error: "NOT_FOUND" }).ok === true, "declared error code ⇒ ok");
check(A.validateResponse(contract, { error: "KABOOM" }).ok === false, "undeclared error code ⇒ rejected");

// IDEMPOTENCY — required key / replay duplicate.
check(A.idempotencyCheck(contract, req({ idempotencyKey: undefined }), []).decision === "MISSING_KEY", "idempotent op without key ⇒ MISSING_KEY");
check(A.idempotencyCheck(contract, req(), ["k1"]).decision === "DUPLICATE", "replayed idempotencyKey ⇒ DUPLICATE (safe)");
check(A.idempotencyCheck(contract, req(), []).decision === "PROCEED", "fresh idempotencyKey ⇒ PROCEED");
check(A.idempotencyCheck({ idempotent: false }, {}, []).decision === "NOT_REQUIRED", "non-idempotent op ⇒ NOT_REQUIRED");

// COMPATIBILITY — breaking change detection (adversarial evolution).
{
  const v2 = { ...contract, version: "2.0", requiredIn: ["id", "customerId"] }; // new required input
  check(A.checkCompatibility(contract, v2).compatible === false && A.checkCompatibility(contract, v2).breaking.some((b: any) => /customerId/.test(b)), "new required input ⇒ BREAKING");
  const removedOut = { ...contract, requiredOut: [] };
  check(A.checkCompatibility(contract, removedOut).breaking.some((b: any) => /removed required output/.test(b)), "removed required output ⇒ BREAKING");
  const typeChange = { ...contract, inputSchema: { id: "number", qty: "number" } };
  check(A.checkCompatibility(contract, typeChange).breaking.some((b: any) => /type changed/.test(b)), "input type change ⇒ BREAKING");
  const downgrade = { ...contract, version: "0.9" };
  check(A.checkCompatibility(contract, downgrade).breaking.some((b: any) => /downgrade/.test(b)), "version downgrade ⇒ BREAKING");
  const addedError = { ...contract, errors: ["NOT_FOUND", "RATE_LIMITED", "CONFLICT"] };
  check(A.checkCompatibility(contract, addedError).compatible === true && A.checkCompatibility(contract, addedError).nonBreaking.some((b: any) => /CONFLICT/.test(b)), "new declared error ⇒ non-breaking");
}

// ADVERSARIAL — extra/injected input fields are ignored (not a false failure); empty inputs fail-closed on required.
check(A.validateRequest(contract, req({ in: { id: "x", qty: 2, __proto__pollution: 1, extra: "y" } })).ok === true, "extra/injected input fields are ignored (no false failure)");
check(A.validateRequest(contract, {}).ok === false, "empty request ⇒ fail-closed (required input missing)");

// INDEPENDENT VERIFICATION — validation is separate from execution (pure; no side effects, deterministic).
check(JSON.stringify(A.validateExchange(contract, { ...req(), ...res() }, { seenKeys: [] })) === JSON.stringify(A.validateExchange(contract, { ...req(), ...res() }, { seenKeys: [] })), "validation is deterministic (independent of execution)");

// no second authorizer — the module validates auth REQUIREMENT, it does not authorize.
check(/does NOT authorize/.test(A.API_CONTRACT_CONTRACT.notAuthority) && A.API_CONTRACT_CONTRACT.reuses.some((r: any) => /validateApiExchange/.test(r)), "no second authorizer / contract engine (reuses canonical base)");

console.log(failures === 0 ? "ALL PASS — P8 API CONTRACT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
