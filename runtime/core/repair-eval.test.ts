#!/usr/bin/env node
// @ts-nocheck — runs under tsx. This is a REAL measurement: evaluate() runs the actual family builders through the
// real runRepairWorkflow + real `node --test` over the sealed corpus (6 tiny isolated repos). It asserts the
// safety-critical repair metrics — ZERO false-success (never accept a change that shouldn't be) and ZERO
// false-abstention (never refuse an available safe fix) — plus stable provenance and the honesty caveat.
"use strict";
const assert = require("assert");
const E = require("./repair-eval.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const r = E.evaluate();   // REAL node --test harness (no injected runner)

// (1) safety-critical: no false success, no false abstention.
ok("ZERO false-success (never accept a change that should be rejected)", r.overall.falseSuccess === 0 && r.overall.falseSuccessRate === 0);
ok("ZERO false-abstention (never refuse an available safe fix)", r.overall.falseAbstention === 0 && r.overall.falseAbstentionRate === 0);

// (2) measured outcomes on the sealed corpus (6 cases: 3 FIXABLE accepted, 3 NO_SAFE_FIX abstained).
ok("3 correct accepts + 3 correct abstains, accuracy 1.0 on 6 cases", r.overall.correctAccept === 3 && r.overall.correctAbstain === 3 && r.overall.evaluated === 6 && r.overall.accuracy === 1);

// (3) the behaviour-insufficient case ABSTAINED (export added but a-b ≠ a+b ⇒ real test fails ⇒ rollback, no false success).
const insufficient = r.results.find(x => x.id === "exp-fix-insufficient");
ok("exp-fix-insufficient ⇒ ABSTAINED (no false success on a behaviourally-wrong export)", insufficient && insufficient.status === "ABSTAINED" && insufficient.outcome === "correctAbstain");

// (4) the two NO_SAFE_FIX pre-apply refusals: undefined symbol ⇒ UNSUPPORTED; ambiguous require ⇒ BLOCKED.
const undef = r.results.find(x => x.id === "exp-undefined");
const ambig = r.results.find(x => x.id === "req-ambiguous");
ok("undefined symbol ⇒ UNSUPPORTED (no invention)", /UNSUPPORTED/.test(undef.status) && undef.outcome === "correctAbstain");
ok("ambiguous require ⇒ BLOCKED (no guess)", /BLOCKED/.test(ambig.status) && ambig.outcome === "correctAbstain");

// (5) provenance stable + separation caveat (not check-accuracy / not broad-IT).
const p1 = E.corpusProvenance(), p2 = E.corpusProvenance();
ok("provenance sha256 stable + version + total 6", p1.sha256 === p2.sha256 && /^[0-9a-f]{64}$/.test(p1.sha256) && p1.version === E.CORPUS_VERSION && p1.total === 6);
ok("caveat forbids broad-IT / check-accuracy / K conflation", /REPAIR acceptance metrics ONLY/.test(r.caveat) && /NOT a broad-IT success rate/.test(r.caveat));

console.log(`\nREPAIR-EVAL suite — ${pass} assertions passed. (REAL node --test; correctAccept 3 / correctAbstain 3 / falseSuccess 0 / falseAbstention 0 on 6 sealed cases; NOT a broad-IT rate)`);
