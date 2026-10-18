#!/usr/bin/env node
"use strict";
/* TS source (tsx-run) of scripts/build-runtime-guard; scripts/build-runtime-guard.js = ODG_RUNTIME=js rollback. */
/*
 * build:runtime GUARD (V71 latency) — a correctness-first content-fingerprint short-circuit in front of the
 * full dist build chain (rm -rf runtime/dist && tsc -p tsconfig.runtime-dist.json && build-dist-closure.js).
 *
 * WHY: every equivalence/regression bench invokes `npm run build:runtime` internally, so a single migrate-ts
 * gate (1 equivalence + 5 regression benches) rebuilt the ENTIRE dist from scratch ~6× from IDENTICAL sources
 * (~6s each → ~30s provably-redundant rebuild per gate). MEASURED, not assumed.
 *
 * CONTRACT (never reuse stale, auto-invalidate on any relevant change):
 *   - The fingerprint hashes the COMPLETE set of inputs that determine dist output: tsconfig.runtime-dist.json,
 *     scripts/build-dist-closure.js, and every .ts/.js under runtime/core + runtime/bin. (build-dist-closure
 *     REJECTS any out-of-tree require, so the emitted dist is self-contained within runtime/ — no src/ input.)
 *     The set is intentionally OVER-inclusive (hashes .js that may not be compiled) — that only ever forces an
 *     unnecessary rebuild, NEVER a stale reuse.
 *   - SKIP the build ONLY when: dist/core exists AND the closure manifest exists AND the stored fingerprint
 *     equals the freshly-computed one. Any mismatch / missing artifact ⇒ full clean rebuild.
 *   - The fingerprint file is written ONLY after a fully-successful rebuild (clean → tsc → closure). A failed
 *     build leaves no stale fingerprint, so the next run rebuilds.
 *
 * Output byte-identity is unchanged vs the unguarded chain (same inputs ⇒ same tsc+closure output), so every
 * parity/equivalence proof that runs on top of the dist is unaffected. This masks NO failure: a real build
 * error still exits non-zero; a changed input still triggers the full rebuild.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..");
const DIST = path.join(REPO, "runtime", "dist");
const FP_FILE = path.join(DIST, ".build-fingerprint");
const MANIFEST = path.join(DIST, "dist-closure-manifest.json");

function sha256(buf: any): string { return crypto.createHash("sha256").update(buf).digest("hex"); }

// Recursively collect .ts/.js files under a dir (skipping dist itself).
function collect(dir: string, out: string[]): void {
  let ents: any;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (p !== DIST) collect(p, out); }
    else if (/\.(ts|js)$/.test(e.name)) out.push(p);
  }
}

function computeFingerprint(): string {
  const inputs = [
    path.join(REPO, "tsconfig.runtime-dist.json"),
    path.join(REPO, "scripts", "build-dist-closure.js"),
  ];
  collect(path.join(REPO, "runtime", "core"), inputs);
  collect(path.join(REPO, "runtime", "bin"), inputs);
  const h = crypto.createHash("sha256");
  for (const f of inputs.map((p: string) => path.relative(REPO, p)).sort()) {
    const abs = path.join(REPO, f);
    let content: any;
    try { content = fs.readFileSync(abs); } catch { content = Buffer.from("<absent>"); }
    h.update(f);
    h.update("\0");
    h.update(sha256(content));
    h.update("\0");
  }
  return h.digest("hex");
}

function distIsComplete(): boolean {
  return fs.existsSync(path.join(DIST, "core")) && fs.existsSync(MANIFEST);
}

function run(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { cwd: REPO, stdio: "inherit" });
  return r.status === 0;
}

function fullBuild(fp: string): void {
  fs.rmSync(DIST, { recursive: true, force: true });
  const tsc = path.join(REPO, "node_modules", ".bin", "tsc");
  if (!run(tsc, ["-p", "tsconfig.runtime-dist.json"])) process.exit(1);
  if (!run(process.execPath, [path.join(REPO, "scripts", "build-dist-closure.js")])) process.exit(1);
  // Write the fingerprint ONLY after a fully-successful clean build + closure.
  try { fs.writeFileSync(FP_FILE, fp + "\n"); } catch { /* non-fatal: next run just rebuilds */ }
}

function main(): void {
  const fp = computeFingerprint();
  if (distIsComplete()) {
    let stored: string | null = null;
    try { stored = fs.readFileSync(FP_FILE, "utf8").trim(); } catch { stored = null; }
    if (stored === fp) {
      console.log("build:runtime SKIP — dist is fresh (fingerprint match, inputs unchanged)");
      return;
    }
  }
  fullBuild(fp);
}

main();

export {};
