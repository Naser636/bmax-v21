#!/usr/bin/env node
"use strict";
/*
 * V360 §2 — SYSTEM COVERAGE MATRIX (Boussole, full-system view). PURE, deterministic. Complements odg-v360-compass (the
 * curated V360 capability list) with a GROUNDED, whole-repo coverage derived from the REAL require-graph
 * (change-impact-graph) — so ODG's self-knowledge reflects reality, detects orphans, and flags REGRESSIONS vs a prior
 * snapshot. It is NOT a second roadmap/registry.
 *
 * HONEST SCOPE (the point): the require-graph grounds EXISTENCE + CONNECTION/CALL only. FUNCTION / MEASURE / PROOF are NOT
 * derivable from the graph — they require test/run evidence — so they are reported as NOT_GRAPH_DERIVABLE, never fabricated.
 * This view does NOT claim to cover all of ODG's runtime behaviour; it covers module connectivity. `consumersOf` is
 * injectable (tests pass a map ⇒ zero fs); the bin supplies a real core+bin scanner.
 */

const CIG = require("./change-impact-graph.js");

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isTestName(m: string): boolean { return /\.test$/.test(m) || /\.test\.ts$/.test(m); } // NOT /-test$/ — would drop real modules like odg-ks-test

// capability DOMAINS (name heuristics) — a module is assigned to the FIRST matching domain, else "other".
const DOMAINS = Object.freeze([
  freeze({ id: "radar-frontier", match: /radar|frontier/ }),
  freeze({ id: "memory-learning", match: /memory|learning|compounding|knowledge|lesson|patch-memory/ }),
  freeze({ id: "reasoning-cognition", match: /cognitive|reason|decision|inference|decompos|causal|world-model|meta-intel|discovery|hypothes/ }),
  freeze({ id: "orchestration-scheduling", match: /orchestrat|scheduler|campaign|mission|workgraph|allocator|workflow/ }),
  freeze({ id: "self-healing", match: /heal|repair|recover|incident|remediat|diagnos|rce-|build-recovery|validation-engine/ }),
  freeze({ id: "primitives-governance", match: /primitive|truth-lock|policy|permission|action-gate|provenance|evidence|governance|audit-log|autonomy/ }),
]);
function domainOf(m: string): string { for (const d of DOMAINS) if ((d as any).match.test(m)) return (d as any).id; return "other"; }

/**
 * buildCoverage(opts?) -> { asOf, domains, counts, orphanCandidates, regressions, scope, note }.
 *   opts: { modules?:string[], consumersOf?(module)->string[], graph?, root?, previous?:{module:status}, domainsFilter?:string[] }.
 * Default modules/consumers come from change-impact-graph.buildGraph (core); a caller (bin) may inject a core+bin scanner.
 */
function buildCoverage(opts: any = {}): any {
  const o = isObj(opts) ? opts : {};
  const graph = isObj(o.graph) ? o.graph : (Array.isArray(o.modules) && typeof o.consumersOf === "function" ? null : CIG.buildGraph(o.root || process.cwd()));
  const modules = Array.isArray(o.modules) ? o.modules : (graph ? arr(graph.modules) : []);
  const consumersOf = typeof o.consumersOf === "function" ? o.consumersOf : (m: string) => (graph && isObj(graph.consumers) ? arr(graph.consumers[m]) : []);
  const prev = isObj(o.previous) ? o.previous : {};

  const domainAgg: Record<string, any> = {};
  const statusByModule: Record<string, string> = {};
  const orphanCandidates: string[] = [];
  for (const m of modules) {
    if (typeof m !== "string" || isTestName(m)) continue;
    const cons = arr(consumersOf(m)).filter((c: any) => typeof c === "string" && !isTestName(c) && c !== m);
    const status = cons.length > 0 ? "CONNECTED" : "NO_CONSUMER"; // NO_CONSUMER ⇒ candidate orphan OR an entry-point (bin)
    statusByModule[m] = status;
    if (status === "NO_CONSUMER") orphanCandidates.push(m);
    const dom = domainOf(m);
    const a = domainAgg[dom] || (domainAgg[dom] = { domain: dom, total: 0, connected: 0, noConsumer: 0 });
    a.total += 1; if (status === "CONNECTED") a.connected += 1; else a.noConsumer += 1;
  }

  // REGRESSION / staleness detection vs a prior snapshot: CONNECTED → NO_CONSUMER (regressed) and the reverse (newly-connected).
  const regressions: any[] = []; const newlyConnected: any[] = [];
  for (const m of Object.keys(prev)) {
    if (statusByModule[m] === undefined) { if (prev[m] === "CONNECTED") regressions.push({ module: m, from: "CONNECTED", to: "ABSENT", kind: "REMOVED" }); continue; }
    if (prev[m] === "CONNECTED" && statusByModule[m] === "NO_CONSUMER") regressions.push({ module: m, from: "CONNECTED", to: "NO_CONSUMER", kind: "LOST_CONSUMER" });
    if (prev[m] === "NO_CONSUMER" && statusByModule[m] === "CONNECTED") newlyConnected.push(m);
  }

  const domains = Object.values(domainAgg).sort((a: any, b: any) => a.domain.localeCompare(b.domain)).map((d: any) => freeze(d));
  const filtered = Array.isArray(o.domainsFilter) && o.domainsFilter.length ? domains.filter((d: any) => o.domainsFilter.indexOf(d.domain) >= 0) : domains;
  const totalModules = modules.filter((m: any) => typeof m === "string" && !isTestName(m)).length;
  return freeze({
    asOf: typeof o.asOf === "string" ? o.asOf : null,
    domains: freeze(filtered),
    counts: freeze({ modules: totalModules, connected: Object.values(statusByModule).filter((s) => s === "CONNECTED").length, noConsumer: orphanCandidates.length }),
    orphanCandidates: freeze(orphanCandidates.slice().sort()),
    regressions: freeze(regressions), newlyConnected: freeze(newlyConnected.slice().sort()),
    statusByModule: freeze(statusByModule),   // snapshot ⇒ feed back as `previous` next run for regression detection
    scope: freeze({ grounded: ["EXISTENCE", "CONNECTION", "CALL (non-test consumer in the require-graph)"], notGraphDerivable: ["FUNCTION", "MEASURE", "PROOF (require test/run evidence — reported elsewhere, never fabricated here)"] }),
    note: "GROUNDED connectivity coverage over the real require-graph (change-impact-graph). CONNECTION/CALL are derived from actual consumers; FUNCTION/MEASURE/PROOF are NOT graph-derivable and are NOT claimed here (no partial audit is presented as full-ODG coverage). NO_CONSUMER = a candidate orphan OR a runtime entry-point (verify against runtime/bin). Regressions flagged vs a prior snapshot.",
  });
}

const SYSTEM_COVERAGE_CONTRACT = Object.freeze({
  id: "V360-SYSTEM-COVERAGE",
  purpose: "§2 — grounded full-repo connectivity coverage (Boussole) over the real require-graph; orphan + REGRESSION detection; honest scope (CONNECTION/CALL grounded, FUNCTION/MEASURE/PROOF not graph-derivable); not a second roadmap",
  reuses: Object.freeze(["change-impact-graph.buildGraph (the real module/consumer graph — no second graph)", "injectable consumersOf (core+bin) for accurate CALL status + zero-fs tests"]),
  invariants: Object.freeze([
    "statuses are DERIVED from the real consumer-graph (not asserted): CONNECTED = has a non-test consumer; NO_CONSUMER = candidate orphan / entry-point",
    "honest scope: FUNCTION/MEASURE/PROOF are NOT graph-derivable and are NOT fabricated — a partial (connectivity) audit is never presented as full-ODG coverage",
    "REGRESSIONS (CONNECTED → NO_CONSUMER / REMOVED) are detected vs a prior snapshot — an old status is invalidated when evidence changes",
    "PURE/deterministic/frozen; reuses change-impact-graph; no second roadmap/registry/graph",
  ]),
});

module.exports = { buildCoverage, domainOf, DOMAINS, SYSTEM_COVERAGE_CONTRACT };
export {};
