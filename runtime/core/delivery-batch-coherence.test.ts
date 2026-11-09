#!/usr/bin/env node
"use strict";

const B = require("./delivery-batch-coherence");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// related: shared file / dep edge / shared impacted module.
check(B.related({ id: "a", writeSet: ["f.ts"] }, { id: "b", writeSet: ["f.ts"] }, {}), "related: shared write-set file");
check(B.related({ id: "a", deps: ["b"] }, { id: "b" }, {}), "related: declared dependency edge");
check(B.related({ id: "a" }, { id: "b" }, { a: ["x"], b: ["x"] }), "related: shared impacted module");
check(!B.related({ id: "a", writeSet: ["f.ts"] }, { id: "b", writeSet: ["g.ts"] }, {}), "unrelated: disjoint write-sets, no deps");

// assessBatch: related missions MAY_BATCH, independent MUST_SEPARATE.
const r = B.assessBatch({ missions: [
  { id: "m1", writeSet: ["runtime/core/a.ts"] },
  { id: "m2", writeSet: ["runtime/core/a.ts"] },   // shares file with m1
  { id: "m3", writeSet: ["runtime/core/z.ts"] },   // independent
] });
const may = r.groups.find((g: any) => g.decision === "MAY_BATCH");
check(may && may.members.length === 2 && may.members.includes("m1") && may.members.includes("m2"), "assessBatch: m1+m2 (shared file) MAY_BATCH");
check(may && may.ciWaitsSaved === 1, "assessBatch: 2-member batch saves 1 CI wait");
check(r.mustSeparate.some((g: any) => g.members.length === 1 && g.members[0] === "m3"), "assessBatch: independent m3 MUST_SEPARATE");
check(r.summary.ciWaitsSaved === 1, "assessBatch: total ciWaitsSaved = 1");

// fail-closed: no declared write-set ⇒ never batched.
const r2 = B.assessBatch({ missions: [
  { id: "x", writeSet: ["c.ts"] }, { id: "y", writeSet: ["c.ts"] }, { id: "nows" },
] });
check(r2.mustSeparate.some((g: any) => g.members[0] === "nows"), "fail-closed: mission with no write-set MUST_SEPARATE");
check(r2.mayBatch.length === 1 && r2.mayBatch[0].members.length === 2, "fail-closed: only the proven-related pair batches");

// maxBatch cap: an over-large related group is split-required (MUST_SEPARATE), not silently batched.
const big = { missions: Array.from({ length: 5 }, (_: any, i: number) => ({ id: "b" + i, writeSet: ["shared.ts"] })), maxBatch: 3 };
const r3 = B.assessBatch(big);
check(r3.mayBatch.length === 0 && r3.mustSeparate.some((g: any) => /exceeds maxBatch/.test(g.reason)), "maxBatch: over-large related group ⇒ MUST_SEPARATE (bounded blast radius)");

// transitive batching: m1-m2 (file), m2-m3 (dep) ⇒ one connected component of 3.
const r4 = B.assessBatch({ missions: [
  { id: "m1", writeSet: ["p.ts"] }, { id: "m2", writeSet: ["p.ts"], deps: ["m3"] }, { id: "m3", writeSet: ["q.ts"] },
] });
check(r4.mayBatch.length === 1 && r4.mayBatch[0].members.length === 3, "transitive: connected component of 3 batches together");

// controls preserved: contract states identical controls / no fewer checks.
check(/IDENTICAL controls|same full gate/i.test(JSON.stringify(B.DELIVERY_BATCH_COHERENCE_CONTRACT.invariants)), "contract: identical controls, same full gate");
check(/never grouped?|never batched|NEVER batched|fail-closed/i.test(JSON.stringify(B.DELIVERY_BATCH_COHERENCE_CONTRACT.invariants)), "contract: fail-closed on unprovable relatedness");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 DELIVERY BATCH COHERENCE (throughput)\n");
process.exit(failures === 0 ? 0 : 1);

export {};
