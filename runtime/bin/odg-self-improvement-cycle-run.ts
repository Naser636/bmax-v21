#!/usr/bin/env node
"use strict";
/*
 * V360 §3 — SELF-IMPROVEMENT CYCLE RUN (runtime entry). Wires the REAL grounded gap-detection into the integrated cycle:
 *   odg-system-coverage.buildCoverage (real require-graph, core + bin/src/scripts import scan)  +
 *   odg-v360-compass.buildCompass (with a REAL hasConsumer drift check)                          ->
 *   odg-self-improvement-cycle.runCycle  (PROPOSED-only, deny-by-default).
 *
 * This is the single integrated consumer that threads coverage + compass + learning into one cycle — and gives the coverage
 * matrix and the Boussole a real (non-demo) consumer. READ-ONLY: it proposes, it never builds / integrates / measures.
 *
 * Usage: npx tsx runtime/bin/odg-self-improvement-cycle-run.ts [prevSnapshot.json]
 */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");
const CIG = require(path.join(ROOT, "runtime", "core", "change-impact-graph.js"));
const COV = require(path.join(ROOT, "runtime", "core", "odg-system-coverage.js"));
const COMPASS = require(path.join(ROOT, "runtime", "core", "odg-v360-compass.js"));
const CYCLE = require(path.join(ROOT, "runtime", "core", "odg-self-improvement-cycle.js"));
const SCAN = require(path.join(ROOT, "runtime", "core", "odg-consumer-scan.js"));

// ---- real merged consumer map via the SHARED scan (core require-graph + bin/src/scripts IMPORT refs: path / path.join /
//      r("name") indirection, NOT bare data-string mentions) — the ONE place coverage + this cycle agree on connectivity ----
const graph = CIG.buildGraph(ROOT);
function collectScanned(): any[] {
  const out: any[] = [];
  function walk(dir: string, tag: string, depth: number): void {
    let entries: any[]; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || depth > 6) continue; walk(full, tag, depth + 1); continue; }
      if (!/\.(ts|tsx|js|jsx)$/.test(e.name) || /\.test\.(ts|js)$/.test(e.name)) continue;
      let src: string; try { src = fs.readFileSync(full, "utf8"); } catch { continue; }
      out.push({ consumer: tag + ":" + e.name.replace(/\.(tsx?|jsx?)$/, ""), src });
    }
  }
  walk(path.join(ROOT, "runtime", "bin"), "bin", 0);
  walk(path.join(ROOT, "src"), "app", 0);
  walk(path.join(ROOT, "scripts"), "script", 0);
  return out;
}
const { consumersOf, hasConsumer: hasImportConsumer } = SCAN.mergeConsumers(graph, collectScanned());
// A compass capability whose `module` is a runtime/bin ENTRY-POINT is operational by being RUN, not by being imported — a bin
// is never require()'d, so hasImportConsumer is meaninglessly false for it. Treat an existing `runtime/bin/<module>.ts` as a
// real consumer so the drift check flags only genuine orphans (a core module declared CONNECTED with no caller), not entries.
function hasConsumer(m: string): boolean {
  if (hasImportConsumer(m)) return true;
  try { return fs.existsSync(path.join(ROOT, "runtime", "bin", m + ".ts")); } catch { return false; }
}

// ---- real coverage (with optional prior snapshot for regression) + real compass (with drift check) ----
let previous: Record<string, string> = {};
const prevArg = process.argv[2];
if (prevArg && fs.existsSync(prevArg)) { try { previous = JSON.parse(fs.readFileSync(prevArg, "utf8")); } catch { previous = {}; } }
const asOf = new Date().toISOString().slice(0, 10);
const coverage = COV.buildCoverage({ modules: graph.modules, consumersOf, previous, asOf });
const compass = COMPASS.buildCompass({ asOf, hasConsumer });

// ---- run the integrated cycle (PROPOSED-only) ----
const report = CYCLE.runCycle({ coverage, compass, signals: [], lessons: [], missionTopic: { domain: "engineering" }, now: asOf });

process.stdout.write(JSON.stringify({
  cycle: "V360 §3 — integrated self-improvement (PROPOSED-only, deny-by-default)", asOf,
  grounding: { coverageConnected: coverage.counts.connected, coverageNoConsumer: coverage.counts.noConsumer, regressions: coverage.regressions.length, compassDrift: compass.drift.length, compassNext: compass.nextPriority },
  stages: report.stages,
  gap: report.gap, designProposal: report.designProposal, ownerDecision: report.ownerDecision,
  governed: { build: report.build, integrate: report.integrate, measure: report.measure, selfAuthorized: report.selfAuthorized },
  outcome: report.outcome, feedbackForBoussole: report.feedbackForBoussole,
}, null, 2) + "\n");
process.stdout.write(`\nCYCLE: outcome=${report.outcome}. ` +
  (report.gap ? `Proposed (PROPOSED-only) to close gap on '${report.gap.target}' (${report.gap.source}). ` : `No actionable gap — nothing proposed. `) +
  `BUILD=${report.build}, INTEGRATE=${report.integrate}, MEASURE=${report.measure}, selfAuthorized=${report.selfAuthorized}. Integration requires INDEPENDENT inspection; no mutation performed.\n`);
if (process.argv[3]) { try { fs.writeFileSync(process.argv[3], JSON.stringify(coverage.statusByModule, null, 2)); process.stdout.write(`snapshot written: ${process.argv[3]}\n`); } catch (e: any) { process.stdout.write(`snapshot write skipped: ${e && e.message}\n`); } }
process.exit(0);
export {};
