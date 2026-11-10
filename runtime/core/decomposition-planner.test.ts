#!/usr/bin/env node
"use strict";
const D = require("./decomposition-planner");
const B = require("./native-project-builder");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

// (1) complexity assessment.
check(D.assessComplexity({ architecture: [{ path: "a.js", role: "add", contract: "a+b" }] }).complexity === "TRIVIAL", "single trivial file ⇒ TRIVIAL");
check(D.assessComplexity({ architecture: [{ path: "d.js", role: "detect undefined symbols", contract: "analyze code references" }] }).complexity === "META", "single meta-engineering file ⇒ META (the V30 monolith — hardest class, any file count)");
check(D.assessComplexity({ architecture: [{ path: "d.js", role: "parse", contract: "x" }, { path: "e.js", role: "symbol table", contract: "y" }] }).complexity === "META", "multi-file code-analysis ⇒ META");
check(D.assessComplexity({ architecture: [{ path: "a.js" }, { path: "b.js", dependsOn: ["a.js"] }, { path: "c.js", dependsOn: ["b.js"] }, { path: "d.js", dependsOn: ["c.js"] }] }).complexity === "COMPLEX", "4 interdependent files ⇒ COMPLEX");

// (2) strategy: a RECOGNISED META shape (identifier/reference analysis) ⇒ DECOMPOSED into CONCRETE primitives (V39 LOT J
//     improvement over the generic split that produced a false success): a real identifier extractor + a combiner.
const sMeta = D.chooseStrategy({ name: "symbol detector", architecture: [{ path: "src/detector.js", role: "detect undefined symbols in code", contract: "analyze code for undefined references and token parsing" }] });
check(sMeta.strategy === "DECOMPOSED" && sMeta.architecture.length === 2, "a RECOGNISED META shape ⇒ DECOMPOSED into 2 CONCRETE primitives (extractor + combiner)");
check(sMeta.architecture[0].path.endsWith("extract-identifiers.js") && /match\(/.test(sMeta.architecture[0].contract), "the extractor primitive has a CONCRETE functional contract (a real tokeniser), not a vague 'first concern'");
check(sMeta.architecture[1].dependsOn.length === 1 && /extract-identifiers/.test(sMeta.architecture[1].dependsOn[0]), "the combiner depends on the concrete extractor primitive");

// (2b) an UNRECOGNISED META shape ⇒ the generic 3-file split fallback (weaker; the independent verifier must arbitrate).
const sMetaGen = D.chooseStrategy({ name: "weird meta", architecture: [{ path: "src/w.js", role: "transform an AST into something", contract: "compile and analyze the structure" }] });
check(sMetaGen.strategy === "DECOMPOSED" && sMetaGen.architecture.length === 3, "an UNRECOGNISED META shape ⇒ generic 3-file split fallback");

// (3) a trivial project ⇒ MONOLITHIC (don't needlessly fragment).
check(D.chooseStrategy({ name: "add", architecture: [{ path: "src/add.js", role: "add", contract: "a+b" }] }).strategy === "MONOLITHIC", "a trivial project ⇒ MONOLITHIC (no needless fragmentation)");

// (4) a COMPLEX multi-file project ⇒ DECOMPOSED (per-file in dependency order), not one monolith.
check(D.chooseStrategy({ architecture: [{ path: "a.js" }, { path: "b.js", dependsOn: ["a.js"] }, { path: "c.js", dependsOn: ["a.js"] }, { path: "d.js", dependsOn: ["b.js", "c.js"] }] }).strategy === "DECOMPOSED", "a complex 4-file project ⇒ DECOMPOSED (not monolithic)");

// contract invariant present.
check(/decompos/i.test(JSON.stringify(D.DECOMPOSITION_PLANNER_CONTRACT.invariants)) && /monolithic/i.test(JSON.stringify(D.DECOMPOSITION_PLANNER_CONTRACT.invariants)), "contract: meta ⇒ decomposed, never monolithic");

// (5) INTEGRATION — the decomposed architecture feeds native-project-builder and the INDEPENDENT verifier still arbitrates.
(async () => {
  const s = D.chooseStrategy({ name: "calc", architecture: [{ path: "src/ops.js", role: "math", contract: "add/sub" }, { path: "src/calc.js", role: "uses ops", contract: "compute via ops.add", dependsOn: ["src/ops.js"] }] });
  const spec = { name: "calc", writeSet: s.architecture.map((a: any) => a.path), architecture: s.architecture, independentTest: (mods: any) => { const c = mods["src/calc.js"]; return typeof c === "function" && c(2, 3) === 5; } };
  const good = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a+b};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
  const bad = async (f: any) => ({ ok: true, content: f.path === "src/ops.js" ? "module.exports={add:(a,b)=>a-b};" : "const ops=require('./ops.js');module.exports=(a,b)=>ops.add(a,b);" });
  const okRun = await B.buildProject(spec, { generateFile: good });
  const badRun = await B.buildProject(spec, { generateFile: bad });
  check(okRun.accepted === true, "decomposed architecture built correctly ⇒ ACCEPTED by the independent verifier");
  check(badRun.accepted === false, "a compiling-but-wrong build ⇒ REJECTED by the independent verifier (generator cannot self-validate)");
  if (failures === 0) process.stdout.write("ALL PASS — V12.4 DECOMPOSITION PLANNER\n");
  process.exit(failures === 0 ? 0 : 1);
})();

export {};
