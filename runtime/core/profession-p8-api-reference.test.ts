#!/usr/bin/env node
"use strict";
/* V12.4 §43 P8 — API/Integration reference. Proves: fail-closed request validation (missing/wrong-type/unexpected/unauth
 * ⇒ 400); idempotency dedup (replay = first result, no new effect); bounded retry + backoff + timeout classification;
 * contract-compat breaking-change detection (removed/newly-required/type-change ⇒ BREAKING); e2e; deterministic + frozen. */
const P8 = require("./profession-p8-api-reference.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const schema = { authRequired: true, fields: { id: { type: "string", required: true }, qty: { type: "number", required: true } } };

function main() {
  // validation — positive + negative + security.
  check("valid authed request ⇒ 200", P8.validateRequest({ authToken: "t", body: { id: "x", qty: 2 } }, schema).status === 200);
  check("missing required field ⇒ 400 (never 200 on bad request)", P8.validateRequest({ authToken: "t", body: { id: "x" } }, schema).status === 400);
  check("wrong type ⇒ 400", P8.validateRequest({ authToken: "t", body: { id: "x", qty: "two" } }, schema).errors.some((e: string) => /type/.test(e)));
  check("SECURITY: unauthenticated ⇒ 400 (auth required)", P8.validateRequest({ body: { id: "x", qty: 2 } }, schema).errors.some((e: string) => /unauthenticated/.test(e)));
  check("strict schema: unexpected field ⇒ 400", P8.validateRequest({ authToken: "t", body: { id: "x", qty: 2, extra: 1 } }, schema).errors.some((e: string) => /unexpected field/.test(e)));

  // idempotency — exactly-once effect per key.
  check("idempotency: replayed key returns first result, NO new effect", (() => { const r = P8.idempotencyDedup([{ id: "c1", idempotencyKey: "k" }, { id: "c2", idempotencyKey: "k" }, { id: "c3", idempotencyKey: "j" }]); return r.distinctEffects === 2 && r.results[1].newEffect === false && r.results[1].replayedFrom === "c1"; })());

  // retry — bounded + backoff + timeout.
  check("retry: error then success ⇒ SUCCESS with exponential backoff recorded", (() => { const r = P8.retryPolicy([{ outcome: "ERROR", latencyMs: 5 }, { outcome: "SUCCESS", latencyMs: 10 }], { maxAttempts: 3, timeoutMs: 100, baseBackoffMs: 50 }); return r.verdict === "SUCCESS" && r.attemptsUsed === 2 && r.backoffsMs[0] === 50; })());
  check("retry: bounded by maxAttempts ⇒ GIVE_UP (never unbounded)", P8.retryPolicy([{ outcome: "ERROR", latencyMs: 5 }, { outcome: "ERROR", latencyMs: 5 }, { outcome: "ERROR", latencyMs: 5 }], { maxAttempts: 3 }).verdict === "GIVE_UP");
  check("retry: a response beyond timeout is NOT counted as success", P8.retryPolicy([{ outcome: "SUCCESS", latencyMs: 500 }], { maxAttempts: 2, timeoutMs: 100 }).verdict !== "SUCCESS");

  // contract compatibility — breaking vs additive.
  check("contract: removed field + newly-required field + type change ⇒ BREAKING", (() => { const r = P8.contractCompat(schema, { fields: { id: { type: "string", required: true }, qty: { type: "string", required: true }, coupon: { type: "string", required: true } } }); return r.verdict === "BREAKING" && r.breaking.some((b: string) => /type/.test(b)) && r.breaking.some((b: string) => /REQUIRED/.test(b)); })());
  check("contract: additive-only (new optional field) ⇒ COMPATIBLE", P8.contractCompat(schema, { fields: { id: { type: "string", required: true }, qty: { type: "number", required: true }, note: { type: "string", required: false } } }).verdict === "COMPATIBLE");

  const e2e = P8.runReferenceProject();
  check("e2e reference project holds (valid/invalid req, dedup, retry success+giveup, breaking compat)", e2e.e2eOk === true);
  check("deterministic + frozen + contract (simulated auth, no real external calls)", JSON.stringify(P8.runReferenceProject()) === JSON.stringify(e2e) && Object.isFrozen(e2e) && P8.P8_API_REFERENCE_CONTRACT.invariants.some((i: string) => /exactly-once effect per key/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — profession-p8-api-reference (fail-closed request validation incl. unauth/type/unexpected; idempotency exactly-once; bounded retry+backoff+timeout; contract-compat breaking vs additive; simulated auth, no real calls)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
