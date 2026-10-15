#!/usr/bin/env node
/*
 * LOT governance-kernel — EQUIVALENCE (historical runtime/core/governance-kernel.js vs compiled .ts).
 *
 * Offline, deterministic. build:runtime compiles runtime/core/governance-kernel.ts →
 * runtime/dist/core/governance-kernel.js. governance-kernel is a LEAF (only `fs`), so the compiled
 * module is self-contained and required directly — no dist-closure relocation.
 *
 * authorizeMission reads the REAL runtime/constitution|policies|governance JSON config relative to
 * process.cwd(); the bench runs from the repo root so both modules read the SAME files and every field
 * (versions, strategy, transitions) is identical by construction. Each scenario asserts the returned
 * object is BYTE-IDENTICAL (JSON, zero normalisation) plus the hand-derived semantic invariants.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/governance-kernel-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "governance-kernel.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "governance-kernel.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT governance-kernel — EQUIVALENCE (historical .js vs compiled .ts)");
// Run from the repo root so authorizeMission's relative config paths resolve identically for both.
process.chdir(REPO);
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/governance-kernel.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/governance-kernel.js emitted by build:runtime");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as { authorizeMission: Function };
const ts = require(TS_MOD) as { authorizeMission: Function };
check(typeof js.authorizeMission === "function", "JS module exports authorizeMission");
check(typeof ts.authorizeMission === "function", "compiled TS module exports authorizeMission");

// (mission, currentState) scenarios: default, explicit source-with-transitions, terminal (no edges),
// unknown state (no edges), and a distinct mission name.
const CASES: Array<[string, string?]> = [
  ["M1"],                 // default currentState = "CREATED" (has an outgoing edge)
  ["M2", "CREATED"],      // explicit CREATED
  ["M3", "ARCHIVED"],     // terminal state: no outgoing edges ⇒ transitionPossible false
  ["M4", "NOT_A_STATE"],  // unknown state ⇒ [] ⇒ false
  ["GOVERNANCE_X", "VALIDATED"],
];
for (const [mission, state] of CASES) {
  const j = state === undefined ? js.authorizeMission(mission) : js.authorizeMission(mission, state);
  const t = state === undefined ? ts.authorizeMission(mission) : ts.authorizeMission(mission, state);
  const tag = `${mission}/${state ?? "(default)"}`;
  check(JSON.stringify(j) === JSON.stringify(t), `${tag}: authorizeMission result BYTE-IDENTICAL JS≡TS`);
  // Semantic invariants (checked on the JS reference, equal to TS by the byte-identity above).
  check(j.authorityEnforced === false, `${tag}: authorityEnforced === false (no authority invented)`);
  check(j.authorized === j.transitionPossible, `${tag}: authorized is the alias of transitionPossible`);
  check(j.transitionPossible === (Array.isArray(j.nextStates) && j.nextStates.length > 0), `${tag}: transitionPossible ⇔ nextStates non-empty`);
  check(j.mission === mission && j.currentState === (state ?? "CREATED"), `${tag}: mission + currentState echoed`);
}

console.log(failures === 0 ? "ALL PASS — LOT governance-kernel EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
