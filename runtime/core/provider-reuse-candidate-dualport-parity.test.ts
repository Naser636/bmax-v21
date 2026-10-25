#!/usr/bin/env node
// @ts-nocheck — runs under tsx; suppresses tsc typechecking (not strict typing), consistent with the other
// runtime/core *-dualport-parity.test.ts suites. The SOURCES under test are strict-typed.
"use strict";
/*
 * PROVIDER-REUSE-CANDIDATE DUAL-PORT PARITY (AB-4 migration proof) — strict TypeScript canonical
 * runtime/core/provider-reuse-candidate.ts vs legacy production port provider-reuse-candidate.js. Both read
 * the SAME patch-memory store, so identical inputs must yield identical outputs. Proves API + parseSignature
 * across cases + buildCandidates fail-closed paths (empty objectives, no authorizedPaths, out-of-scope) +
 * never-throws, js ≡ ts. No JS removed.
 */
const assert = require("assert");
const path = require("path");
const js = require(path.join(__dirname, "provider-reuse-candidate.js"));
const ts = require(path.join(__dirname, "provider-reuse-candidate.ts"));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

ok("same exported API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));

// parseSignature parity across representative + edge cases.
const sigs = ["rc|OBJ|runtime/core/foo.js", "", "only", "a|b", "a|b|c|d|e", null, undefined, "x||z"];
for (let i = 0; i < sigs.length; i++) {
  ok(`parseSignature parity case#${i}`, eq(js.parseSignature(sigs[i]), ts.parseSignature(sigs[i])));
}

// buildCandidates fail-closed paths — identical, never throws. (Both read the same patch-memory store.)
const scen = [
  [undefined, undefined],                                                   // no objectives ⇒ []
  [[], { cwd: process.cwd(), authorizedPaths: ["runtime/core/"] }],         // empty objectives ⇒ []
  [[{ id: "X" }], { cwd: process.cwd(), authorizedPaths: [] }],             // no authorizedPaths ⇒ []
  [[{ id: "X" }], { cwd: process.cwd(), authorizedPaths: ["runtime/core/"] }], // real: same store ⇒ identical
  [[{ id: "NOPE_NONEXISTENT_OBJECTIVE" }], { cwd: process.cwd(), authorizedPaths: ["no/such/scope/"] }],
  ["not-an-array", { authorizedPaths: 42 }],                                // corrupted input ⇒ [] (fail-closed)
];
for (let i = 0; i < scen.length; i++) {
  const [objs, opts] = scen[i];
  let jr, tr, threw = false;
  try { jr = js.buildCandidates(objs, opts); tr = ts.buildCandidates(objs, opts); } catch { threw = true; }
  ok(`buildCandidates parity + never-throws scen#${i}`, !threw && Array.isArray(jr) && eq(jr, tr));
}

console.log(`\nPROVIDER-REUSE-CANDIDATE DUAL-PORT PARITY — ${passed} assertions passed.`);
