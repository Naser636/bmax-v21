#!/usr/bin/env tsx
/*
 * JS INVENTORY + ABSENCE-CHECK (CTO Priority 1 — JavaScript elimination).
 *
 * The automated, reproducible "contrôle d'absence" the mandate requires: it CANNOT be claimed that
 * project-owned JavaScript is eliminated until this reports a live-JS count of 0. Read-only; walks the
 * repo, classifies every project-owned .js file, prints a chiffré breakdown + migration lots, and exits
 * non-zero while any LIVE project JS remains (so it can gate a "migration complete" assertion).
 *
 * Classification (project-owned only — external deps + build artifacts + transient worktrees excluded):
 *   - dual-rollback : a .js whose .ts sibling exists (already migrated; the JS is the ODG_RUNTIME=js
 *                     rollback port — removal candidate ONLY after TS-sole execution is proven).
 *   - js-only-live  : a .js with no .ts sibling under a LIVE runtime path (genuine migration target).
 *   - js-only-dead  : a .js under archive/backup/poc (historical; confirm-dead then remove, not migrate).
 *   - test-js       : a *.test.js (migrate alongside its subject).
 *   - scripts / poc : tooling / proof-of-concept.
 *
 * Excluded (NOT project-owned business code): node_modules, .git, .next, runtime/dist (build output),
 * runtime/generated (host state), .claude/worktrees (transient agent worktrees).
 */
import * as fs from "fs";
import * as path from "path";

const EXCLUDE_DIR = /(^|\/)(node_modules|\.git|\.next)(\/|$)/;
const EXCLUDE_PATH = [/runtime\/dist(\/|$)/, /runtime\/generated(\/|$)/, /\.claude\/worktrees(\/|$)/];
const DEAD_PREFIX = [/^runtime\/archive\//, /^runtime\/backup\//, /^poc\//];

function walk(dir: string, acc: string[]): void {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of ents) {
    const p = path.join(dir, d.name);
    const rel = p.replace(/^\.\//, "");
    if (EXCLUDE_DIR.test("/" + rel) || EXCLUDE_PATH.some((re) => re.test(rel))) continue;
    if (d.isDirectory()) walk(p, acc);
    else if (d.name.endsWith(".js")) acc.push(rel);
  }
}

function classify(rel: string): string {
  const isTest = /\.test\.js$/.test(rel);
  const tsSibling = fs.existsSync(rel.replace(/\.js$/, ".ts"));
  if (rel.startsWith("scripts/")) return "scripts";
  if (rel.startsWith("poc/")) return "poc";
  if (isTest) return "test-js";
  if (tsSibling) return "dual-rollback";
  if (DEAD_PREFIX.some((re) => re.test(rel))) return "js-only-dead";
  if (rel.startsWith("runtime/")) return "js-only-live";
  return "other";
}

const all: string[] = [];
walk(".", all);
const buckets: Record<string, string[]> = {};
for (const f of all) {
  const c = classify(f);
  (buckets[c] ||= []).push(f);
}
const counts = Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length]));
const total = all.length;
// "LIVE project JS" that must reach 0 for elimination: everything except already-dead historical files.
// (dual-rollback counts as live: its removal is part of elimination; dead files are removed, not migrated.)
const liveJs = total - (counts["js-only-dead"] || 0);

const report = {
  schema: "js-inventory/1",
  totalProjectJs: total,
  counts,
  liveProjectJs: liveJs,
  eliminated: liveJs === 0,
  lots: {
    "L1-runtime-llm": (buckets["js-only-live"] || []).filter((f) => f.startsWith("runtime/llm/")).length,
    "L2-runtime-core": (buckets["js-only-live"] || []).filter((f) => f.startsWith("runtime/core/")).length,
    "L3-runtime-bin": (buckets["js-only-live"] || []).filter((f) => f.startsWith("runtime/bin/")).length,
    "L4-runtime-local-recovery+scripts+templates": (buckets["js-only-live"] || []).filter((f) => /^runtime\/(local-recovery|scripts|templates)\//.test(f)).length,
    "L5-tests": counts["test-js"] || 0,
    "L6-build-scripts": counts["scripts"] || 0,
    "L7-remove-dual-rollback-after-TS-sole-proof": counts["dual-rollback"] || 0,
    "L8-confirm-dead-then-remove": (counts["js-only-dead"] || 0) + (counts["poc"] || 0),
  },
};
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
// Gate: non-zero while any live project JS remains, so "migration complete" cannot be falsely asserted.
process.exit(report.eliminated ? 0 : 1);
