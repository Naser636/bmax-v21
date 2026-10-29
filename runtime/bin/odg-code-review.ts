#!/usr/bin/env node
/**
 * odg-code-review — the REAL entry point that productizes code-review-service: point it at a project directory and it
 * reads the supported source files, runs the REAL analyzers (code-execution), and prints the engineering review as
 * JSON (default) or SARIF 2.1.0 (--sarif). This is the "wired, shippable deliverable" the capability inventory found
 * missing — the service was tested with injected runners but had no CLI/API. Read-only: it never writes to the target.
 *
 * Usage:  npx tsx runtime/bin/odg-code-review.ts <projectDir> [--sarif] [--max N]
 * Exit code: 0 if the review ran (even WITH findings — a review that finds defects is a successful review); non-zero
 * only on a real error (bad args / unreadable dir). Scanning skips node_modules/.git/dist and binary-ish files.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const REVIEW = require("./../core/code-review-service.js");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", "coverage", "runtime/dist"]);
const MAX_BYTES = 512 * 1024;   // skip files larger than 512KB (not source review targets)

/** collectFiles(dir, exts, max): read supported source files (bounded, skipping vendored/build dirs). */
function collectFiles(dir: string, max: number): any[] {
  const out: any[] = [];
  const exts = Object.keys(REVIEW.EXT_LANG);
  const walk = (d: string) => {
    if (out.length >= max) return;
    let entries: any[] = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= max) return;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); continue; }
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (!exts.includes(ext)) continue;
      try { const st = fs.statSync(full); if (st.size > MAX_BYTES) continue; out.push({ path: path.relative(dir, full), content: fs.readFileSync(full, "utf8") }); } catch { /* unreadable → skip */ }
    }
  };
  walk(dir);
  return out;
}

function run(argv: string[]): any {
  const args = argv.filter((a) => !a.startsWith("-"));
  const dir = args[0];
  const asSarif = argv.includes("--sarif");
  const maxIdx = argv.indexOf("--max");
  const max = maxIdx >= 0 && argv[maxIdx + 1] ? Math.max(1, Math.min(500, parseInt(argv[maxIdx + 1], 10) || 500)) : 500;
  if (!dir) return { ok: false, code: "USAGE", reason: "usage: odg-code-review <projectDir> [--sarif] [--max N]" };
  let stat: any;
  try { stat = fs.statSync(dir); } catch { return { ok: false, code: "NO_DIR", reason: `cannot stat '${dir}'` }; }
  if (!stat.isDirectory()) return { ok: false, code: "NO_DIR", reason: `'${dir}' is not a directory` };

  const files = collectFiles(dir, max);
  if (files.length === 0) return { ok: false, code: "NO_SOURCES", reason: "no supported source files found under the directory" };
  const result = REVIEW.reviewProject({ project: path.basename(path.resolve(dir)), files });
  if (!result.ok) return result;
  if (asSarif) { const s = REVIEW.reviewToSarif(result); return { ok: true, mode: "sarif", sarif: s.sarif, resultCount: s.resultCount, truncated: s.truncated }; }
  return { ok: true, mode: "review", review: result.review };
}

export { collectFiles, run };
module.exports = { collectFiles, run };

if (require.main === module) {
  let out: any;
  try { out = run(process.argv.slice(2)); }
  catch (e: any) { process.stderr.write(`odg-code-review error: ${(e && e.message) || e}\n`); process.exit(1); }
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  process.exit(out && out.ok ? 0 : 2);   // a review WITH findings is ok:true → exit 0; only usage/IO errors exit non-zero
}
