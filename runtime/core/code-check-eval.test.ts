#!/usr/bin/env node
// @ts-nocheck — runs under tsx, ZERO real subprocess (injected runner + toolchain override). Validates the EVAL LOGIC:
// a perfect oracle ⇒ accuracy 1 / 0 false; an always-PASS runner ⇒ broken cases become falsePass (detected); an
// always-FAIL runner ⇒ clean cases become falseFail; absent toolchain ⇒ BLOCKED excluded from the denominator;
// provenance sha256 stable + caveat present. (The REAL-checker measurement is the live `tsx code-check-eval.ts` run.)
"use strict";
const assert = require("assert");
const fs = require("fs");
const E = require("./code-check-eval.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const ALL = { JavaScript: true, TypeScript: true, Python: true };
const cleanSet = new Set(E.CORPUS.filter((c) => c.expected === "PASS").map((c) => c.content));
const nClean = E.CORPUS.filter((c) => c.expected === "PASS").length;
const nBroken = E.CORPUS.filter((c) => c.expected === "FAIL").length;
// Oracle: read the file the checker wrote (last argv) and PASS iff its content is a known-clean fixture.
const oracle = (bin, args, opts) => { const f = args[args.length - 1]; const content = fs.readFileSync(f, "utf8"); return { exitCode: cleanSet.has(content) ? 0 : 1, stdout: "", stderr: "" }; };
const alwaysPass = () => ({ exitCode: 0, stdout: "", stderr: "" });
const alwaysFail = () => ({ exitCode: 1, stdout: "", stderr: "err" });

// (1) perfect oracle ⇒ accuracy 1, no false anything, denominator = full corpus.
const good = E.evaluate({ runner: oracle, toolchain: ALL });
ok("oracle: accuracy 1.0, 0 falsePass, 0 falseFail", good.overall.accuracy === 1 && good.overall.falsePass === 0 && good.overall.falseFail === 0);
ok("oracle: evaluated denominator = full corpus", good.overall.evaluated === E.CORPUS.length && good.overall.blocked === 0);
ok("oracle: correctPass = #clean, correctFail = #broken", good.overall.correctPass === nClean && good.overall.correctFail === nBroken);

// (2) always-PASS runner ⇒ every broken case is a falsePass (the dangerous miss) and IS detected.
const fp = E.evaluate({ runner: alwaysPass, toolchain: ALL });
ok("always-PASS: falsePass === #broken (false acceptance detected)", fp.overall.falsePass === nBroken && fp.overall.correctFail === 0);

// (3) always-FAIL runner ⇒ every clean case is a falseFail.
const ff = E.evaluate({ runner: alwaysFail, toolchain: ALL });
ok("always-FAIL: falseFail === #clean", ff.overall.falseFail === nClean && ff.overall.correctPass === 0);

// (4) absent toolchain ⇒ those cases BLOCKED and EXCLUDED from the accuracy denominator (honest).
const noPy = E.evaluate({ runner: oracle, toolchain: { JavaScript: true, TypeScript: true, Python: false } });
const nPy = E.CORPUS.filter((c) => c.language === "Python").length;
ok("absent toolchain ⇒ BLOCKED, excluded from denominator", noPy.overall.blocked === nPy && noPy.overall.evaluated === E.CORPUS.length - nPy && noPy.perLanguage.Python.accuracy === null);

// (5) provenance: stable sha256 + honest caveat + separation from other metrics.
const p1 = E.corpusProvenance(); const p2 = E.corpusProvenance();
ok("provenance sha256 deterministic + version", p1.sha256 === p2.sha256 && /^[0-9a-f]{64}$/.test(p1.sha256) && p1.version === E.CORPUS_VERSION);
ok("caveat forbids broad-IT / generation claims", /NOT code-generation, repair, K-category, or broad-IT/.test(good.caveat) && /Too small for broad-IT generalization/.test(good.caveat));

// (6) corpus includes clean + broken + malformed + both PASS/FAIL ground truth (negative controls present).
ok("corpus has clean, broken AND malformed kinds across 3 languages", E.CORPUS.some(c=>c.kind==="clean") && E.CORPUS.some(c=>c.kind==="broken") && E.CORPUS.some(c=>c.kind==="malformed") && new Set(E.CORPUS.map(c=>c.language)).size === 3);

console.log(`\nCODE-CHECK-EVAL suite — ${pass} assertions passed. (classification correct: correctPass/Fail, falsePass/Fail detected, BLOCKED excluded; provenance stable; caveat honest)`);
