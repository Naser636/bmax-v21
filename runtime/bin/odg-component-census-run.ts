#!/usr/bin/env node
"use strict";
/*
 * V361-A Chantier-1 — COMPONENT CENSUS RUN (runtime entry). Runs the component census over the REAL repo: the real
 * require-graph (change-impact-graph) + the core+bin/app/script import scan (odg-consumer-scan) + per-module source + the
 * concatenated app text, classifying every core module and — for the no-consumer set — a weak HEURISTIC `why`. READ-ONLY.
 * Answers §15: what exists, what is used, what is NOT (by STATIC scan — may miss dynamic/spawn consumers) and the per-module
 * decision surface. Broken routes are evidenced by the passing build + suite, not asserted here (that check is tautological).
 *
 * Usage: npx tsx runtime/bin/odg-component-census-run.ts
 */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");
const CIG = require(path.join(ROOT, "runtime", "core", "change-impact-graph.js"));
const CENSUS = require(path.join(ROOT, "runtime", "core", "odg-component-census.js"));

const CORE = path.join(ROOT, "runtime", "core");
const graph = CIG.buildGraph(ROOT);

// out-of-core consumer sources (bin/app/script) + concatenated app text (for the APP_REFERENCED heuristic).
const scanned: any[] = []; let appText = "";
function walk(dir: string, tag: string, depth: number): void {
  let entries: any[]; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || depth > 6) continue; walk(full, tag, depth + 1); continue; }
    if (!/\.(ts|tsx|js|jsx)$/.test(e.name) || /\.test\.(ts|js)$/.test(e.name)) continue;
    let src: string; try { src = fs.readFileSync(full, "utf8"); } catch { continue; }
    scanned.push({ consumer: tag + ":" + e.name.replace(/\.(tsx?|jsx?)$/, ""), src });
    if (tag === "app") appText += "\n" + src;
  }
}
// scan CORE too so dynamic / spawn / path.join references between core modules (e.g. spawnSync of "patch-executor.js") are
// seen — change-impact-graph only captures LITERAL ./x requires, so core→core non-literal consumers would be missed.
walk(path.join(ROOT, "runtime", "core"), "core", 0);
walk(path.join(ROOT, "runtime", "bin"), "bin", 0);
walk(path.join(ROOT, "src"), "app", 0);
walk(path.join(ROOT, "scripts"), "script", 0);

const sourceCache: Record<string, string> = {};
const sourceOf = (m: string) => { if (sourceCache[m] === undefined) { try { sourceCache[m] = fs.readFileSync(path.join(CORE, m + ".ts"), "utf8"); } catch { sourceCache[m] = ""; } } return sourceCache[m]; };
const binExists = (m: string) => { try { return fs.existsSync(path.join(ROOT, "runtime", "bin", m + ".ts")); } catch { return false; } };

const r = CENSUS.census({ graph, scanned, sourceOf, appText, binExists });

process.stdout.write(JSON.stringify({
  componentCensus: "V361-A Chantier-1 — real component inventory over the require-graph (core+bin+app+script scan)",
  total: r.total, counts: r.counts,
  noConsumerWhy: r.noConsumerWhy,
  decisionSurface: r.decisionSurface.length,
  decisionSurfaceSample: r.decisionSurface.slice(0, 30),
  brokenRoutes: "0 — evidenced by the passing build + full test suite (a dangling literal require would fail them); NOT independently asserted here",
}, null, 2) + "\n");
process.stdout.write(`\nCENSUS: ${r.counts.CONNECTED} CONNECTED / ${r.counts.NO_CONSUMER} NO_CONSUMER (no STATIC importer; may miss dynamic/spawn/app-dynamic) of ${r.total}. ` +
  `No-consumer WHY: ${Object.entries(r.noConsumerWhy).map(([k, v]) => `${k}=${v}`).join(", ")}. ` +
  `DECISION SURFACE = ${r.decisionSurface.length} modules with no detected importer + no plausible reason — the per-module judgment pool (liveness UNKNOWN; the export convention is near-universal so EXPORTS_API_NO_CONSUMER is NOT proof of harmlessness). This is NOT "no orphans" — it is the set that needs a per-component connect decision. No consumer fabricated, nothing auto-activated. Broken routes: 0 (evidenced by passing build + suite, not independently asserted).\n`);
process.exit(0);
export {};
