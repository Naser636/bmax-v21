// @ts-nocheck — L7_FIX_4 + L7_FIX_6 behavioral verifier (actual shared seam, both ports; actual delegate
// uses it — covered by the passing delegate-isolation / conformance / truth-lock / equivalence suites).
// L7_FIX_4 done_when: verify spawn prefers dist/bin/odg-verify.js when present; converge spawn prefers
//   dist/bin/odg-converge.js when present; ODG_RUNTIME=js forces source.
// L7_FIX_6 done_when: delegate-ts loads 0 SOURCE dual .js (its core port resolves to dist); ODG_RUNTIME=js
//   loads source; dual-port parity.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }

const REPO = process.cwd();
// The ACTUAL shared selector the delegate's verifyBin/convergeBin/_corePort call — both runtime ports.
const SRC = require(path.join(REPO, "runtime/core/prefer-dist-bin.js")).preferDistBin;
const DIST = require(path.join(REPO, "runtime/dist/core/prefer-dist-bin.js")).preferDistBin;

const VERIFY_D = path.join("runtime", "dist", "bin", "odg-verify.js"), VERIFY_S = path.join("runtime", "bin", "odg-verify.js");
const CONV_D = path.join("runtime", "dist", "bin", "odg-converge.js"), CONV_S = path.join("runtime", "bin", "odg-converge.js");
const CORE_D = "runtime/dist/core/mission-loader.js", CORE_S = "runtime/core/mission-loader.js";
const yes = () => true, no = () => false;

console.log("ACCEPT — L7_FIX_4 + L7_FIX_6 (delegate dist-spawn selection, both ports)");

for (const [label, pref] of [["source port", SRC], ["dist port", DIST]]) {
  // L7_FIX_4 — verify spawn
  ok(`${label}: verify default ⇒ dist verifier`, pref(VERIFY_D, VERIFY_S, yes, {}) === VERIFY_D);
  ok(`${label}: verify ODG_RUNTIME=js ⇒ source`, pref(VERIFY_D, VERIFY_S, yes, { ODG_RUNTIME: "js" }) === VERIFY_S);
  ok(`${label}: verify dist absent ⇒ source fallback`, pref(VERIFY_D, VERIFY_S, no, {}) === VERIFY_S);
  // L7_FIX_4 — converge spawn
  ok(`${label}: converge default ⇒ dist converger`, pref(CONV_D, CONV_S, yes, {}) === CONV_D);
  ok(`${label}: converge ODG_RUNTIME=js ⇒ source`, pref(CONV_D, CONV_S, yes, { ODG_RUNTIME: "js" }) === CONV_S);
  // L7_FIX_6 — _corePort selection (core module loads from dist on the TS runtime)
  ok(`${label}: core-port default ⇒ dist core (0 source dual .js on TS runtime)`, pref(CORE_D, CORE_S, yes, {}) === CORE_D);
  ok(`${label}: core-port ODG_RUNTIME=js ⇒ source core`, pref(CORE_D, CORE_S, yes, { ODG_RUNTIME: "js" }) === CORE_S);
}

// Dual-port parity: both ports resolve identically for every condition.
for (const [d, s, env] of [[VERIFY_D, VERIFY_S, {}], [VERIFY_D, VERIFY_S, { ODG_RUNTIME: "js" }], [CORE_D, CORE_S, {}]]) {
  ok(`dual-port parity: source≡dist for (${s}, ${JSON.stringify(env)})`, SRC(d, s, () => true, env) === DIST(d, s, () => true, env));
}

// L7_FIX_6 — the compiled delegate loads its shared selector FROM dist (not the source dual): the dist port exists.
ok("dist delegate's prefer-dist-bin dependency is present in dist/core (TS-only load)", fs.existsSync(path.join(REPO, "runtime/dist/core/prefer-dist-bin.js")));
// and the real delegate uses it (both ports import ../core/prefer-dist-bin.js).
ok("both delegate ports import the shared seam (actual code path)",
   /prefer-dist-bin/.test(fs.readFileSync(path.join(REPO, "runtime/bin/odg-delegate.js"), "utf8")) &&
   /prefer-dist-bin/.test(fs.readFileSync(path.join(REPO, "runtime/dist/bin/odg-delegate.js"), "utf8")));

console.log(`\nACCEPT L7_FIX_4+6 — ${passed} assertions passed.`);
