#!/usr/bin/env node
"use strict";
/*
 * V361-A §3/§4/§5 Chantier-1 — COMPONENT CENSUS. PURE, deterministic, READ-ONLY. Answers "ODG, what are your components, which
 * are used, which are NOT and WHY?" over the REAL require-graph — it does NOT invent consumers or auto-activate anything. It
 * COMPOSES change-impact-graph + odg-consumer-scan (no second graph) and, for each NO-CONSUMER module, attaches HEURISTIC
 * evidence that classifies WHY it is dormant so a connect/activate decision is grounded (not blind-wired).
 *
 * HONESTY: the per-module class is EVIDENCE to support a decision, NOT an authoritative verdict — a module with no detected
 * consumer is a CANDIDATE for judgment, never auto-labelled "useless" or auto-connected. CONNECTED = a real non-test consumer
 * exists. The heuristics (library / app-referenced / demonstrator / producer) are named HEURISTIC and can be wrong; the
 * GENUINELY_DORMANT set is the actionable-candidate pool that needs a per-component decision. No fabricated connectivity.
 */

const SCAN = require("./odg-consumer-scan.js"); // the shared import-reference scan (merge core + bin/app/script consumers)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isTest(c: string): boolean { return /\.test$/.test(c); }

const DEMO_RE = /(-demonstrator|-run|-bench|-benchmark|-selftest|-harness|-smoke)$/;

/**
 * census(input) -> frozen report. input: {
 *   graph (change-impact-graph.buildGraph result), scanned ([{consumer, src}] out-of-core sources for the shared scan),
 *   sourceOf(module)->string (the module's own source text, for producer/library heuristics), appText? (concatenated src/ text) }.
 * Classifies each core module CONNECTED / BIN_ENTRY / TEST_ONLY / NO_CONSUMER(+heuristic WHY). Pure: all inputs injected.
 */
function census(input: any): any {
  const i = isObj(input) ? input : {};
  const graph = isObj(i.graph) ? i.graph : {};
  const modules = arr(graph.modules).filter((m: any) => typeof m === "string" && !isTest(m));
  const { merged, hasConsumer } = SCAN.mergeConsumers(graph, arr(i.scanned));
  const sourceOf = typeof i.sourceOf === "function" ? i.sourceOf : () => "";
  const appText = typeof i.appText === "string" ? i.appText : "";
  const binExists = typeof i.binExists === "function" ? i.binExists : () => false;

  const records: any[] = [];
  const counts: Record<string, number> = { CONNECTED: 0, BIN_ENTRY: 0, TEST_ONLY: 0, NO_CONSUMER: 0 };
  const whyCounts: Record<string, number> = {};
  for (const m of modules) {
    const consumers = arr(merged[m]);
    const nonTest = consumers.filter((c: any) => typeof c === "string" && !isTest(c) && c !== m);
    let status: string; let why: string | null = null;
    if (nonTest.length > 0) { status = "CONNECTED"; }
    else if (binExists(m)) { status = "BIN_ENTRY"; }
    else if (consumers.length > 0) { status = "TEST_ONLY"; }
    else {
      status = "NO_CONSUMER";
      // HEURISTIC WHY (evidence, not a verdict): demonstrator-named / referenced by the app / side-effect producer / library.
      const src = String(sourceOf(m) || "");
      if (DEMO_RE.test(m)) why = "DEMONSTRATOR_NAMED";                                  // a *-run/-bench/-demonstrator entry
      else if (appText && new RegExp('["\'/]' + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '(?:\\.js)?["\']').test(appText)) why = "APP_REFERENCED_HEURISTIC"; // appears in src/
      else if (/\b(writeFileSync|mkdirSync)\s*\(/.test(src) && !/module\.exports\s*=\s*\{[^}]*\w/.test(src)) why = "PRODUCER_ARTIFACT_HEURISTIC"; // writes an artifact at load
      else if (/module\.exports\s*=\s*\{/.test(src)) why = "LIBRARY_HEURISTIC";          // exports an API surface ⇒ likely a passive library
      else why = "GENUINELY_DORMANT_CANDIDATE";                                          // none of the above ⇒ needs a decision
      whyCounts[why] = (whyCounts[why] || 0) + 1;
    }
    counts[status] = (counts[status] || 0) + 1;
    records.push(freeze({ module: m, status, consumerCount: nonTest.length, why, consumersSample: freeze(nonTest.slice(0, 4)) }));
  }

  const noConsumer = records.filter((r: any) => r.status === "NO_CONSUMER");
  return freeze({
    total: modules.length, counts: freeze(counts),
    noConsumerWhy: freeze(whyCounts),
    actionableCandidates: freeze(noConsumer.filter((r: any) => r.why === "GENUINELY_DORMANT_CANDIDATE").map((r: any) => r.module).sort()),
    records: freeze(records),
    note: "component census over the REAL require-graph. CONNECTED = a real non-test consumer exists; NO_CONSUMER modules carry a HEURISTIC `why` (demonstrator / app-referenced / producer / library / genuinely-dormant) — EVIDENCE to support a connect/activate decision, NOT an authoritative verdict and NEVER an auto-activation. The GENUINELY_DORMANT_CANDIDATE set needs a per-component decision; no consumer is ever fabricated to inflate connectivity.",
  });
}

const COMPONENT_CENSUS_CONTRACT = Object.freeze({
  id: "V361A-COMPONENT-CENSUS",
  purpose: "Chantier-1 inventory/cartography: classify every core module (CONNECTED / BIN_ENTRY / TEST_ONLY / NO_CONSUMER+heuristic-why) over the real require-graph to ground a connect/activate decision; composes change-impact-graph + odg-consumer-scan, no second graph",
  reuses: Object.freeze(["change-impact-graph.buildGraph (the real module/consumer graph)", "odg-consumer-scan.mergeConsumers (core + bin/app/script import scan — no fabricated consumers)"]),
  invariants: Object.freeze([
    "CONNECTED requires a REAL non-test consumer; a consumer is NEVER fabricated to inflate connectivity",
    "a NO_CONSUMER module's heuristic `why` is EVIDENCE to support a decision, NOT an authoritative verdict — never auto-labelled useless, never auto-activated",
    "the GENUINELY_DORMANT_CANDIDATE set is the actionable pool that needs a per-component decision; intentional libraries/demonstrators are distinguished heuristically (can be wrong, confirm before acting)",
    "PURE/deterministic/frozen READ-ONLY; composes the real graph + scan; no second graph; mutates nothing",
  ]),
});

module.exports = { census, COMPONENT_CENSUS_CONTRACT };
export {};
