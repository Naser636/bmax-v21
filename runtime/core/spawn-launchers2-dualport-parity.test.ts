#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * SPAWN-LAUNCHER (heavy entrypoint) DUAL-PORT PARITY (CTO wave 1) — odg-autonomy, odg-converge.
 * These thin launchers spawn `tsx src/runtime/<entry>.ts` (autonomy loop / convergence — HEAVY, mutating,
 * no dry mode), so running the real entrypoint for parity would be slow + mutate state and must NOT live
 * in the global suite. Instead this is CHEAP + HERMETIC: each launcher runs in a TEMP cwd containing a
 * FAKE `node_modules/.bin/tsx` that echoes its argv and exits a fixed code. Since root = process.cwd(),
 * both the JS rollback and the compiled-TS port resolve root → the temp cwd, spawn <temp>/node_modules/
 * .bin/tsx <temp>/src/runtime/<entry>.ts, and forward the fake's exit. We assert both ports produce the
 * IDENTICAL resolved spawn command (proving root + tsx + entry resolution from any port depth) and the
 * SAME forwarded exit code — without executing the real heavy entrypoint.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const JS = (b) => path.join(REPO, "runtime", "bin", b + ".js");
const TS = (b) => path.join(REPO, "runtime", "dist", "bin", b + ".js");

// A temp "repo" with a fake tsx that echoes its argv (the resolved entry + forwarded args) and exits 7.
function mkFakeRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "launcher-par-"));
  const bin = path.join(root, "node_modules", ".bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(path.join(root, "src", "runtime"), { recursive: true });
  const fake = path.join(bin, "tsx");
  fs.writeFileSync(fake, '#!/bin/sh\nprintf "TSXARGS:"\nfor a in "$@"; do printf " %s" "$a"; done\nprintf "\\n"\nexit 7\n');
  fs.chmodSync(fake, 0o755);
  return root;
}
// Run a launcher port with cwd = the fake repo; relativize absolute temp paths so js vs ts are comparable.
function runPort(script, root, args) {
  const r = cp.spawnSync(process.execPath, [script, ...(args || [])], { cwd: root, encoding: "utf8", timeout: 30000 });
  const rel = (r.stdout || "").split(root).join("<ROOT>");
  return { code: r.status, out: rel };
}

for (const b of ["odg-autonomy", "odg-converge"]) {
  ok(`${b}: both ports present`, fs.existsSync(JS(b)) && fs.existsSync(TS(b)));
  const rootJ = mkFakeRepo(), rootT = mkFakeRepo();
  const args = b === "odg-autonomy" ? [] : [];
  const rj = runPort(JS(b), rootJ, args);
  const rt = runPort(TS(b), rootT, args);
  fs.rmSync(rootJ, { recursive: true, force: true }); fs.rmSync(rootT, { recursive: true, force: true });
  ok(`${b}: forwarded the fake tsx exit code (7) identically`, rj.code === 7 && rt.code === 7);
  ok(`${b}: dist(TS) resolved the SAME spawn command as js (root+tsx+entry from any depth)`, rj.out === rt.out && /TSXARGS:/.test(rj.out));
  ok(`${b}: resolved entry is src/runtime/*-cli.ts under the repo root`, /<ROOT>\/src\/runtime\/\S+\.ts/.test(rj.out));
}

console.log(`\nspawn-launcher (heavy) dual-port parity — ${passed} assertions passed.`);
