#!/usr/bin/env node
"use strict";
const assert = require("assert");
const K = require("./p12-idempotency-key-collision");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W8 — IDEMPOTENCY-KEY COLLISION");
let j = K.recordIdempotent({}, "k1", { op: "charge", amount: 100 }, { ok: true });
// same key + same payload (key order irrelevant) ⇒ DUPLICATE (safe replay).
{
  const r = K.guardIdempotent({ key: "k1", request: { amount: 100, op: "charge" }, journal: j });
  check(r.decision === "DUPLICATE" && r.result && r.result.ok === true, "same key + matching fingerprint ⇒ DUPLICATE (replays stored result)");
}
// same key + different payload ⇒ COLLISION (reject, never replay).
{
  const r = K.guardIdempotent({ key: "k1", request: { op: "charge", amount: 999 }, journal: j });
  check(r.decision === "COLLISION" && r.result === undefined, "same key + different fingerprint ⇒ COLLISION (no replay)");
}
// new key ⇒ PROCEED.
check(K.guardIdempotent({ key: "k2", request: { x: 1 }, journal: j }).decision === "PROCEED", "new key ⇒ PROCEED");
// missing key ⇒ COLLISION (fail-closed).
check(K.guardIdempotent({ request: { x: 1 }, journal: j }).decision === "COLLISION", "missing key ⇒ COLLISION (fail-closed)");
// stored entry with no fingerprint ⇒ COLLISION (fail-closed).
check(K.guardIdempotent({ key: "kx", request: { x: 1 }, journal: { kx: { result: {} } } }).decision === "COLLISION", "stored entry w/o fingerprint ⇒ COLLISION (fail-closed)");
// record never overwrites an existing key.
{
  const j2 = K.recordIdempotent(j, "k1", { op: "x" }, { ok: false });
  check(j2.k1.result.ok === true, "record never overwrites an existing key (final)");
}
check(K.IDEMPOTENCY_COLLISION_CONTRACT.invariants.some((i: any) => /NEVER silently replayed/.test(i)), "contract: never silently replayed");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W8 IDEMPOTENCY COLLISION" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
