#!/usr/bin/env node
"use strict";
/*
 * runtime/dist CLOSURE COMPLETION (η3-B101, P1 build-closure root fix).
 *
 * PROBLEM: `tsc -p tsconfig.runtime-dist.json` emits ONLY the TypeScript files
 * (the 9 stages + compiled entry + orchestration helpers) into runtime/dist.
 * The compiled stages keep relative `require("./sibling")` to JS-only runtime
 * modules (e.g. budget-contract, governance-kernel, state-transition, fleet-*)
 * that tsc never copies — so a real mission run with
 * `ODG_STAGE_BASE=runtime/dist/core node runtime/dist/bin/odg-run.js <m>` fails
 * with MODULE_NOT_FOUND. The runtime-relocation BENCH passed only because it
 * manually assembled the closure in its sandbox; the BUILD never produced one.
 *
 * FIX (this script, run AFTER tsc by `npm run build:runtime`): compute the
 * transitive relative-require closure of the ACTUAL emitted dist files and copy
 * every JS-only dependency from the source tree into runtime/dist at the SAME
 * relative path, so dist/core is self-contained and relocatable. Presence is
 * checked against DIST (not the source tree), so JS->JS->JS chains are followed
 * and copied too. The build FAILS LOUDLY (exit 1) on: an unresolved relative
 * dependency, an unexpected dynamic require, or a copy collision. Node builtins
 * and (none expected) external packages are left to normal resolution. NEVER a
 * silent fallback to the legacy runtime.
 *
 * SCOPE: this closes the STAGE closure under runtime/dist/core. The compiled
 * ENTRY (dist/bin/odg-run.js) additionally loads 3 un-ported support modules
 * (governance-kernel, odg-bootstrap, runtime-context-loader) via an EXPLICIT
 * `legacyRequire(path.resolve(process.cwd(), "runtime/core/<m>.js"))` — a
 * CWD-relative read of the SOURCE tree, intentional and documented (not a
 * silent fallback). Those are resolved from runtime/core at run time; FULL
 * entry relocation without runtime/core present is out of P1 scope.
 *
 * Idempotent: re-running copies nothing new. For strict reproducibility use a
 * clean build (`rm -rf runtime/dist && npm run build:runtime`).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = process.cwd();
const DIST = path.join(REPO, "runtime", "dist");
const ENTRY = path.join(DIST, "bin", "odg-run.js");
const builtins = new Set(require("module").builtinModules);

if (!fs.existsSync(path.join(DIST, "core")) || !fs.existsSync(ENTRY)) {
  console.error("build-dist-closure: runtime/dist not built (run tsc -p tsconfig.runtime-dist.json first).");
  process.exit(1);
}

// Map a dist directory to its source-tree mirror and back.
function distToSrcDir(distDir) {
  return distDir
    .replace(path.join(DIST, "core"), path.join(REPO, "runtime", "core"))
    .replace(path.join(DIST, "bin"), path.join(REPO, "runtime", "bin"));
}
function srcFileToDist(srcFile) {
  return srcFile
    .replace(path.join(REPO, "runtime", "core"), path.join(DIST, "core"))
    .replace(path.join(REPO, "runtime", "bin"), path.join(DIST, "bin"));
}
function resolveInDir(dir, t) {
  for (const c of [t, t + ".js", t + ".json", path.join(t, "index.js")]) {
    const p = path.resolve(dir, c);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
function parseRequires(file) {
  const src = stripComments(fs.readFileSync(file, "utf8"));
  const literal = [];
  let m;
  const re = /require\(\s*("([^"]*)"|'([^']*)')\s*\)/g;
  while ((m = re.exec(src))) literal.push(m[2] !== undefined ? m[2] : m[3]);
  const dyn = /require\(\s*[^"')\s]/.test(src);
  return { literal, dyn };
}
function sha256(f) {
  return crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 16);
}

const emitted = fs
  .readdirSync(path.join(DIST, "core"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => path.join(DIST, "core", f));
const seeds = [...emitted, ENTRY];

const visited = new Set();
const copied = []; // {rel, srcRel, sha}
const errors = [];
const stack = [...seeds];

while (stack.length) {
  const f = stack.pop();
  if (visited.has(f)) continue;
  visited.add(f);
  if (!fs.existsSync(f)) { errors.push(`missing file in worklist: ${path.relative(REPO, f)}`); continue; }
  const { literal, dyn } = parseRequires(f);
  if (dyn && f !== ENTRY) {
    errors.push(`unexpected dynamic require() in ${path.relative(DIST, f)} (only the entry's explicit legacyRequire is allowed)`);
  }
  for (const t of literal) {
    if (!(t.startsWith("./") || t.startsWith("../"))) {
      const bare = t.replace(/^node:/, "");
      if (!builtins.has(bare)) errors.push(`unexpected external package require("${t}") in ${path.relative(DIST, f)}`);
      continue;
    }
    // Already present in dist?
    const inDist = resolveInDir(path.dirname(f), t);
    if (inDist) { if (!visited.has(inDist)) stack.push(inDist); continue; }
    // Not in dist -> find in source mirror and copy into dist.
    const srcDir = distToSrcDir(path.dirname(f));
    const srcFile = resolveInDir(srcDir, t);
    if (!srcFile) { errors.push(`UNRESOLVED relative dependency "${t}" required by ${path.relative(DIST, f)} (not in dist, not in source ${path.relative(REPO, srcDir)})`); continue; }
    const dest = srcFileToDist(srcFile);
    if (fs.existsSync(dest)) {
      if (sha256(dest) !== sha256(srcFile)) errors.push(`COLLISION: ${path.relative(DIST, dest)} exists with different content than source ${path.relative(REPO, srcFile)}`);
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(srcFile, dest);
      copied.push({ rel: path.relative(DIST, dest), srcRel: path.relative(REPO, srcFile), sha: sha256(dest) });
    }
    if (!visited.has(dest)) stack.push(dest);
  }
}

if (errors.length) {
  console.error("build-dist-closure: FAILED — closure is not complete:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

copied.sort((a, b) => a.rel.localeCompare(b.rel));

// PROVENANCE + FRESHNESS (η3-B105). Record, for every closure input, the SOURCE file it was built
// from and that source's content sha, so a validator can detect a STALE dist (source changed after
// the build) — not just a structurally-broken one. Emitted dist files map to their .ts source; copied
// JS files carry their source path + sha already. Deterministic (NO timestamps) so a clean rebuild
// from the same sources yields a byte-identical manifest (reproducibility invariant, B103). git fields
// are best-effort provenance only (absent in a .git-less archive) and are NEVER used for freshness.
function srcTsForEmitted(distFile) {
  const srcDir = distToSrcDir(path.dirname(distFile));
  const ts = path.join(srcDir, path.basename(distFile).replace(/\.js$/, ".ts"));
  return fs.existsSync(ts) ? ts : null;
}
const inputs = [];
for (const f of [...emitted, ENTRY]) {
  const ts = srcTsForEmitted(f);
  if (ts) inputs.push({ distRel: path.relative(DIST, f), srcRel: path.relative(REPO, ts), srcSha: sha256(ts), kind: "emitted" });
}
for (const c of copied) inputs.push({ distRel: c.rel, srcRel: c.srcRel, srcSha: c.sha, kind: "copied" });
inputs.sort((a, b) => a.distRel.localeCompare(b.distRel));
let sourceCommit = "unknown";
let sourceClean = null;
try {
  const { execFileSync } = require("child_process");
  sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  sourceClean = execFileSync("git", ["status", "--porcelain"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().length === 0;
} catch (e) { /* no git (e.g. git-archive sandbox): provenance stays "unknown"; freshness unaffected */ }

const manifest = {
  generator: "scripts/build-dist-closure.js",
  emittedCount: emitted.length,
  copiedCount: copied.length,
  totalClosure: emitted.length + copied.length,
  copied,
  provenance: { schema: 1, sourceCommit, sourceClean, inputCount: inputs.length, inputs },
};
fs.writeFileSync(path.join(DIST, "dist-closure-manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`build-dist-closure: OK — emitted=${emitted.length} copied=${copied.length} total-closure=${manifest.totalClosure}`);
console.log(`build-dist-closure: manifest -> runtime/dist/dist-closure-manifest.json`);
