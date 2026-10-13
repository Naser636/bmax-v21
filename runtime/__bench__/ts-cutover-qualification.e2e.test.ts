// @ts-nocheck
/*
 * η3-B104 — CONSOLIDATED TS CUTOVER QUALIFICATION (entry-point controlled build).
 *
 * Qualifies the ODG packaging doctrine for the opt-in TypeScript runtime: runtime/dist stays
 * generated + git-ignored (never committed, no implicit postinstall); when an operator opts in
 * (ODG_RUNTIME=ts) the entry performs an EXPLICIT, controlled, reproducible build (real tsc + closure,
 * NOT tsx) if dist is absent or structurally invalid, and STOPS loudly with NO silent fallback to JS
 * when it cannot. This bench exercises the helper `runtime/bin/odg-ensure-ts-runtime.sh` directly.
 *
 * Clean-room: an out-of-tree sandbox = `git archive HEAD` + the two B104 working-tree files overlaid
 * (so it qualifies exactly what will be committed) + node_modules symlinked (deps present — install
 * fidelity itself is proven separately by clean-clone-ts-proof.e2e.test.ts via a REAL npm ci). Never
 * touches the dev worktree. Honest exit codes: 0=PASS, 1=FAIL. Sandbox removed on success.
 */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
let failures = 0;
function check(c, label) { if (c) console.log("  PASS " + label); else { failures++; console.log("  FAIL " + label); } }
function run(cmd, cmdArgs, cwd, extraEnv) {
  const env = { ...process.env, ...(extraEnv || {}) };
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}
const helper = (sandbox, env) => run("bash", ["runtime/bin/odg-ensure-ts-runtime.sh"], sandbox, env);
function readManifest(sandbox) {
  const p = path.join(sandbox, "runtime", "dist", "dist-closure-manifest.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

console.log("η3-B104 — CONSOLIDATED TS CUTOVER QUALIFICATION (entry-point controlled build)");

const BASE = process.env.ODG_CLEAN_CLONE_BASE || path.join(os.homedir(), ".cache", "odg-clean-clone");
fs.mkdirSync(BASE, { recursive: true });
const SANDBOX = fs.mkdtempSync(path.join(BASE, "b104-"));
let ok = false;
try {
  // Materialise HEAD + overlay the two B104 working-tree files (the exact to-be-committed state).
  run("bash", ["-c", "git archive HEAD | tar -x -C " + JSON.stringify(SANDBOX)], REPO);
  for (const rel of ["runtime/bin/odg-ensure-ts-runtime.sh", "runtime/bin/odg-local-pipeline.sh"]) {
    fs.copyFileSync(path.join(REPO, rel), path.join(SANDBOX, rel));
  }
  fs.chmodSync(path.join(SANDBOX, "runtime/bin/odg-ensure-ts-runtime.sh"), 0o755);
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(SANDBOX, "node_modules"));
  const DIST = path.join(SANDBOX, "runtime", "dist");

  // Static: the opt-in TS branch delegates to the helper and keeps the build OUT of the scanned script.
  const pipe = fs.readFileSync(path.join(SANDBOX, "runtime/bin/odg-local-pipeline.sh"), "utf8");
  check(/ODG_RUNTIME.*=.*ts/.test(pipe) && pipe.includes("odg-ensure-ts-runtime.sh"), "pipeline TS branch delegates to the entry-build helper");
  check(!pipe.includes("npm run build") && !pipe.includes("tsc --noEmit"), "pipeline script keeps `npm run build`/`tsc --noEmit` out (mse-canonical-verify invariant)");
  check(pipe.includes('[PIPELINE] Runtime engine: JavaScript (default)'), "default JS branch preserved (no cutover)");

  // 1. dist ABSENT ⇒ explicit controlled build, structurally valid.
  fs.rmSync(DIST, { recursive: true, force: true });
  const h1 = helper(SANDBOX, {});
  check(h1.status === 0 && /explicit controlled build OK/.test(h1.stdout), "dist absent ⇒ entry builds it (exit 0)");
  const m1 = readManifest(SANDBOX);
  check(m1 && m1.totalClosure === m1.emittedCount + m1.copiedCount && m1.copiedCount > 0, `built manifest consistent (emitted=${m1 && m1.emittedCount} copied=${m1 && m1.copiedCount})`);
  check(fs.existsSync(path.join(DIST, "core", "budget-contract.js")), "entry-built dist contains the formerly-missing budget-contract.js");

  // 2. the entry-built dist actually RUNS a real mission on the true compiled entrypoint.
  const r2 = run("node", ["runtime/dist/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SANDBOX, { ODG_STAGE_BASE: "runtime/dist/core" });
  check(r2.status === 0 && /PIPELINE SUCCESS/.test(r2.stdout + r2.stderr), "entry-built compiled runtime runs QUAL_CLEAN_GATEB (PIPELINE SUCCESS)");
  const rep = path.join(SANDBOX, "runtime", "generated", "mission-report.json");
  const repJson = fs.existsSync(rep) ? JSON.parse(fs.readFileSync(rep, "utf8")) : {};
  check(repJson.status === "SUCCESS" && repJson.validated === true, "entry-built mission-report: status=SUCCESS validated=true");

  // 3. idempotent reuse: a valid dist is NOT rebuilt.
  const h3 = helper(SANDBOX, {});
  check(h3.status === 0 && /structurally valid — reusing/.test(h3.stdout), "valid dist ⇒ reused, not rebuilt (idempotent)");

  // 4. structurally invalid manifest (total != emitted+copied) ⇒ rebuild.
  const manPath = path.join(DIST, "dist-closure-manifest.json");
  fs.writeFileSync(manPath, JSON.stringify({ generator: "tamper", emittedCount: 1, copiedCount: 1, totalClosure: 999, copied: [] }));
  const h4 = helper(SANDBOX, {});
  const m4 = readManifest(SANDBOX);
  check(h4.status === 0 && /explicit controlled build OK/.test(h4.stdout) && m4 && m4.totalClosure === m4.emittedCount + m4.copiedCount, "inconsistent manifest ⇒ entry rebuilds to a consistent dist");

  // 5. a copied dependency deleted ⇒ detected invalid ⇒ rebuild restores it.
  fs.rmSync(path.join(DIST, "core", "budget-contract.js"), { force: true });
  const h5 = helper(SANDBOX, {});
  check(h5.status === 0 && fs.existsSync(path.join(DIST, "core", "budget-contract.js")), "missing copied dependency ⇒ entry rebuilds and restores it");

  // 6. ODG_TS_REBUILD=1 forces a rebuild even when valid.
  const h6 = helper(SANDBOX, { ODG_TS_REBUILD: "1" });
  check(h6.status === 0 && /forcing a clean rebuild/.test(h6.stdout), "ODG_TS_REBUILD=1 forces a clean rebuild");

  // 7. NO SILENT FALLBACK: toolchain unavailable ⇒ helper STOPS, does not fabricate a dist, never runs JS.
  const SANDBOX2 = fs.mkdtempSync(path.join(BASE, "b104-notools-"));
  try {
    run("bash", ["-c", "git archive HEAD | tar -x -C " + JSON.stringify(SANDBOX2)], REPO);
    for (const rel of ["runtime/bin/odg-ensure-ts-runtime.sh", "runtime/bin/odg-local-pipeline.sh"]) {
      fs.copyFileSync(path.join(REPO, rel), path.join(SANDBOX2, rel));
    }
    fs.chmodSync(path.join(SANDBOX2, "runtime/bin/odg-ensure-ts-runtime.sh"), 0o755);
    // no node_modules symlink ⇒ no tsc available.
    const h7 = helper(SANDBOX2, {});
    check(h7.status !== 0 && /toolchain .* is not installed|NO silent fallback/.test(h7.stdout + h7.stderr), `no toolchain ⇒ entry STOPS loudly, no silent fallback (exit=${h7.status})`);
    check(!fs.existsSync(path.join(SANDBOX2, "runtime", "dist", "bin", "odg-run.js")), "failed entry build produced NO dist (no fabricated artifact)");
  } finally {
    fs.rmSync(SANDBOX2, { recursive: true, force: true });
  }

  ok = failures === 0;
} finally {
  if (ok) fs.rmSync(SANDBOX, { recursive: true, force: true });
  else console.log("sandbox preserved for forensics: " + SANDBOX);
}

console.log(failures === 0 ? "ALL PASS — TS CUTOVER QUALIFICATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
