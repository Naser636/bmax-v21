#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the productized Code Health Check offer: per-file PASS/FAIL/UNSUPPORTED/BLOCKED
// with real tool attribution, 0 false PASS on broken inputs, UNSUPPORTED declared (not faked), honest limits + zero
// retention. Injected runner (zero subprocess); a real-toolchain run is proven separately.
"use strict";
const assert = require("assert");
const S = require("./code-health-service.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const ALL = { JavaScript: true, TypeScript: true, Python: true };
// Injected checker: FAIL iff content contains "BROKEN"; else PASS.
const runner = (bin, args, opts) => { const f = args[args.length - 1]; let c = ""; try { c = require("fs").readFileSync(f, "utf8"); } catch {} return { exitCode: /BROKEN/.test(c) ? 1 : 0, stdout: "", stderr: /BROKEN/.test(c) ? "SyntaxError" : "" }; };

// (1) OFFER is honest: scoped, no certification/guarantee, commercial state = €0.
ok("OFFER declares limits (not audit/cert/guarantee)", S.OFFER.limits.some(l => /NOT an audit/.test(l)) && /HYPOTHESIS ONLY/.test(S.OFFER.priceHypothesis));
ok("OFFER commercial state = no sale / €0", /NO contract, NO invoice, NO cash/.test(S.OFFER.commercialState) && /NOT_IMPLEMENTED/.test(S.OFFER.journey.billing));

// (2) mixed batch: clean PASS, broken FAIL (0 false PASS), unsupported declared.
const res = S.runHealthCheck({ files: [
  { path: "a.js", language: "JavaScript", content: "const x = 1;\n" },
  { path: "b.js", language: "JavaScript", content: "BROKEN\n" },
  { path: "c.ts", language: "TypeScript", content: "export const y: number = 2;\n" },
  { path: "d.go", language: "Go", content: "package main\n" },
] }, { runner, toolchain: ALL });
ok("report produced with per-file statuses", res.ok && res.report.perFile.length === 4);
ok("clean ⇒ PASS, broken ⇒ FAIL (0 false PASS)", res.report.counts.PASS === 2 && res.report.counts.FAIL === 1 && res.report.perFile.find(f => f.path === "b.js").status === "FAIL");
ok("Go ⇒ UNSUPPORTED (declared, not faked, not counted as PASS)", res.report.counts.UNSUPPORTED === 1 && res.report.perFile.find(f => f.path === "d.go").status === "UNSUPPORTED");
ok("healthy=false when any FAIL; tool attributed", res.report.healthy === false && res.report.perFile.find(f => f.path === "a.js").tool === "node");

// (3) all-clean ⇒ healthy true.
const clean = S.runHealthCheck({ files: [{ path: "a.js", language: "JavaScript", content: "const x=1;\n" }] }, { runner, toolchain: ALL });
ok("all-clean ⇒ healthy true", clean.report.healthy === true && clean.report.counts.FAIL === 0);

// (4) toolchain absent ⇒ UNSUPPORTED (honest), not PASS.
const noTc = S.runHealthCheck({ files: [{ path: "a.py", language: "Python", content: "x=1\n" }] }, { runner, toolchain: { JavaScript: true, TypeScript: true, Python: false } });
ok("absent toolchain ⇒ UNSUPPORTED (not PASS)", noTc.report.counts.UNSUPPORTED === 1 && noTc.report.counts.PASS === 0);

// (5) fail-closed inputs.
ok("fail-closed: no files", S.runHealthCheck({ files: [] }).code === "INVALID_INPUT");
ok("fail-closed: not an object", S.runHealthCheck(null).code === "INVALID_INPUT");
ok("malformed file entry ⇒ BLOCKED (not PASS)", S.runHealthCheck({ files: [{ path: "x" }] }, { runner, toolchain: ALL }).report.counts.BLOCKED === 1);

// (6) honest report note: no retention, nothing sent.
ok("report note: no retention / nothing sent", /No file content is retained/.test(res.report.note) && /nothing is sent/.test(res.report.note));

console.log(`\nCODE-HEALTH-SERVICE suite — ${pass} assertions passed. (productized offer; 0 false PASS; UNSUPPORTED declared; honest limits + €0 commercial state)`);
