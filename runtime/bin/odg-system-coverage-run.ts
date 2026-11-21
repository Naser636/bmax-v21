#!/usr/bin/env node
"use strict";
/*
 * V360 §2 — SYSTEM COVERAGE RUN (runtime entry). Renders the GROUNDED full-system coverage matrix over the REAL require-graph
 * (change-impact-graph, core) MERGED with a runtime/bin consumer scan — so a module consumed only by a bin entry is NOT
 * mis-reported as an orphan. Status is DERIVED from actual consumers (CONNECTED / NO_CONSUMER), grouped by capability domain,
 * with orphan + REGRESSION detection vs a prior snapshot (optional arg: path to a prior statusByModule JSON).
 *
 * HONEST: this grounds EXISTENCE + CONNECTION/CALL only. FUNCTION/MEASURE/PROOF are NOT graph-derivable (need test/run
 * evidence) and are NOT claimed here — a partial (connectivity) audit is never presented as full-ODG coverage. READ-ONLY.
 *
 * Usage: npx tsx runtime/bin/odg-system-coverage-run.ts [prevSnapshot.json]
 */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");
const CIG = require(path.join(ROOT, "runtime", "core", "change-impact-graph.js"));
const COV = require(path.join(ROOT, "runtime", "core", "odg-system-coverage.js"));

// (1) the real core require-graph.
const graph = CIG.buildGraph(ROOT);
const coreConsumers: Record<string, string[]> = graph.consumers || {};
const moduleSet = new Set<string>(graph.modules);

// (2) scan the real CONSUMER surfaces outside core — runtime/bin (entry-points), the Next app (src/) and scripts/ — for an
// IMPORT reference (path-form or path.join .js segment, NOT a bare data-string mention) to each core module basename. A
// module imported by a bin/app/script is a REAL (non-test) consumer, so it is NOT an orphan. This widens CONNECTION beyond
// the core-only graph ⇒ fewer false orphans, without the inverse error of counting textual mentions as calls.
const merged: Record<string, string[]> = {};
for (const m of graph.modules) merged[m] = (coreConsumers[m] || []).slice();
// Match a real IMPORT reference only, not a bare data-string mention. A cross-dir import of a core module always appears
// EITHER path-form (`/<name>` or `/<name>.js`, e.g. require("../core/<name>.js")) OR as a path.join segment (`"<name>.js"`
// with the extension). A bare quoted id (`"<name>"` — no leading `/`, no `.js`: a registry key / priority list / log string)
// is NOT a consumer and is correctly dropped (independent-inspection fix: avoids inflating CONNECTED / hiding real orphans).
const moduleRe = new Map<string, RegExp>();
for (const m of graph.modules) { const e = m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); moduleRe.set(m, new RegExp('(?:/' + e + '(?:\\.js)?|["\']' + e + '\\.js)["\']')); }
function walk(dir: string, tag: string, depth: number): void {
  let entries: any[]; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || depth > 6) continue; walk(full, tag, depth + 1); continue; }
    if (!/\.(ts|tsx|js|jsx)$/.test(e.name) || /\.test\.(ts|js)$/.test(e.name)) continue;
    let src: string; try { src = fs.readFileSync(full, "utf8"); } catch { continue; }
    const consumerName = tag + ":" + e.name.replace(/\.(tsx?|jsx?)$/, "");
    for (const m of graph.modules) { if (moduleRe.get(m)!.test(src)) merged[m].push(consumerName); }
  }
}
walk(path.join(ROOT, "runtime", "bin"), "bin", 0);
walk(path.join(ROOT, "src"), "app", 0);
walk(path.join(ROOT, "scripts"), "script", 0);
for (const m of Object.keys(merged)) merged[m] = Array.from(new Set(merged[m])).sort();

// (3) optional prior snapshot for REGRESSION detection.
let previous: Record<string, string> = {};
const prevArg = process.argv[2];
if (prevArg && fs.existsSync(prevArg)) { try { previous = JSON.parse(fs.readFileSync(prevArg, "utf8")); } catch { previous = {}; } }

const cov = COV.buildCoverage({
  modules: graph.modules,
  consumersOf: (m: string) => merged[m] || [],
  previous,
  asOf: new Date().toISOString().slice(0, 10),
});

// Classify the NO_CONSUMER set: a bin-named entry is an ENTRY-POINT, not an orphan. (Here all nodes are core, so NO_CONSUMER
// modules are genuine candidate orphans — but we still state the caveat honestly.)
process.stdout.write(JSON.stringify({
  matrix: "V360 §2 — grounded system coverage (require-graph core + bin scan)", asOf: cov.asOf,
  counts: cov.counts,
  domains: cov.domains,
  orphanCandidates: cov.orphanCandidates,
  regressions: cov.regressions,
  newlyConnected: cov.newlyConnected,
  scope: cov.scope,
}, null, 2) + "\n");
process.stdout.write(`\nCOVERAGE: ${cov.counts.connected}/${cov.counts.modules} core modules CONNECTED; ${cov.counts.noConsumer} NO_CONSUMER (candidate orphans — verify each is not an intended entry-point). ` +
  `${cov.regressions.length} REGRESSION(s). CONNECTION/CALL are GROUNDED in the real consumer-graph; FUNCTION/MEASURE/PROOF are NOT graph-derivable and are NOT claimed here (no partial audit presented as full-ODG coverage).\n`);
// Emit the snapshot so a later run can detect regression against it (write to scratchpad only if a path is given as argv[3]).
if (process.argv[3]) { try { fs.writeFileSync(process.argv[3], JSON.stringify(cov.statusByModule, null, 2)); process.stdout.write(`snapshot written: ${process.argv[3]}\n`); } catch (e: any) { process.stdout.write(`snapshot write skipped: ${e && e.message}\n`); } }
process.exit(0);
export {};
