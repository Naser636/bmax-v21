// @ts-nocheck
/*
 * η3-B106 — FINAL CUTOVER READINESS (evidence + coupling map; NO cutover, NO production change).
 *
 * This bench does NOT re-run the already-valid build/parity/freshness/rollback proofs (B103 clean-clone
 * real npm ci; B104 entry controlled-build; B105 provenance+freshness+parity+rollback). It MECHANICALLY
 * asserts the remaining readiness facts that gate a committed cutover, so the decision rests on evidence
 * not assertion:
 *   A. the PUBLISHED front-door-A default is still JavaScript (invariant: not yet flipped);
 *   B. flipping front door A is a single, localized, reversible default-expansion change that keeps the
 *      freshness-guarded helper delegation and the JS rollback branch;
 *   C. front door B (adapter) default entry is runtime/bin/odg-run.js, and N product tests STUB that
 *      exact path with NO ODG_RUNTIME_ENTRY pin — so flipping B's default would break them (the
 *      strategic blocker; those tests legitimately exercise the JS entry and must not be altered here).
 *
 * Read-only: touches no dev-tree file, builds nothing, spawns nothing heavy. Exit 0=PASS, 1=FAIL.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const REPO = process.cwd();
let failures = 0;
function check(c, label) { if (c) console.log("  PASS " + label); else { failures++; console.log("  FAIL " + label); } }
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");

console.log("η3-B106 — FINAL CUTOVER READINESS (evidence + coupling map)");

// A. Published front-door-A default is now TypeScript (FLIPPED η3-B108), with JS rollback preserved.
const pipe = read("runtime/bin/odg-local-pipeline.sh");
check(/\$\{ODG_RUNTIME:-ts\}/.test(pipe) && !/\$\{ODG_RUNTIME:-js\}/.test(pipe), "A. published front-door-A default is TypeScript (ODG_RUNTIME:-ts) — flipped");
check(pipe.includes("odg-ensure-ts-runtime.sh"), "A. TS path delegates to the freshness-guarded entry-build helper (B105)");
check(/\[PIPELINE\] Runtime engine: JavaScript \(default\)/.test(pipe), "A. JS rollback branch present (reached via ODG_RUNTIME=js)");

// B. Rollback is a single explicit env value; both branches remain reachable.
check(/if \[ "\$\{ODG_RUNTIME:-ts\}" = "ts" \]; then/.test(pipe), "B. selector: unset/ts ⇒ TS; the else branch is the JS rollback");
check(pipe.includes("ODG_RUNTIME=js to return to the JavaScript runtime"), "B. rollback path documented in the launcher (ODG_RUNTIME=js)");

// C. Front-door-B coordinated switch + coupling RESOLVED by B107 JS-entry pins.
const adapter = read("src/runtime/autonomy-runtime-adapter.ts");
check(/const PIPELINE = "runtime\/bin\/odg-run\.js";/.test(adapter), "C. adapter default entry literal = runtime/bin/odg-run.js (fallback unchanged)");
check(/resolveRuntimeMode\(\)[\s\S]*ODG_RUNTIME[\s\S]*=== "ts"/.test(adapter) && /COMPILED_PIPELINE = "runtime\/dist\/bin\/odg-run\.js"/.test(adapter), "C. adapter has the coordinated ODG_RUNTIME=ts switch (default OFF) ⇒ compiled entry");
check(/ODG_RUNTIME=ts[\s\S]*could not be ensured[\s\S]*silently fall back/.test(adapter) || /TS_RUNTIME_UNAVAILABLE/.test(adapter), "C. ts path ensures a fresh dist with NO silent fallback");
// The ONLY tests that break under a simulated flip (empirically: ODG_RUNTIME=ts) are now PINNED to the
// JS entry — intent preserved, flip-safe. The others are flip-robust (provider path) and untouched.
const PINNED = ["src/tests/autonomy-local-loop.test.ts", "src/tests/corrective-queue-intake.test.ts"];
const allPinned = PINNED.every((t) => /process\.env\.ODG_RUNTIME_ENTRY\s*=\s*"runtime\/bin\/odg-run\.js"/.test(read(t)));
check(allPinned, "C. the 2 flip-breaking adapter tests now carry an explicit JS-entry pin (coupling RESOLVED, B107)");

// Stability-window criteria are DEFINED but NOT YET satisfied (no window has run). Reported, not claimed.
console.log("  NOTE stability window = NOT RUN (criteria defined in §S-11; requires post-flip operation).");

console.log(failures === 0 ? "ALL PASS — CUTOVER READINESS EVIDENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
