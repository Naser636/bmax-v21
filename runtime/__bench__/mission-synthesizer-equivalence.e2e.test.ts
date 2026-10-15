#!/usr/bin/env node
/*
 * LOT mission-synthesizer — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no clock/random/I/O): build:runtime compiles
 * runtime/core/mission-synthesizer.ts → runtime/dist/core/mission-synthesizer.js; build-dist-closure
 * co-locates its dep (decision-rules.js — a TS port) in dist/core. Every function is pure ⇒
 * BYTE-IDENTICAL. Covers orchestration branches: decomposition (single/list/enumerated/EN+FR conjunction/
 * noun-list-not-oversplit), scope grounding, contract shape (patch/goals/doneWhen/requires_engineering/
 * ODG_SPEC_ verify), refusal/invalid validator, spec-intent routing. No normalisation needed.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/mission-synthesizer-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "mission-synthesizer.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "mission-synthesizer.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT mission-synthesizer — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/mission-synthesizer.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/mission-synthesizer.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "decision-rules.js")), "prerequisite: dep decision-rules.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["toContract", "fromRequest", "isValidContract", "slug", "decompose", "derivePaths", "isSpecProductionIntent"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}

// slug.
for (const [t, fb] of [["Fix the parser!", "X"], ["", "FALLBACK"], ["  a//b  ", "X"], ["___", "FB"]] as Array<[string, string]>) {
  check(js.slug(t, fb) === ts.slug(t, fb), `slug(${JSON.stringify(t)}) = ${JSON.stringify(js.slug(t, fb))} identical`);
}

// decompose — the orchestration-critical branch set.
const DECS = [
  "fix the parser", // single verbatim
  "add logging and remove the dead import", // EN conjunction (two action verbs)
  "the loader and the engine", // NOUN list ⇒ NOT over-split (single objective)
  "corrige le parseur et supprime l import mort", // FR conjunction
  "1. add logging 2. remove import 3. format file", // enumerated
  "- add logging\n- remove import", // multi-line bullets
  "quick and dirty fix", // "and" but 2nd clause has no action verb ⇒ single
  "", // empty ⇒ []
  "   ", // whitespace ⇒ []
];
for (const g of DECS) check(EQ(js.decompose(g), ts.decompose(g)), `decompose(${JSON.stringify(g.slice(0, 32))}) BYTE-IDENTICAL (${js.decompose(g).length} obj)`);
check(js.decompose("the loader and the engine").length === 1, "decompose: noun-list NOT over-split (1 objective)");
check(js.decompose("add logging and remove the dead import").length === 2, "decompose: two imperative clauses ⇒ 2 objectives");

// derivePaths.
for (const t of ["fix src/runtime/a.ts and runtime/core/b.js", "no paths here", "dup src/x.ts src/x.ts", "bareword.txt only"]) {
  check(EQ(js.derivePaths(t), ts.derivePaths(t)), `derivePaths(${JSON.stringify(t.slice(0, 32))}) BYTE-IDENTICAL`);
}

// toContract — contract shape across precedence branches.
const SPECS = [
  { goal: "fix the parser" }, // single, no path ⇒ read-only (requires_engineering false)
  { goal: "fix bug in src/runtime/a.ts" }, // derived scope ⇒ requires_engineering true
  { goal: "x", authorizedPaths: [] }, // explicit [] ⇒ deliberately read-only
  { goal: "x", patch: { edits: [{ target: "a", content: "c" }] } }, // patch ⇒ single objective + Patch applied.
  { goal: "add a and remove b", patch: { edits: [{ target: "a" }] } }, // patch forces single even with 2 actions
  { id: "M", goal: "audit X and report Y", goals: ["audit X", "report Y"] }, // explicit goals[]
  { goal: "x", doneWhen: ["Custom DoD."] }, // explicit doneWhen honoured
  { goal: "generate a specification for the api", objectiveId: "ODG_SPEC_API" }, // ODG_SPEC_ ⇒ verify block
];
for (const [i, spec] of SPECS.entries()) check(EQ(js.toContract(spec), ts.toContract(spec)), `toContract[${i}] BYTE-IDENTICAL`);
check(js.toContract({ goal: "fix bug in src/runtime/a.ts" }).requires_engineering === true, "toContract: derived scope ⇒ requires_engineering true");
check(js.toContract({ goal: "x", authorizedPaths: [] }).requires_engineering === false, "toContract: explicit [] ⇒ read-only");
check(EQ(js.toContract({ goal: "g", objectiveId: "ODG_SPEC_X" }).verify, [{ capability: "ODG Spec Author", evidence: "spec-schema-valid" }]), "toContract: ODG_SPEC_ first id ⇒ central verify block injected");
check(js.toContract({ goal: "g" }).verify === undefined, "toContract: non-ODG_SPEC_ ⇒ NO verify block (unchanged)");

// isSpecProductionIntent — conservative.
for (const t of ["generate a specification", "write the specification for X", "inspect the code", "fix the spec typo", "respect the specification deadline"]) {
  check(js.isSpecProductionIntent(t) === ts.isSpecProductionIntent(t), `isSpecProductionIntent(${JSON.stringify(t)}) = ${js.isSpecProductionIntent(t)} identical`);
}

// fromRequest — NL→contract incl. resolvedCapability/resolvedFixers + ODG_SPEC_ routing.
for (const t of ["fix the failing lint", "produce a specification for the intake API", "add logging in src/runtime/a.ts"]) {
  check(EQ(js.fromRequest(t), ts.fromRequest(t)), `fromRequest(${JSON.stringify(t.slice(0, 32))}) BYTE-IDENTICAL (incl. resolvedCapability/fixers)`);
}
check(js.fromRequest("produce a specification for X").objectives[0].id.startsWith("ODG_SPEC_"), "fromRequest: spec-production intent ⇒ ODG_SPEC_ routed first objective");

// isValidContract — valid + invalid shapes.
check(js.isValidContract(js.toContract({ goal: "x" })) === true && ts.isValidContract(ts.toContract({ goal: "x" })) === true, "isValidContract(valid) ⇒ true (both)");
for (const bad of [null, {}, { mission: "m" }, { mission: "m", objectives: [] }, { mission: "m", objectives: [{ id: 1, goal: "g" }] }]) {
  check(js.isValidContract(bad) === ts.isValidContract(bad) && js.isValidContract(bad) === false, `isValidContract(invalid) ⇒ false (both)`);
}

console.log(failures === 0 ? "ALL PASS — LOT mission-synthesizer EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
