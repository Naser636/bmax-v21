#!/usr/bin/env node
"use strict";

const A = require("./architecture-audit");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// detectCycles: finds a 2-cycle and is safe on a DAG.
const cyc = A.detectCycles({ a: ["b"], b: ["a"], c: ["a"] });
check(cyc.length >= 1, "detectCycles finds a cycle");
check(A.detectCycles({ a: ["b"], b: ["c"], c: [] }).length === 0, "detectCycles: DAG has no cycle");
check(A.detectCycles({ a: ["a"] }).length === 1, "detectCycles: self-loop is a cycle");
check(A.detectCycles(null).length === 0, "detectCycles: junk in → empty");

// responsibilitySignature: by contract domain + exports, independent of file name.
const s1 = A.responsibilitySignature({ id: "alpha-foo", exports: ["x", "y"], contractSource: "D — Billing" });
const s2 = A.responsibilitySignature({ id: "totally-different-name", exports: ["y", "x"], contractSource: "D — Billing" });
check(s1 === s2, "responsibilitySignature: same responsibility, different file names ⇒ same signature");
check(A.responsibilitySignature({ id: "n", exports: ["a"], contractSource: "D — Other" }) !== s1, "responsibilitySignature: different domain ⇒ different signature");
check(A.responsibilitySignature({ id: "n" }) === null, "responsibilitySignature: no exports + no domain ⇒ null");

// auditArchitecture: cycles + unused + duplication; every finding NEEDS_REVIEW.
const r = A.auditArchitecture({ modules: [
  { id: "a", deps: ["b"], consumers: ["x"], exports: ["foo"], contractSource: "D — Alpha" },
  { id: "b", deps: ["a"], consumers: ["a"], exports: ["foo"], contractSource: "D — Alpha" },
  { id: "orphan", deps: [], consumers: [], hasTest: false, exports: ["z"], contractSource: "D — Z" },
], entrypoints: [] });
check(r.summary.cycles >= 1, "audit: reports the a<->b cycle");
check(r.summary.unused === 1 && r.unusedCandidates[0].id === "orphan", "audit: orphan (no consumers, no test) flagged unused");
check(r.summary.duplicationGroups === 1 && r.duplicationCandidates[0].members.length === 2, "audit: a+b share responsibility ⇒ duplication candidate");
check(r.duplicationCandidates.every((d: any) => d.decision === "NEEDS_REVIEW"), "audit: duplication decision is NEEDS_REVIEW (similarity never authorizes a fusion)");
check(r.unusedCandidates.every((u: any) => u.decision === "NEEDS_REVIEW"), "audit: unused decision is NEEDS_REVIEW (never auto-retire)");

// fail-closed: a module WITH a test or consumers is NOT flagged unused.
const r2 = A.auditArchitecture({ modules: [
  { id: "tested", deps: [], consumers: [], hasTest: true, exports: ["q"], contractSource: "D — T" },
  { id: "used", deps: [], consumers: ["z"], hasTest: false, exports: ["w"], contractSource: "D — U" },
  { id: "entry", deps: [], consumers: [], hasTest: false, exports: ["e"], contractSource: "D — E" },
], entrypoints: ["entry"] });
check(r2.summary.unused === 0, "audit: tested / consumed / entrypoint modules are NOT flagged unused");

// contract invariants hold.
check(/similarity NEVER authorizes a fusion/i.test(JSON.stringify(A.ARCHITECTURE_AUDIT_CONTRACT.invariants)), "contract: similarity never authorizes a fusion");
check(/RESPONSIBILITY/i.test(JSON.stringify(A.ARCHITECTURE_AUDIT_CONTRACT.invariants)), "contract: duplication by responsibility not file name");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 ARCHITECTURE AUDIT (read-only)\n");
process.exit(failures === 0 ? 0 : 1);

export {};
