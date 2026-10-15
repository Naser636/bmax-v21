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

// REUSE the canonical, comment-safe require parser (no duplicate parser).
const { parseRequiresFromSource } = require("../../scripts/lib/js-require-scan");

const NODE_BUILTINS: ReadonlySet<string> = new Set(builtinModules);
function isBuiltin(spec: string): boolean {
  return NODE_BUILTINS.has(spec) || NODE_BUILTINS.has(spec.replace(/^node:/, ""));
}

function coreDir(root: string): string {
  return path.join(root, "runtime", "core");
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
  const src = fs.readFileSync(path.join(coreDir(root), name + ".js"), "utf8");
  const { literal } = parseRequiresFromSource(src) as { literal: string[]; dyn: boolean };
  const deps = new Set<string>();
  for (const spec of literal) {
    if (spec.startsWith("./")) deps.add(spec.slice(2));
    else if (spec.startsWith("../")) continue; // out-of-core refs are not core nodes
  }
  return [...deps].sort();
}

/** The three documented build-dist-closure hazards for ONE module's source. */
function moduleHazards(root: string, name: string): { dynamicRequire: boolean; externalRequire: boolean; pathHazard: boolean } {
  const src = fs.readFileSync(path.join(coreDir(root), name + ".js"), "utf8");
  const { literal, dyn } = parseRequiresFromSource(src) as { literal: string[]; dyn: boolean };
  const externalRequire = literal.some((s) => !s.startsWith(".") && !isBuiltin(s));
  const pathHazard = /\b(__dirname|REPO_ROOT)\b/.test(src) && /\bpath\.(resolve|join)\b/.test(src);
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
