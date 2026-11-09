#!/usr/bin/env node
"use strict";

const R = require("./model-router");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

// benchmark-grounded facts (measured 2026-11-09): 3b faster+correct, 7b correct, 0.5b incorrect.
check(R.MODEL_BENCHMARKS["qwen2.5-coder:3b"].correct === true && R.MODEL_BENCHMARKS["qwen2.5-coder:3b"].tokPerSec > R.MODEL_BENCHMARKS["qwen2.5-coder:7b"].tokPerSec, "3b benchmarked faster than 7b AND correct");
check(R.MODEL_BENCHMARKS["qwen2.5:0.5b"].correct === false, "0.5b benchmarked INCORRECT");

// correctnessTrusted: 0.5b not trusted; unknown not trusted (fail-closed).
check(R.correctnessTrusted("qwen2.5-coder:3b") === true && R.correctnessTrusted("qwen2.5:0.5b") === false, "correctnessTrusted: 3b yes, 0.5b no");
check(R.correctnessTrusted("some-unknown-model") === false, "unknown model ⇒ not correctness-trusted (fail-closed)");

// SIMPLE ⇒ fastest correct (3b); COMPLEX ⇒ quality (7b).
check(R.selectModel({ taskComplexity: "SIMPLE", available: ["qwen2.5-coder:7b", "qwen2.5-coder:3b", "qwen2.5:0.5b"] }).model === "qwen2.5-coder:3b", "SIMPLE task ⇒ 3b (fastest correct)");
check(R.selectModel({ taskComplexity: "COMPLEX" }).model === "qwen2.5-coder:7b", "COMPLEX task ⇒ 7b (quality)");

// default (no complexity) is the safe COMPLEX/quality model, never the incorrect 0.5b.
check(R.selectModel({}).model === "qwen2.5-coder:7b", "default ⇒ quality model (safe)");

// 0.5b is NEVER selected as a default even if it is the only 'fast' option benchmarked.
check(R.selectModel({ taskComplexity: "SIMPLE" }).model !== "qwen2.5:0.5b", "0.5b never the default (benchmarked incorrect)");

// availability: if the preferred model is not installed, fall back to a correctness-trusted installed model.
check(R.selectModel({ taskComplexity: "SIMPLE", available: ["qwen2.5-coder:7b"] }).model === "qwen2.5-coder:7b", "3b not installed ⇒ fall back to an installed correctness-trusted model");

// contract invariants: router recommends only; the independent test is the arbiter.
check(/independent test is the sole arbiter|accepted ONLY if it passes the INDEPENDENT test/i.test(JSON.stringify(R.MODEL_ROUTER_CONTRACT.invariants)), "contract: router recommends; independent test decides");
check(/NEVER the default for a correctness-critical/i.test(JSON.stringify(R.MODEL_ROUTER_CONTRACT.invariants)), "contract: incorrect model never a default");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 MODEL ROUTER\n");
process.exit(failures === 0 ? 0 : 1);

export {};
