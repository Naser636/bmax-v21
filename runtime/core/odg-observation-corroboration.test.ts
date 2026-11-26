#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx.
"use strict";
/* REPRO-1 — SYNTHETIC fixtures (labelled): mechanism only, never the truth of a real observation. */
const assert = require("assert");
const OC = require("./odg-observation-corroboration.js");
const MA = require("./memory-architecture.js");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
console.log("odg-observation-corroboration — REPRO-1 (SYNTHETIC fixtures)");
const rec = (head, startedAt, opts) => ({ run: { head, startedAt, runner: "SYNTHETIC" }, provenance: { actor: (opts && opts.actor) || "ODG" }, taskSet: { version: "TS", sha256: "ts-sha" },
  ...(opts && opts.replay ? { replay: { source: "SYN-A" } } : {}),
  trials: [1, 2].map((trial) => ({ task: "t", trial, controlT0: { measured: true, passed: (opts && opts.passed) !== undefined ? opts.passed : true }, candidates: [{ point: 0, model: "m", temperature: 0, seed: 42, codeSha256: (opts && opts.code) || "code-1" }] })) });
const ex = (r, path) => OC.extractT0Observations(r, { path, sha256: "sha-" + path });
const A = rec("h1", "2026-11-25T10:00:00Z"), B2 = rec("h2", "2026-11-26T01:00:00Z"), R = rec("h3", "2026-11-26T02:00:00Z", { replay: true }), X = rec("h4", "2026-11-26T03:00:00Z", { passed: false }), P = rec("h5", "2026-11-26T04:00:00Z", { actor: "PROVIDER" });
ok("extraction: 2 observations per measured trial (code sha + outcome), source sha kept", ex(A, "SYN-A").length === 4 && ex(A, "SYN-A").every((o) => o.source.sha256 === "sha-SYN-A"));
ok("replay source marked NOT independent", ex(R, "SYN-R").every((o) => o.source.independent === false));
const c2 = OC.corroborate([...ex(A, "SYN-A"), ...ex(B2, "SYN-B")]);
ok("2 independent ODG executions, same value ⇒ CORROBORATED (trials of one run = one vote)", c2.tally.corroborated === 2 && c2.results.every((r) => r.independentExecutions === 2));
ok("single source ⇒ UNVERIFIED", OC.corroborate(ex(A, "SYN-A")).results.every((r) => r.status === "UNVERIFIED"));
ok("replay never counts as independent (A + its replay ⇒ UNVERIFIED)", OC.corroborate([...ex(A, "SYN-A"), ...ex(R, "SYN-R")]).results.every((r) => r.status === "UNVERIFIED" && /non-independent/.test(r.reasons[0])));
ok("non-ODG actor never counts", OC.corroborate([...ex(A, "SYN-A"), ...ex(P, "SYN-P")]).results.every((r) => r.status === "UNVERIFIED"));
const cx = OC.corroborate([...ex(A, "SYN-A"), ...ex(B2, "SYN-B"), ...ex(X, "SYN-X")]);
ok("a same-key source with a different value ⇒ CONTRADICTED (outcome key)", cx.results.find((r) => /outcome/.test(r.key.metric)).status === "CONTRADICTED");
ok("different conditions never merge (other seed ⇒ other key)", (() => { const o = ex(B2, "SYN-B").map((x) => ({ ...x, conditions: { ...x.conditions, seed: 7 } })); return OC.corroborate([...ex(A, "SYN-A"), ...o]).results.every((r) => r.status === "UNVERIFIED"); })());
ok("observation without a recorded sha is ignored (provenance required)", OC.corroborate(ex(A, "SYN-A").map((o) => ({ ...o, source: { ...o.source, sha256: "" } }))).results.length === 0);
const now = Date.parse("2026-11-27T00:00:00Z");
const mems = [...c2.results, ...cx.results.filter((r) => r.status === "CONTRADICTED")].map((r) => OC.toMemory(r, now));
ok("toMemory: CORROBORATED ⇒ VERIFIED/isFact; CONTRADICTED ⇒ INVALIDATED", mems.filter((m) => m.isFact).length === 2 && mems.some((m) => m.status === "INVALIDATED" && !m.isFact) && mems.every((m) => m.knowledgeClass === "REAL_OBSERVATION"));
const acc = MA.accessMemory(mems, { asOf: now, trustedAuthors: ["ODG"] });
ok("canonical trust gate trusts exactly the corroborated records", acc.trustedCount === 2 && mems.filter((m) => m.isFact).every((m) => acc.trusted.some((t) => t.id === m.id)));
ok("an expired record is not trusted (STALE)", MA.accessMemory(mems.filter((m) => m.isFact), { asOf: now + 200 * 86400000, trustedAuthors: ["ODG"] }).trustedCount === 0);
ok("claim text states the conditions (internal measurement, never a general truth)", mems[0].claim.startsWith("Internal ODG observation (REPRO-1)") && /temperature 0, seed 42/.test(mems[0].claim));
console.log(`\nodg-observation-corroboration — ${passed} assertions passed.`);
