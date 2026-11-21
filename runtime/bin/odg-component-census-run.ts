#!/usr/bin/env node
"use strict";
/*
 * V361-A Chantier-1 — COMPONENT CENSUS RUN (runtime entry). Runs the component census over the REAL repo: the real
 * require-graph (change-impact-graph) + the core+bin/app/script import scan (odg-consumer-scan) + per-module source + the
 * concatenated app text, classifying every core module and — for the no-consumer set — WHY it is dormant (heuristic). Also
 * verifies there are no genuinely-broken executable core routes. READ-ONLY. Answers §15: what exists, what is used, what is
 * NOT and why, which are the actionable candidates.
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
const coreNames = new Set<string>();
for (const f of fs.readdirSync(CORE)) { if (f.endsWith(".ts") && !f.endsWith(".test.ts")) coreNames.add(f.slice(0, -3)); else if (f.endsWith(".js")) coreNames.add(f.slice(0, -3)); }

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
walk(path.join(ROOT, "runtime", "bin"), "bin", 0);
walk(path.join(ROOT, "src"), "app", 0);
walk(path.join(ROOT, "scripts"), "script", 0);

const sourceCache: Record<string, string> = {};
const sourceOf = (m: string) => { if (sourceCache[m] === undefined) { try { sourceCache[m] = fs.readFileSync(path.join(CORE, m + ".ts"), "utf8"); } catch { sourceCache[m] = ""; } } return sourceCache[m]; };
const binExists = (m: string) => { try { return fs.existsSync(path.join(ROOT, "runtime", "bin", m + ".ts")); } catch { return false; } };

const r = CENSUS.census({ graph, scanned, sourceOf, appText, binExists });

// verify no genuinely-broken executable core route (a relative require to a missing core module, outside strings/comments
// would break the build — the build passing already proves 0; we re-affirm by checking real deps resolve).
let brokenRoutes = 0;
for (const m of graph.modules) for (const d of (graph.deps[m] || [])) if (!coreNames.has(d)) brokenRoutes++;

process.stdout.write(JSON.stringify({
  componentCensus: "V361-A Chantier-1 — real component inventory over the require-graph",
  total: r.total, counts: r.counts, brokenExecutableRoutes: brokenRoutes,
  noConsumerWhy: r.noConsumerWhy,
  actionableCandidates: r.actionableCandidates.length,
  actionableSample: r.actionableCandidates.slice(0, 30),
}, null, 2) + "\n");
process.stdout.write(`\nCENSUS: ${r.counts.CONNECTED} CONNECTED / ${r.counts.NO_CONSUMER} NO_CONSUMER (of ${r.total}); 0-broken-route check = ${brokenRoutes}. ` +
  `No-consumer WHY: ${Object.entries(r.noConsumerWhy).map(([k, v]) => `${k}=${v}`).join(", ")}. ` +
  `${r.actionableCandidates.length} GENUINELY_DORMANT_CANDIDATE modules need a per-component connect/activate decision (heuristic — confirm before acting; no consumer fabricated, nothing auto-activated).\n`);
process.exit(0);
export {};
