// @ts-nocheck — L7_FIX_3 behavioral verifier (narrow exported seams, actual code path).
// Exercises the REAL dist-vs-source selection used by the autonomy verify spawn
// (autonomy-runtime-adapter.refreshVerifyEvidence → resolveVerifierBin) and the converge contract-generator
// spawn (converge-cli.defaultGenerateContracts → resolveGenerateContractsBin) under:
//   default (dist available) ⇒ compiled dist executable selected;
//   ODG_RUNTIME=js ⇒ source executable selected;
//   dist unavailable ⇒ documented source fallback.
"use strict";
const assert = require("assert");
const path = require("path");
const { resolveVerifierBin } = require("@/runtime/autonomy-runtime-adapter");
const { resolveGenerateContractsBin } = require("@/runtime/converge-cli");

let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

const DIST_VERIFY = "runtime/dist/bin/odg-verify.js";
const SRC_VERIFY = "runtime/bin/odg-verify.js";
const DIST_GEN = path.join("runtime", "dist", "bin", "odg-generate-contracts.js");
const SRC_GEN = path.join("runtime", "bin", "odg-generate-contracts.js");

console.log("ACCEPT — L7_FIX_3 (autonomy verify + converge spawn: dist-preference, actual seams)");

// --- autonomy verify spawn (adapter.refreshVerifyEvidence uses resolveVerifierBin) ---
ok("verify: default (dist available) ⇒ compiled dist verifier", resolveVerifierBin(() => true, {}) === DIST_VERIFY);
ok("verify: ODG_RUNTIME=js ⇒ source verifier", resolveVerifierBin(() => true, { ODG_RUNTIME: "js" }) === SRC_VERIFY);
ok("verify: dist unavailable ⇒ source fallback", resolveVerifierBin(() => false, {}) === SRC_VERIFY);
// the dist path it probes is the real compiled verifier
ok("verify: the probed dist path is the compiled verifier bin", (() => { let probed = null; resolveVerifierBin((p) => { probed = p; return true; }, {}); return probed === DIST_VERIFY; })());

// --- converge contract-generator spawn (defaultGenerateContracts uses resolveGenerateContractsBin) ---
ok("converge: default (dist available) ⇒ compiled dist generate-contracts", resolveGenerateContractsBin(() => true, {}) === DIST_GEN);
ok("converge: ODG_RUNTIME=js ⇒ source generate-contracts", resolveGenerateContractsBin(() => true, { ODG_RUNTIME: "js" }) === SRC_GEN);
ok("converge: dist unavailable ⇒ source fallback", resolveGenerateContractsBin(() => false, {}) === SRC_GEN);

console.log(`\nACCEPT L7_FIX_3 — ${passed} assertions passed.`);
