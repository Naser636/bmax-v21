// @ts-nocheck
/*
 * LOT η3-B61 — PROJECT-CONTEXT-ENGINE EQUIVALENCE: the historical runtime/core/project-context-engine.js
 * vs the compiled runtime/dist/core/project-context-engine.js (TypeScript port) must produce a BYTE-IDENTICAL
 * runtime/generated/runtime-context.json once the two intrinsically-volatile fields are normalised. Offline.
 * =====================================================================================================
 *
 * WHY: η3-B60 selected project-context-engine as the first JS-only stage to migrate (108L, zero sibling
 * require(), not in the A2-modified set, conditional/non-blocking → lowest blast radius) but it has NO
 * dedicated unit test — so the PARITY BENCH *is* the coverage. This harness proves the TS port is a faithful
 * behavioural equivalent of the legacy module before any .js retirement is ever contemplated.
 *
 * MECHANISM (verified against the real source, not names): the engine recursively scans process.cwd(),
 * skipping the IGNORED set {.git,node_modules,dist,build,.next,coverage}, counting files/directories and
 * tallying an error for any readdir failure or any resolved path escaping ROOT, then writes
 * runtime/generated/runtime-context.json = {version,generatedAt,mission,project:{root,files,directories,
 * errors}}. The two implementations are run in TWO sandboxes seeded with an IDENTICAL fixed fixture tree, so
 * the counts MUST match exactly; the non-trivial fixture (nested dirs + an IGNORED node_modules/ and dist/)
 * proves the ignore+recursion logic ported correctly (counts would drift if it had not).
 *
 * VOLATILE FIELDS (normalised, explicitly justified — NOT behavioural differences):
 *  - `generatedAt`  : wall-clock ISO timestamp (new Date().toISOString()); differs between any two runs.
 *  - `project.root` : process.cwd() absolute path; each sandbox lives at a distinct os.tmpdir() path.
 * Both are environment/clock artifacts, not computed behaviour; everything else (version, mission, and the
 * three counts) must be byte-identical. The bench asserts each count against a hand-derived expected value
 * so "both happen to be equally wrong" cannot pass silently.
 *
 * ISOLATION: throwaway os.tmpdir() sandboxes OUTSIDE the repo (asserted); the engine uses only Node built-ins
 * so NO node_modules is needed to RUN it (offline); the repo is read-only. The historical .js is never
 * modified — it is copied into sandbox A verbatim and remains the production default (ODG_STAGE_BASE unset).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/project-context-engine-equivalence.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_SRC = path.join(REPO, "runtime", "core", "project-context-engine.js");
const DIST_SRC = path.join(REPO, "runtime", "dist", "core", "project-context-engine.js");

const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/* Deterministic fixture tree seeded IDENTICALLY into both sandboxes. Hand-derived expected counts:
 *   files       = eng.js + src/a.ts + src/b.js + docs/c.md + lib/sub/d.js                    = 5
 *   directories = src + docs + lib + runtime + lib/sub + runtime/generated                   = 6
 *   errors      = 0
 * node_modules/junk.js and dist/out.js are IGNORED (excluded) — if the ignore logic broke, files would rise.
 * runtime/generated/ is empty at scan time (runtime-context.json is written AFTER the scan), so it adds a
 * directory but no file. */
const EXPECTED_FILES = 5;
const EXPECTED_DIRS = 6;
function seed(sb: string, engineSrc: string): void {
  const w = (rel: string, body: string) => {
    const p = path.join(sb, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  fs.cpSync(engineSrc, path.join(sb, "eng.js"));
  w("src/a.ts", "export const a = 1;\n");
  w("src/b.js", "module.exports = 2;\n");
  w("docs/c.md", "# c\n");
  w("lib/sub/d.js", "module.exports = 4;\n");
  w("node_modules/junk.js", "module.exports = 'IGNORED';\n"); // must be excluded
  w("dist/out.js", "module.exports = 'IGNORED';\n");           // must be excluded
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
}

function runEngine(sb: string): { status: number | null; out: string } {
  const env = { ...process.env };
  delete env.ODG_VERBOSE; delete env.NODE_PATH;
  const r = spawnSync("node", ["eng.js", "EQUIV_PCE"], { cwd: sb, encoding: "utf8", env });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function readCtx(sb: string): any {
  return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", "runtime-context.json"), "utf8"));
}
/** Replace ONLY the two justified volatile fields with sentinels, leaving all behavioural fields intact. */
function normalise(ctx: any): any {
  const c = JSON.parse(JSON.stringify(ctx));
  c.generatedAt = "<NORMALISED_ISO>";
  if (c.project) c.project.root = "<NORMALISED_CWD>";
  return c;
}

console.log("LOT η3-B61 — PROJECT-CONTEXT-ENGINE EQUIVALENCE (historical .js vs compiled .ts)");
try {
  // Produce the compiled port with the EXISTING command only (tsconfig already lists the new source).
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(JS_SRC), "prerequisite: historical runtime/core/project-context-engine.js present (untouched)");
  check(fs.existsSync(DIST_SRC), "prerequisite: compiled runtime/dist/core/project-context-engine.js emitted by build:runtime");

  const sbJs = fs.mkdtempSync(path.join(os.tmpdir(), "odg-pce-js-"));
  const sbTs = fs.mkdtempSync(path.join(os.tmpdir(), "odg-pce-ts-"));
  sandboxes.push(sbJs, sbTs);
  check(!sbJs.startsWith(REPO) && !sbTs.startsWith(REPO), "both sandboxes live OUTSIDE the repository");
  seed(sbJs, JS_SRC);
  seed(sbTs, DIST_SRC);
  check(!fs.existsSync(path.join(sbJs, "node_modules", "..", "..", "package-lock.json")), "sandboxes need no install (engine uses only Node built-ins, offline)");

  const rJs = runEngine(sbJs);
  const rTs = runEngine(sbTs);
  check(rJs.status === 0, `historical .js exits 0 (got ${rJs.status})`);
  check(rTs.status === 0, `compiled .ts exits 0 (got ${rTs.status})`);
  check(/Status      : READY/.test(rJs.out) && /Status      : READY/.test(rTs.out), "both print the 'Status : READY' banner");

  const ctxJs = readCtx(sbJs);
  const ctxTs = readCtx(sbTs);

  // Counts hand-derived from the fixture — proves the ignore+recursion behaviour, not merely mutual agreement.
  check(ctxJs.project.files === EXPECTED_FILES, `historical files === ${EXPECTED_FILES} (got ${ctxJs.project.files}; node_modules/dist excluded)`);
  check(ctxTs.project.files === EXPECTED_FILES, `compiled files === ${EXPECTED_FILES} (got ${ctxTs.project.files}; node_modules/dist excluded)`);
  check(ctxJs.project.directories === EXPECTED_DIRS, `historical directories === ${EXPECTED_DIRS} (got ${ctxJs.project.directories})`);
  check(ctxTs.project.directories === EXPECTED_DIRS, `compiled directories === ${EXPECTED_DIRS} (got ${ctxTs.project.directories})`);
  check(ctxJs.project.errors === 0 && ctxTs.project.errors === 0, "both report 0 errors (no path escaped ROOT)");

  // Volatile fields behave as expected (justifies the normalisation, not papers over a behavioural diff).
  check(typeof ctxJs.generatedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(ctxJs.generatedAt) && typeof ctxTs.generatedAt === "string", "generatedAt is an ISO timestamp on both (volatile → normalised)");
  check(ctxJs.project.root === sbJs && ctxTs.project.root === sbTs, "project.root === each sandbox cwd (process.cwd() anchor, volatile → normalised)");

  // THE PARITY ASSERTION: byte-identical once the two justified volatiles are normalised.
  const nJs = JSON.stringify(normalise(ctxJs));
  const nTs = JSON.stringify(normalise(ctxTs));
  check(nJs === nTs, `runtime-context.json BYTE-IDENTICAL after normalising generatedAt+root${nJs === nTs ? "" : `\n    JS=${nJs}\n    TS=${nTs}`}`);
  check(ctxJs.version === 1 && ctxTs.version === 1 && ctxJs.mission === "EQUIV_PCE" && ctxTs.mission === "EQUIV_PCE", "version=1 and mission echoed identically on both");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η3-B61 PROJECT-CONTEXT-ENGINE EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
