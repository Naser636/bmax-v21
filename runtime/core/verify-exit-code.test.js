#!/usr/bin/env node
"use strict";

/*
 * odg-verify exit-code contract (Tier 1 verify-pipeline fix).
 *
 * BEFORE: runtime/bin/odg-verify.js had zero process.exit calls → it always exited 0 even on a red
 * build / failed tsc / dirty tree (reproduced: a dirty tree stamped gitClean:false yet the process
 * exited 0). Three callers gate on its exit code — odg-delegate.js (`if (verify.status !== 0) die`),
 * the `odg` bash `system-ready` chain (`verify || exit $?`), and standalone `odg verify` — so every
 * one of those gates was dead.
 *
 * This locks the new contract: exit status is a pure function of the ALREADY-COMPUTED `verify` object
 * (build && typescript && gitClean), with a `--report-only` escape hatch for odg-local-pipeline.sh's
 * pre-flight (which does its own content gating and tolerates a dirty tree for finalize/closeout missions).
 * Requiring the module is side-effect-free (the build/tsc run is behind `require.main === module`),
 * so this test never spawns a build.
 *
 * Run directly: node runtime/core/verify-exit-code.test.js
 */

const path = require("path");
const { verifyExitCode } = require(path.join(__dirname, "..", "bin", "odg-verify.js"));

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const green = { build: true, typescript: true, gitClean: true, documentationProofPresent: false, generatedContractsValid: true };

console.log("ODG-VERIFY EXIT-CODE CONTRACT");

// Green verification ⇒ exit 0 (preserve successful behaviour).
check(verifyExitCode(green, false) === 0, "green (build&&tsc&&gitClean) ⇒ exit 0");

// Each failed gate ⇒ non-zero (the behaviour the old always-0 process masked).
check(verifyExitCode({ ...green, build: false }, false) === 1, "red build ⇒ exit 1");
check(verifyExitCode({ ...green, typescript: false }, false) === 1, "failed tsc ⇒ exit 1");
check(verifyExitCode({ ...green, gitClean: false }, false) === 1, "dirty tree (gitClean:false) ⇒ exit 1");

// documentationProofPresent is additive evidence (legitimately absent with no mission) — NOT gated.
check(verifyExitCode({ ...green, documentationProofPresent: false }, false) === 0,
  "absent documentationProofPresent does NOT fail a green verification");

// report-only ⇒ always 0 (odg-local-pipeline.sh pre-flight stamper; it does its own gating).
check(verifyExitCode({ ...green, build: false, gitClean: false }, true) === 0,
  "--report-only ⇒ exit 0 even on a red/dirty verify (pipeline preserved)");

// Default-deny on a missing/garbage verify object.
check(verifyExitCode(undefined, false) === 1, "absent verify object ⇒ exit 1 (default-deny)");
check(verifyExitCode({}, false) === 1, "empty verify object ⇒ exit 1 (no field defaults to green)");

console.log(failures === 0 ? "ALL PASS — ODG-VERIFY EXIT-CODE CONTRACT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
