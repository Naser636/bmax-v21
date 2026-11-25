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
// ---- V17.8 P4 acceptance tests (contract V178-P4 AC1–AC3), reached through the canonical layer M.semanticRetrieval() ----
(async () => {
  const fs = require("fs"), os = require("os"), path = require("path");
  const SR = M.semanticRetrieval();
  const D = 8; const flat = async (t: string[]) => t.map(() => { const v = new Array(D).fill(0); v[0] = 1; return v; });   // uninformative vectors ⇒ isolates FTS
  const R = (id: string, text: string) => ({ id, text, provenance: "mission:M1", validUntil: 200, status: "ACTIVE", authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", family: "semantic" });
  const A = { asOf: 100, trustedAuthors: ["ODG"] };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "memarch-p4-"));
  const ix = SR.openIndex({ dir, tenant: "t1", dims: D });
  await SR.syncIndex(ix, [R("a", "béton armé coulage"), R("b", "béton béton béton fondation"), R("c", "charpente bois")], A, flat);
  const fts = ix.db.prepare("select d.id from fts join docs d on d.rid = fts.rowid where fts match ? order by rank").all(SR.ftsQuery("béton"));
  check(fts.length === 2 && fts[0].id === "b" && !fts.some((r: any) => r.id === "c"), "V178-P4/AC1: FTS5 leg returns exact-term matches ranked by bm25 (higher term frequency first; non-matching excluded)");
  const q1 = await SR.query(ix, "béton fondation", flat, { k: 3 }); const q2 = await SR.query(ix, "béton fondation", flat, { k: 3 });
  check(q1.length > 0 && JSON.stringify(q1) === JSON.stringify(q2) && q1.every((r: any, i: number) => i === 0 || q1[i - 1].score >= r.score), "V178-P4/AC2: RRF fusion is deterministic for fixed inputs (identical ranked output, scores non-increasing)");
  const ix2 = SR.openIndex({ dir, tenant: "t2", dims: D });
  await SR.syncIndex(ix2, [R("z", "toiture zinc")], A, flat);
  const cross1 = await SR.query(ix2, "béton", flat, { k: 5 }); const cross2 = await SR.query(ix, "zinc toiture", flat, { k: 5 });
  check(!cross1.some((r: any) => ["a", "b", "c"].includes(r.id)) && !cross2.some((r: any) => r.id === "z") && ix.file !== ix2.file, "V178-P4/AC3: two tenants never read each other's file");
  ix.db.close(); ix2.db.close();
  console.log(failures === 0 ? "ALL PASS — V5 M-CH1-02 MEMORY ARCHITECTURE (+ V178-P4 AC1–AC3)" : "FAILURES: " + failures);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
