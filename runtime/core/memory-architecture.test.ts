#!/usr/bin/env node
"use strict";
const assert = require("assert");
const M = require("./memory-architecture");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 PHASE 1 / M-CH1-02 — MEMORY ARCHITECTURE");
const trustedRec = { id: "m1", provenance: "mission:M1", validUntil: 200, status: "ACTIVE", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "semantic" };
const untrustedRec = { id: "m2", provenance: "x", authoredBy: "MYSTERY", family: "working" };
// trusted record returned, grouped by family; untrusted excluded.
{
  const r = M.accessMemory([trustedRec, untrustedRec], { asOf: 100, trustedAuthors: ["ODG"] });
  check(r.trustedCount === 1 && r.excludedCount === 1, "1 trusted returned, 1 excluded");
  check(r.byFamily.semantic && r.byFamily.semantic[0].id === "m1", "trusted record grouped under its family (semantic)");
  check(r.excluded.some((e: any) => e.id === "m2" && e.verdict === "UNATTRIBUTED"), "untrusted record excluded with verdict");
}
// stale record ⇒ excluded (never trusted knowledge).
{
  const r = M.accessMemory([trustedRec], { asOf: 300, trustedAuthors: ["ODG"] });
  check(r.trustedCount === 0 && r.excluded[0].verdict === "STALE", "stale record ⇒ excluded (never trusted)");
}
// empty trustedAuthors ⇒ nothing trusted (deny-by-default).
check(M.accessMemory([trustedRec], { asOf: 100 }).trustedCount === 0, "no trustedAuthors ⇒ nothing trusted (deny-by-default)");
// empty ⇒ zero.
check(M.accessMemory([], {}).total === 0, "empty ⇒ 0");
check(M.MEMORY_ARCHITECTURE_CONTRACT.invariants.some((i: any) => /never served as trusted knowledge/i.test(i)), "contract: untrusted never served");
console.log(failures === 0 ? "ALL PASS — V5 M-CH1-02 MEMORY ARCHITECTURE" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
