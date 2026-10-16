#!/usr/bin/env node
"use strict";

/*
 * Change-Impact Graph (§U Phase-1 #1) — a READ-ONLY, pure, deterministic query over the runtime/core
 * module graph. It automates the full-closure/hazard/consumer/impacted-test survey that has been run by
 * hand every migration mission (V26–V36). It is NOT a new engine, registry, or source of truth: it
 * COMPOSES the EXISTING canonical require parser (scripts/lib/js-require-scan — the same parser
 * build-dist-closure trusts) with the three documented build-dist-closure hazard rules and Node's builtin
 * list. It writes NOTHING, runs no process, opens no network, and uses no clock/randomness. It is an
 * EVIDENCE/read composition of the nine primitives — never a tenth primitive, never a second graph.
 *
 * API (pure; root defaults to process.cwd()):
 *   buildGraph(root)        -> { modules:[name], deps:{name:[deps]}, consumers:{name:[consumers]} }
 *   impactOf(root, module)  -> { module, exists, directDeps, transitiveClosure, consumers,
 *                                closureHazards:{ dynamicRequire, externalRequire, pathHazard, modules:[] },
 *                                impactedTests }
 *
 * Domain: the historical `.js` sources under runtime/core (the exact closure build-dist-closure co-locates
 * into dist); a module name is the basename without `.js`, test files (`*.test.js`) excluded from nodes.
 */

import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

// REUSE the canonical, comment-safe require parser AND its context-aware comment stripper (B141) — no
// duplicate parser/stripper. stripComments removes line/block comments while preserving string/template
// literals VERBATIM (a comment-opener inside an executable string is never treated as a comment).
const { parseRequiresFromSource, stripComments } = require("../../scripts/lib/js-require-scan") as {
  parseRequiresFromSource: (src: string) => { literal: string[]; dyn: boolean };
  stripComments: (src: string) => string;
};

const NODE_BUILTINS: ReadonlySet<string> = new Set(builtinModules);
function isBuiltin(spec: string): boolean {
  return NODE_BUILTINS.has(spec) || NODE_BUILTINS.has(spec.replace(/^node:/, ""));
}

function coreDir(root: string): string {
  return path.join(root, "runtime", "core");
}

/*
 * The EXECUTABLE-RISK reference source for a module. build-dist-closure co-locates the COMPILED `.ts` port
 * when one exists (otherwise the historical `.js`); the hazard/dep analysis must reflect the SAME source
 * that actually lands in dist. So when `runtime/core/<name>.ts` is present, it is the reference; else the
 * `.js`. (The node set itself is still the `.js` basenames — the `.js` is always retained alongside the
 * port.) This NEVER lowers sensitivity: the ports in runtime/core carry their internal deps as `require()`
 * (verified: none use an ES `import` for a relative dep, none use dynamic `import()`), so the comment-safe
 * require parser keeps full recall on `.ts`, and real external/dynamic/path hazards in a port are still seen.
 */
function refSource(root: string, name: string): string {
  const tsPath = path.join(coreDir(root), name + ".ts");
  const jsPath = path.join(coreDir(root), name + ".js");
  return fs.readFileSync(fs.existsSync(tsPath) ? tsPath : jsPath, "utf8");
}

/** The runtime/core module node names (basenames of non-test `.js`), sorted. */
function moduleNames(root: string): string[] {
  const dir = coreDir(root);
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"))
    .map((f) => f.slice(0, -3))
    .sort();
}

/** Direct internal deps (relative `./x` requires), de-duplicated + sorted. */
function directDepsOf(root: string, name: string): string[] {
  const src = refSource(root, name);
  const { literal } = parseRequiresFromSource(src);
  const deps = new Set<string>();
  for (const spec of literal) {
    if (spec.startsWith("./")) deps.add(spec.slice(2));
    else if (spec.startsWith("../")) continue; // out-of-core refs are not core nodes
  }
  return [...deps].sort();
}

/** The three documented build-dist-closure hazards for ONE module's source. */
function moduleHazards(root: string, name: string): { dynamicRequire: boolean; externalRequire: boolean; pathHazard: boolean } {
  const src = refSource(root, name);
  const { literal, dyn } = parseRequiresFromSource(src); // comment-safe: strips comments, preserves strings
  const externalRequire = literal.some((s) => !s.startsWith(".") && !isBuiltin(s));
  // pathHazard must ignore COMMENTS (a module that merely mentions __dirname in a comment is not a hazard —
  // observed false positive: build-recovery-engine is process.cwd()-safe yet documents the historical
  // __dirname derivation in a comment). Strip comments first; string/template literals are preserved VERBATIM
  // by stripComments, so a path-hazard token inside an executable string still counts (no recall loss).
  const code = stripComments(src);
  const usesPathBuild = /\bpath\.(resolve|join)\b/.test(code);
  // __dirname is ALWAYS a compilation-location hazard when it feeds a path build: it resolves to the module's
  // on-disk directory, which SHIFTS from runtime/core to runtime/dist/core after compilation.
  const dirnameHazard = /\b__dirname\b/.test(code);
  // REPO_ROOT (V51 — third defect class) is a hazard ONLY when it is NOT provably derived from process.cwd().
  // A port that assigns `REPO_ROOT = process.cwd()` (the proven repo convention — V48 expert-profile-assembler)
  // is dist-safe; the former predicate keyed on the bare TOKEN and so mis-flagged it. Clear the REPO_ROOT
  // contribution ONLY on an explicit `REPO_ROOT = process.cwd()` assignment (an optional TS type annotation
  // between the name and `=` is tolerated). Any OTHER derivation (e.g. `REPO_ROOT = path.resolve(__dirname,…)`)
  // leaves __dirname in the code and is still caught by dirnameHazard above — so recall is NEVER lowered.
  const repoRootSafe = /\bREPO_ROOT\b[^=\n]*=\s*process\.cwd\(\s*\)/.test(code);
  const repoRootHazard = /\bREPO_ROOT\b/.test(code) && !repoRootSafe;
  const pathHazard = usesPathBuild && (dirnameHazard || repoRootHazard);
  return { dynamicRequire: dyn === true, externalRequire, pathHazard };
}

export interface ImpactGraph {
  modules: string[];
  deps: Record<string, string[]>;
  consumers: Record<string, string[]>;
}

/** Build the full direct-dependency + reverse-consumer graph over runtime/core. Pure read. */
export function buildGraph(root: string = process.cwd()): ImpactGraph {
  const modules = moduleNames(root);
  const present = new Set(modules);
  const deps: Record<string, string[]> = {};
  const consumers: Record<string, string[]> = {};
  for (const m of modules) consumers[m] = [];
  for (const m of modules) {
    const d = directDepsOf(root, m).filter((x) => present.has(x)); // only edges to real core nodes
    deps[m] = d;
    for (const dep of d) consumers[dep].push(m);
  }
  for (const m of modules) consumers[m].sort();
  return { modules, deps, consumers };
}

export interface ImpactReport {
  module: string;
  exists: boolean;
  directDeps: string[];
  transitiveClosure: string[]; // the module + all transitive internal deps (sorted; includes self)
  consumers: string[];
  closureHazards: { dynamicRequire: boolean; externalRequire: boolean; pathHazard: boolean; modules: string[] };
  impactedTests: string[];
}

/** Which test files reference a module (or any of its consumers) by basename. Sorted. */
function impactedTests(root: string, names: Set<string>): string[] {
  const out = new Set<string>();
  const scan = (dir: string, pred: (f: string) => boolean) => {
    let files: string[] = [];
    try { files = fs.readdirSync(dir); } catch { return; }
    for (const f of files) {
      if (!pred(f)) continue;
      let src = "";
      try { src = fs.readFileSync(path.join(dir, f), "utf8"); } catch { continue; }
      for (const n of names) {
        if (src.includes(n)) { out.add(path.relative(root, path.join(dir, f))); break; }
      }
    }
  };
  scan(coreDir(root), (f) => f.endsWith(".test.js"));
  scan(path.join(root, "runtime", "__bench__"), (f) => f.endsWith(".e2e.test.ts"));
  return [...out].sort();
}

/** Full impact report for ONE module. Pure read; closure walked over direct-dep edges. */
export function impactOf(root: string = process.cwd(), module: string): ImpactReport {
  const graph = buildGraph(root);
  const exists = graph.modules.includes(module);
  if (!exists) {
    return {
      module, exists: false, directDeps: [], transitiveClosure: [], consumers: [],
      closureHazards: { dynamicRequire: false, externalRequire: false, pathHazard: false, modules: [] },
      impactedTests: [],
    };
  }
  // Transitive closure (module + all reachable internal deps).
  const closure = new Set<string>();
  const stack = [module];
  while (stack.length) {
    const n = stack.pop() as string;
    if (closure.has(n)) continue;
    closure.add(n);
    for (const d of graph.deps[n] || []) if (!closure.has(d)) stack.push(d);
  }
  const closureList = [...closure].sort();
  // Hazards anywhere in the closure (the build-dist-closure rejection surface).
  let dyn = false, ext = false, pth = false;
  const hazardModules: string[] = [];
  for (const n of closureList) {
    const h = moduleHazards(root, n);
    if (h.dynamicRequire || h.externalRequire || h.pathHazard) hazardModules.push(n);
    dyn = dyn || h.dynamicRequire; ext = ext || h.externalRequire; pth = pth || h.pathHazard;
  }
  return {
    module, exists: true,
    directDeps: graph.deps[module] || [],
    transitiveClosure: closureList,
    consumers: graph.consumers[module] || [],
    closureHazards: { dynamicRequire: dyn, externalRequire: ext, pathHazard: pth, modules: hazardModules.sort() },
    impactedTests: impactedTests(root, new Set([module, ...(graph.consumers[module] || [])])),
  };
}

module.exports = { buildGraph, impactOf };

// Read-only CLI: print the impact report for a module. Mutates nothing.
if (require.main === module) {
  const target = process.argv[2];
  if (!target) { process.stdout.write("usage: change-impact-graph <module>\n"); process.exit(1); }
  process.stdout.write(JSON.stringify(impactOf(process.cwd(), target), null, 2) + "\n");
}

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
