#!/usr/bin/env node
"use strict";

/*
 * V12.4 / ARCHITECTURE INTELLIGENCE & RATIONALIZATION (addendum §3-§5) — READ-ONLY architectural audit. PURE,
 * deterministic. Over supplied module metadata (deps, consumers, exports, contract, hasTest) it detects: circular
 * dependencies (cycle-safe), unused components (no consumers + no test + not an entrypoint), and DUPLICATION/overlap
 * CANDIDATES by comparing RESPONSIBILITIES (contract source domain + exported-symbol sets) — NOT file-name similarity.
 * The non-negotiable rule (§5): a similarity NEVER authorizes a fusion — every candidate is NEEDS_REVIEW; MERGE/RETIRE
 * require independent proof of behavior-equivalence + zero remaining dependencies, which an audit alone cannot give.
 * It REUSES the existing dependency graph (change-impact-graph) — no new graph/engine. It reads/reports; it changes,
 * merges, deletes nothing and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const DECISION = Object.freeze(["KEEP", "MERGE", "REUSE", "ADAPT", "DEPRECATE", "RETIRE", "NEEDS_REVIEW"]);

/** detectCycles(deps) -> array of cycles (each a module list). Cycle-safe DFS. deps: { module: [deps] }. */
function detectCycles(deps: any): string[][] {
  const g = isObj(deps) ? deps : {};
  const cycles: string[][] = []; const WHITE = 0, GREY = 1, BLACK = 2; const color: Record<string, number> = {};
  const stack: string[] = [];
  function dfs(n: string): void {
    color[n] = GREY; stack.push(n);
    for (const m of arr(g[n]).map(String)) {
      if (color[m] === GREY) { const i = stack.indexOf(m); cycles.push(stack.slice(i).concat(m)); }
      else if ((color[m] || WHITE) === WHITE && g[m] !== undefined) dfs(m);
    }
    stack.pop(); color[n] = BLACK;
  }
  for (const n of Object.keys(g)) if ((color[n] || WHITE) === WHITE) dfs(n);
  return cycles;
}

/** responsibilitySignature(mod) -> a key by RESPONSIBILITY (contract source domain + sorted exports), not file name. */
function responsibilitySignature(mod: any): string | null {
  const m = isObj(mod) ? mod : {};
  const exports = arr(m.exports).filter((x) => typeof x === "string").slice().sort();
  const domain = typeof m.contractSource === "string" ? m.contractSource.split("—")[0].trim().toLowerCase() : "";
  if (exports.length === 0 && !domain) return null;
  return `${domain}::${exports.join(",")}`;
}

/**
 * auditArchitecture({ modules, entrypoints }) -> { circularDeps, unusedCandidates, duplicationCandidates, summary }.
 * modules: [{ id, deps, consumers, exports, contractSource, hasTest }]. Every candidate ⇒ NEEDS_REVIEW (fail-closed).
 */
function auditArchitecture(input: any): any {
  const o = isObj(input) ? input : {};
  const modules = arr(o.modules).filter(isObj);
  const entrypoints = new Set(arr(o.entrypoints).map(String));

  const depsMap: Record<string, any> = {}; for (const m of modules) depsMap[String(m.id)] = arr(m.deps).map(String);
  const cycles = detectCycles(depsMap);

  const unusedCandidates = modules
    .filter((m) => arr(m.consumers).length === 0 && m.hasTest !== true && !entrypoints.has(String(m.id)))
    .map((m) => Object.freeze({ id: m.id, decision: "NEEDS_REVIEW", reason: "no consumers + no test + not an entrypoint — RETIRE candidate (needs proof of zero dependencies before any retire)" }));

  // duplication/overlap by RESPONSIBILITY signature (not file name). Groups with >1 member ⇒ NEEDS_REVIEW.
  const bySig: Record<string, string[]> = {};
  for (const m of modules) { const s = responsibilitySignature(m); if (s) (bySig[s] = bySig[s] || []).push(String(m.id)); }
  const duplicationCandidates = Object.keys(bySig).filter((s) => bySig[s].length > 1)
    .map((s) => Object.freeze({ signature: s, members: Object.freeze(bySig[s].sort()), decision: "NEEDS_REVIEW", reason: "same responsibility signature (contract domain + exports) — a similarity NEVER authorizes a fusion; MERGE/REUSE requires behavior-equivalence + consumer proof" }));

  return Object.freeze({
    circularDeps: Object.freeze(cycles.map((c) => Object.freeze(c))),
    unusedCandidates: Object.freeze(unusedCandidates),
    duplicationCandidates: Object.freeze(duplicationCandidates),
    summary: Object.freeze({ modules: modules.length, cycles: cycles.length, unused: unusedCandidates.length, duplicationGroups: duplicationCandidates.length }),
    note: "READ-ONLY audit — every finding is NEEDS_REVIEW; nothing is merged/retired without independent proof (§5). Reuses the existing dependency graph (no new graph).",
  });
}

const ARCHITECTURE_AUDIT_CONTRACT = Object.freeze({
  id: "V124-ARCHITECTURE-AUDIT",
  source: "ODG addendum — Architecture Intelligence & Rationalization (§3-§5 read-only audit)",
  decisions: DECISION,
  reuses: Object.freeze(["change-impact-graph (deps/consumers — the existing dependency graph; no new graph)", "capability-map (capability inventory)"]),
  notAuthority: "a read-only architectural audit; it merges/retires/changes nothing and grants no authority",
  invariants: Object.freeze([
    "duplication is detected by RESPONSIBILITY (contract domain + exported symbols), NOT file-name similarity",
    "a similarity NEVER authorizes a fusion — every candidate is NEEDS_REVIEW (fail-closed)",
    "a RETIRE candidate (no consumers + no test + not entrypoint) still needs proof of zero remaining dependencies before any retire",
    "cycle detection is cycle-safe; it reuses the existing dependency graph (no new graph/engine, anti-gas-factory)",
    "pure/deterministic/read-only: module metadata in → findings out; changes nothing; no clock/random/network",
  ]),
});

module.exports = { detectCycles, responsibilitySignature, auditArchitecture, ARCHITECTURE_AUDIT_CONTRACT };

if (require.main === module) {
  const demo = auditArchitecture({ modules: [
    { id: "a", deps: ["b"], consumers: ["x"], exports: ["foo"], contractSource: "D — alpha" },
    { id: "b", deps: ["a"], consumers: ["a"], exports: ["foo"], contractSource: "D — alpha" },
    { id: "orphan", deps: [], consumers: [], hasTest: false, exports: ["z"] },
  ] });
  process.stdout.write(JSON.stringify({ ...ARCHITECTURE_AUDIT_CONTRACT, demo: demo.summary }, null, 2) + "\n");
}

export {};
