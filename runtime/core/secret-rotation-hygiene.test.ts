#!/usr/bin/env node
"use strict";
const assert = require("assert");
const K = require("./secret-rotation-hygiene");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W10 — SECRET ROTATION HYGIENE");
const asOf = "2026-11-08";
// fresh strong key ⇒ COMPLIANT.
check(K.assessKeyHygiene([{ id: "k1", algorithm: "sha-256", createdAt: "2026-10-01" }], { asOf }).verdict === "ALL_COMPLIANT", "fresh sha-256 ⇒ ALL_COMPLIANT");
// disallowed algorithm (sha1) ⇒ ALGORITHM_DISALLOWED.
check(K.assessKeyHygiene([{ id: "k", algorithm: "sha1", createdAt: "2026-10-01" }], { asOf }).keys[0].status === "ALGORITHM_DISALLOWED", "sha1 ⇒ ALGORITHM_DISALLOWED");
// rotation overdue (old key) ⇒ ROTATION_OVERDUE.
check(K.assessKeyHygiene([{ id: "k", algorithm: "rsa-3072", createdAt: "2024-01-01" }], { asOf, cryptoperiodDays: 365 }).keys[0].status === "ROTATION_OVERDUE", "2-year-old key ⇒ ROTATION_OVERDUE");
// 112-bit after 2030 cliff ⇒ ALGORITHM_DEPRECATED.
check(K.assessKeyHygiene([{ id: "k", algorithm: "rsa-2048", createdAt: "2031-01-01" }], { asOf: "2031-02-01" }).keys[0].status === "ALGORITHM_DEPRECATED", "rsa-2048 after 2030 ⇒ ALGORITHM_DEPRECATED");
// rsa-2048 BEFORE 2030 ⇒ acceptable (COMPLIANT).
check(K.assessKeyHygiene([{ id: "k", algorithm: "rsa-2048", createdAt: "2026-10-01" }], { asOf }).keys[0].status === "COMPLIANT", "rsa-2048 before 2030 ⇒ COMPLIANT");
// unknown algorithm ⇒ ALGORITHM_UNKNOWN (fail-closed).
check(K.assessKeyHygiene([{ id: "k", algorithm: "magic-cipher", createdAt: "2026-10-01" }], { asOf }).keys[0].status === "ALGORITHM_UNKNOWN", "unknown algo ⇒ ALGORITHM_UNKNOWN");
// no asOf ⇒ NO_ASOF (cannot verify age).
check(K.assessKeyHygiene([{ id: "k", algorithm: "sha-256", createdAt: "2026-10-01" }], {}).keys[0].status === "NO_ASOF", "no asOf ⇒ NO_ASOF (fail-closed)");
// future-dated ⇒ FUTURE_DATED.
check(K.assessKeyHygiene([{ id: "k", algorithm: "sha-256", createdAt: "2027-01-01" }], { asOf }).keys[0].status === "FUTURE_DATED", "future createdAt ⇒ FUTURE_DATED");
// plaintext literal secret ⇒ PLAINTEXT_SECRET_IN_CONFIG.
check(K.assessKeyHygiene([{ id: "k", algorithm: "sha-256", createdAt: "2026-10-01", material: "AKIAIOSFODNN7EXAMPLE" }], { asOf }).keys[0].status === "PLAINTEXT_SECRET_IN_CONFIG", "inline AWS-key literal ⇒ PLAINTEXT_SECRET_IN_CONFIG");
check(K.SECRET_ROTATION_HYGIENE_CONTRACT.invariants.some((i: any) => /never certified/.test(i)), "contract: deny-by-default never certified");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W10 SECRET ROTATION HYGIENE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
