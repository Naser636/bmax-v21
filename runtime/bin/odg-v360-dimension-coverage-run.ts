#!/usr/bin/env node
"use strict";
/*
 * V360 §10/§14 — DIMENSION COVERAGE RUN (runtime entry). Grounds the 15-dimension Boussole completeness view in REALITY: the
 * real compass (odg-v360-compass) for PR-anchored capabilities + the real module/consumer graph (change-impact-graph +
 * odg-consumer-scan, bin-aware) for module existence/consumers. READ-ONLY. Answers "across the 15 V360 dimensions, which are
 * COVERED, THIN, or BLIND?" honestly.
 *
 * Usage: npx tsx runtime/bin/odg-v360-dimension-coverage-run.ts
 */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");
const CIG = require(path.join(ROOT, "runtime", "core", "change-impact-graph.js"));
const SCAN = require(path.join(ROOT, "runtime", "core", "odg-consumer-scan.js"));
const COMPASS = require(path.join(ROOT, "runtime", "core", "odg-v360-compass.js"));
const DC = require(path.join(ROOT, "runtime", "core", "odg-v360-dimension-coverage.js"));

// real module/consumer graph (core + bin/src/scripts import scan; bin-aware for entry-points).
const graph = CIG.buildGraph(ROOT);
const moduleSet = new Set<string>(graph.modules);
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
const { hasConsumer: hasImport } = SCAN.mergeConsumers(graph, collectScanned());
const moduleExists = (name: string) => moduleSet.has(name);
const hasConsumer = (name: string) => hasImport(name) || (() => { try { return fs.existsSync(path.join(ROOT, "runtime", "bin", name + ".ts")); } catch { return false; } })();

const compass = COMPASS.buildCompass({ asOf: new Date().toISOString().slice(0, 10) });
const r = DC.buildDimensionCoverage({ compass, moduleExists, hasConsumer });

process.stdout.write(JSON.stringify({
  dimensionCoverage: "V360 §10/§14 — Boussole completeness over the 15 strategic dimensions (grounded in the real compass + module/consumer graph)",
  counts: r.counts,
  dimensions: r.dimensions.map((d: any) => ({ id: d.id, coverage: d.coverage, strong: d.strong, modules: d.modules.map((m: any) => `${m.module}:${m.status}`) })),
  blindSpots: r.blindSpots, thinSpots: r.thinSpots,
}, null, 2) + "\n");
process.stdout.write(`\nDIMENSION-COVERAGE: ${r.counts.covered}/${r.counts.total} dimensions COVERED, ${r.counts.thin} THIN, ${r.counts.blind} BLIND. ` +
  (r.blindSpots.length ? `Blind spots: ${r.blindSpots.join(", ")}. ` : "No blind spots. ") +
  `COVERED = a representative module is a PR-anchored compass capability OR exists with a real non-test consumer; coverage is never claimed without a real backing module (a lens over the compass + the real graph, not a second roadmap).\n`);
process.exit(0);
export {};
