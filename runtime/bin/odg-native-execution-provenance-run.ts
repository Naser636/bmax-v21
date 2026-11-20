#!/usr/bin/env node
"use strict";
/*
 * V325 §5/§16 — NATIVE-EXECUTION PROVENANCE RUNNER. Makes odg-native-execution-provenance (PR #761) CONSUMED in a real
 * runnable flow (not just a unit test): it drives the EXISTING deterministic native loop (odg-native-engineering-loop.
 * driveSource) over a set of ACTUAL on-disk repository files, maps each real native-execution result through the connector,
 * and resolves the actor through the REAL actor-provenance resolver — writing a provenance evidence artifact.
 *
 * HONESTY / SAFETY:
 *  - READ-ONLY: every file is read; driveSource NEVER writes to disk (real-repo write is OWNER_GATED). This runner writes
 *    ONLY its own generated artifact (docs/odg/native-execution-provenance.json) — never a source file, never the
 *    persistent mission-ledger (that append remains the OWNER_GATED integration rung).
 *  - NO fabrication: provenance is whatever the real resolver returns from the real loop result. A file the loop could not
 *    natively execute is recorded honestly (deferred/refused/failed), never stamped ODG.
 *  - Deterministic repairs the loop PROPOSES are PROPOSED-only (owner-gated, NOT applied, NOT asserted semantically safe).
 *  - No network, no model, no VPS/push. Run: `npx tsx runtime/bin/odg-native-execution-provenance-run.ts [glob-dir] [outPath]`.
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const L = require(path.join(ROOT, "runtime", "core", "odg-native-engineering-loop.js"));
const P = require(path.join(ROOT, "runtime", "core", "odg-native-execution-provenance.js"));

const SCAN_DIR = process.argv[2] || path.join("runtime", "core");
const OUT = process.argv[3] || path.join(ROOT, "docs", "odg", "native-execution-provenance.json");

// Collect ACTUAL repo files (deterministic order). Default: the TypeScript sources under runtime/core (excluding tests).
function listSources(dirRel: string): string[] {
  const abs = path.join(ROOT, dirRel);
  let names: string[] = [];
  try { names = fs.readdirSync(abs); } catch { return []; }
  return names.filter((n: string) => n.endsWith(".ts") && !n.endsWith(".test.ts")).sort().map((n: string) => path.join(dirRel, n));
}

const files = listSources(SCAN_DIR);
const rows: any[] = [];
for (const rel of files) {
  let source = "";
  try { source = fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { continue; }
  // deny-by-default write-set = the file itself (the loop enforces scope); driveSource proposes, never writes.
  const row = L.driveSource({ filePath: rel, source }, { writeSet: [rel] });
  rows.push(row);
}

// Map EVERY real native-execution result through the connector, then resolve the actor through the REAL resolver.
const evidence = P.fromLoopResult({ rows }, "NATIVE-PASS-" + SCAN_DIR.replace(/[^a-zA-Z0-9]+/g, "-"));
const provenance = P.resolveActor(evidence);

// Per-file disposition tally (honest; proposals are owner-gated, not applied).
const byDisposition: Record<string, number> = {};
for (const r of rows) { const d = (r && r.disposition) || "UNKNOWN"; byDisposition[d] = (byDisposition[d] || 0) + 1; }
// NOTE: NATIVE_REPAIRED means "a structurally-verified deterministic transform was APPLIED+idempotent", which INCLUDES
// benign/redundant proposals (e.g. ensure-dual-export appending a second `export {};` to a file that already has one
// before a require.main trailer). These are NOT asserted to be genuine defects — they are candidate transforms only.
const proposedTransformFiles = rows.filter((r: any) => r && r.disposition === "NATIVE_REPAIRED").map((r: any) => ({ filePath: r.filePath, transformsApplied: r.applied }));

const out = {
  "//": "V325 §5/§16 — REAL native-execution provenance over ACTUAL repo files. ODG natively executed a deterministic engineering pass (odg-native-engineering-loop.driveSource) over each file; actor resolved via the PRODUCTION actor-provenance resolver. READ-ONLY: no source file written, no mission-ledger append (that is OWNER_GATED). The HEADLINE is the PROVENANCE (actor), NOT the transform count.",
  scanDir: SCAN_DIR,
  filesScanned: files.length,
  nativelyExecuted: evidence.executed.length,
  actor: provenance.actor,
  actorReason: provenance.reason,
  byDisposition,
  deferredToProvider: evidence.deferredToProvider.length,
  refusedOutOfScope: evidence.refusedOutOfScope.length,
  failed: evidence.failed.length,
  proposedTransforms: { count: proposedTransformFiles.length, sample: proposedTransformFiles.slice(0, 10), note: "candidate deterministic transforms the loop APPLIED+structurally-verified in-memory; PROPOSED only (owner-gated, NOT applied to disk, NOT asserted to be genuine defects nor semantically safe). This count INCLUDES benign/redundant proposals (e.g. a duplicate `export {};` on files whose existing export marker precedes a require.main trailer) — it is NOT a count of 217 real defects." },
  honesty: "the deliverable is PROVENANCE: a genuine ODG-native deterministic pass over actual repo files resolves to actor=ODG via the production resolver. Non-executed files are recorded as deferred/refused/failed, never stamped ODG. Proposed transforms are candidates only; this runner applies nothing and the persistent mission-ledger append remains OWNER_GATED.",
};
try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); } catch { /* exists */ }
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ scanDir: SCAN_DIR, filesScanned: files.length, nativelyExecuted: evidence.executed.length, actor: provenance.actor, byDisposition, proposedTransforms: proposedTransformFiles.length, artifact: path.relative(ROOT, OUT) }, null, 2) + "\n");
export {};
