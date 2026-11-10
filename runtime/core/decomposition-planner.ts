#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V38 LOT F — DECOMPOSITION PLANNER. PURE, deterministic, fail-closed. It builds NO new generator — it
 * strengthens native self-engineering by OPERATIONALIZING the V30 lesson: a monolithic generation of a complex /
 * meta-engineering project FAILS on the local models, while a DECOMPOSED generation (focused primitives + assembly)
 * SUCCEEDS (V30: the undefined-symbol-detector failed monolithically, passed decomposed). This module assesses a project
 * spec, decides MONOLITHIC vs DECOMPOSED, and (for a meta/complex project) produces the decomposed sub-specs that
 * native-project-builder generates. The INDEPENDENT control (native-project-builder's verifier) still arbitrates — this
 * only chooses the strategy. Fail-closed: when in doubt (meta signals / many interdependent files), DECOMPOSE. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

/**
 * assessComplexity(spec) -> { complexity, signals }. complexity ∈ TRIVIAL | SIMPLE | COMPLEX | META. Signals: file count,
 * cross-file contracts (a file that depends on another), and meta-engineering (the project analyzes/transforms code).
 */
function assessComplexity(spec: any): any {
  const s = isObj(spec) ? spec : {};
  const arch = arr(s.architecture);
  const fileCount = arch.length;
  const crossFile = arch.filter((a) => isObj(a) && arr(a.dependsOn).length > 0).length;
  const text = (String(s.name || "") + " " + arch.map((a) => String((a && a.role) || "") + " " + String((a && a.contract) || "")).join(" ")).toLowerCase();
  const metaEngineering = /\b(parse|parser|ast|symbol|token|analyz|detect.*code|lint|compile|type ?check|references?|declarations?)\b/.test(text);
  let complexity: string;
  if (metaEngineering) complexity = "META";                               // code-analyzing-code ⇒ the hardest class (V30), ANY file count — must be decomposed
  else if (fileCount <= 1) complexity = "TRIVIAL";
  else if (fileCount >= 4 || crossFile >= 3) complexity = "COMPLEX";
  else complexity = "SIMPLE";
  return Object.freeze({ complexity, signals: Object.freeze({ fileCount, crossFileContracts: crossFile, metaEngineering }) });
}

/**
 * decomposeMetaComponent(spec) -> architecture[] of focused primitives + a composing file. The V30 pattern: a single
 * code-analysis contract is split into independently-verifiable primitives. V39 LOT J MEASURED that the GENERIC split
 * (vague "first/second concern" sub-contracts) produces a false success (compiled but wrong) on the local model — so a
 * RECOGNISED meta shape now gets CONCRETE, functionally-meaningful sub-contracts (the measured improvement); an
 * unrecognised meta shape falls back to the generic split. Only applied to a META single-file component; returns the
 * ORIGINAL architecture unchanged when decomposition does not apply.
 */
function decomposeMetaComponent(spec: any): any {
  const s = isObj(spec) ? spec : {};
  const arch = arr(s.architecture);
  if (arch.length !== 1) return arch;                                      // multi-file already decomposed by design
  const file = arch[0]; const path = String((file && file.path) || "src/x.js");
  const slash = path.lastIndexOf("/"); const dir = slash >= 0 ? path.slice(0, slash) : "";
  const sib = (n: string) => (dir ? `${dir}/${n}` : n);                    // a sibling file next to the original (fix: no spurious "file.js/" dir)
  const text = (String((file && file.role) || "") + " " + String((file && file.contract) || "")).toLowerCase();
  // RECOGNISED shape: identifier / reference / symbol analysis of code (e.g. "tokens in code not in a declared set").
  // CONCRETE sub-contracts the model can satisfy per-file (a real tokeniser primitive + a combiner that filters it).
  if (/\b(identifier|symbol|reference|undefined|declared|token)\b/.test(text)) {
    return Object.freeze([
      Object.freeze({ path: sib("extract-identifiers.js"), role: "extract identifier tokens from a code string", contract: "module.exports = (code) => (String(code).match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || []); // all identifier-like tokens, in order", dependsOn: [] }),
      Object.freeze({ path, role: `${(file && file.role) || "detector"} (composes the identifier extractor)`, contract: `const extractIdentifiers = require('./extract-identifiers.js'); ${(file && file.contract) || "combine"} — use extractIdentifiers(code) then compare against the declared set`, dependsOn: [sib("extract-identifiers.js")] }),
    ]);
  }
  // GENERIC fallback (unrecognised meta): two focused extractors + a combiner (each independently testable) — weaker, so
  // its acceptance depends even more on the INDEPENDENT verifier (V39 LOT J measured this path can produce a false success).
  return Object.freeze([
    Object.freeze({ path: sib("extract-a.js"), role: "focused extractor A (one concern)", contract: "module.exports=(input)=> an array of the first concern, by a simple deterministic rule", dependsOn: [] }),
    Object.freeze({ path: sib("extract-b.js"), role: "focused extractor B (one concern)", contract: "module.exports=(input)=> an array of the second concern, by a simple deterministic rule", dependsOn: [] }),
    Object.freeze({ path, role: `${(file && file.role) || "combiner"} (composes the two extractors)`, contract: `require('./extract-a.js') and require('./extract-b.js'); ${(file && file.contract) || "combine them"}`, dependsOn: [sib("extract-a.js"), sib("extract-b.js")] }),
  ]);
}

/**
 * chooseStrategy(spec) -> { strategy, architecture, reason, complexity }. FAIL-CLOSED toward decomposition: a META or
 * COMPLEX project ⇒ DECOMPOSED (never a reflexive monolithic generation of a hard project); TRIVIAL/SIMPLE ⇒ MONOLITHIC
 * (don't needlessly fragment an easy project).
 */
function chooseStrategy(spec: any): any {
  const a = assessComplexity(spec);
  const arch = arr(spec && spec.architecture);
  if (a.complexity === "META") {
    const decomposed = arch.length === 1 ? decomposeMetaComponent(spec) : arch;   // split a monolithic meta component
    return Object.freeze({ strategy: "DECOMPOSED", architecture: decomposed, complexity: a.complexity, reason: "meta-engineering (code-analyzing-code) — decompose into focused, independently-verifiable primitives (the V30 lesson: monolithic meta generation fails, decomposed succeeds)" });
  }
  if (a.complexity === "COMPLEX") return Object.freeze({ strategy: "DECOMPOSED", architecture: arch, complexity: a.complexity, reason: "complex / many interdependent files — generate per-file in dependency order with prior contracts in context (not one monolith)" });
  return Object.freeze({ strategy: "MONOLITHIC", architecture: arch, complexity: a.complexity, reason: `${a.complexity} — a single-pass generation suffices (don't fragment an easy project)` });
}

const DECOMPOSITION_PLANNER_CONTRACT = Object.freeze({
  id: "V124-DECOMPOSITION-PLANNER",
  source: "CTO V38 LOT F — operationalize the V30 decomposition lesson for native self-engineering",
  reuses: Object.freeze(["native-project-builder (generates the chosen architecture; the INDEPENDENT verifier still arbitrates)", "the V29/V30 live measurements (the empirical basis of the strategy)"]),
  notAuthority: "chooses MONOLITHIC vs DECOMPOSED and emits the sub-specs; it generates nothing and authorizes nothing — the builder + its independent verifier execute + judge",
  invariants: Object.freeze([
    "a META project (code-analyzing-code) ⇒ DECOMPOSED into focused, independently-verifiable primitives (never monolithic — the V30 failure mode)",
    "a COMPLEX / many-interdependent-file project ⇒ DECOMPOSED (per-file in dependency order), not one monolith",
    "a TRIVIAL/SIMPLE project ⇒ MONOLITHIC (don't needlessly fragment an easy project)",
    "the strategy only; the independent verifier (native-project-builder) still decides acceptance — the generator never self-validates",
    "fail-closed toward decomposition when in doubt; pure/deterministic",
  ]),
});

module.exports = { assessComplexity, decomposeMetaComponent, chooseStrategy, DECOMPOSITION_PLANNER_CONTRACT };

if (require.main === module) {
  const meta = chooseStrategy({ name: "symbol detector", architecture: [{ path: "src/detector.js", role: "detect undefined symbols in code", contract: "analyze code for undefined references" }] });
  const trivial = chooseStrategy({ name: "add", architecture: [{ path: "src/add.js", role: "add two numbers", contract: "a+b" }] });
  process.stdout.write(JSON.stringify({ ...DECOMPOSITION_PLANNER_CONTRACT, demo: { metaStrategy: meta.strategy, metaFiles: meta.architecture.length, trivialStrategy: trivial.strategy } }, null, 2) + "\n");
}

export {};
