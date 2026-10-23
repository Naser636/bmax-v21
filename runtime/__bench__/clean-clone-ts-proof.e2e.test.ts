// @ts-nocheck
/*
 * PROVE-CLEAN-CLONE-TS-RUNTIME (CTO-authorized, η3-B103).
 *
 * The strongest anti-false-success gate for the P2 TypeScript runtime: it proves, from a GENUINELY
 * CLEAN CLONE with a REAL-NETWORK `npm ci` (no symlinked/stale node_modules, no stale dist), that the
 * compiled TypeScript runtime builds closure-complete and runs a real mission by its TRUE operator
 * entrypoint — with byte-parity vs the JavaScript runtime and no silent fallback.
 *
 * Unlike dist-build-closure.e2e.test.ts (which rebuilds INSIDE the dev tree, reusing the dev
 * node_modules and cwd), this bench operates entirely in an out-of-tree sandbox materialised from
 * `git archive HEAD`, installs dependencies over the network, and NEVER touches the dev worktree.
 *
 * Honest exit codes (§S-1.J — never record PASS for a BLOCKED/NOT-RUN step):
 *   0  = all gates PASS (proof acquired)
 *   1  = a gate FAILED (real defect)
 *   2  = BLOCKED / NOT RUN (environment, e.g. network/`npm ci`) — proof NOT acquired, NOT a pass
 *
 * Clean-room: does NOT switch the default runtime, deletes no .js, touches no dev-tree file. The
 * sandbox is removed on success; on FAIL/BLOCKED it is preserved and its path printed for forensics.
 */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const REPO = process.cwd();
const builtins = new Set(require("module").builtinModules);
let failures = 0;
const evidence = { startedCwd: REPO, steps: [] };
function check(c, label, detail) {
  if (c) { console.log("  PASS " + label); evidence.steps.push({ label, result: "PASS", detail }); }
  else { failures++; console.log("  FAIL " + label); evidence.steps.push({ label, result: "FAIL", detail }); }
}
function blocked(label, detail) {
  console.log("  BLOCKED " + label + (detail ? " — " + detail : ""));
  evidence.steps.push({ label, result: "BLOCKED", detail });
}
function run(cmd, cmdArgs, cwd, extraEnv) {
  const env = { ...process.env, ...(extraEnv || {}) };
  const r = spawnSync(cmd, cmdArgs, { cwd, encoding: "utf8", env, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "", signal: r.signal };
}
function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

console.log("η3-B103 — CLEAN-CLONE TS RUNTIME PROOF (real npm ci, out-of-tree, byte-parity)");

// --- 1. Materialise a clean clone from committed HEAD (NO dist, NO node_modules). ---------------
// Sandbox base MUST live on a roomy filesystem: a full `npm ci` is ~700MB and the default os.tmpdir()
// is frequently a small tmpfs. A truncated install there silently 0-bytes files while `npm ci` still
// exits 0 (observed: 11792 zero-byte files on a 2.6GB tmpfs). Default to ~/.cache (large disk);
// override with ODG_CLEAN_CLONE_BASE. This is an environment choice, not a runtime behaviour.
const SANDBOX_BASE = process.env.ODG_CLEAN_CLONE_BASE || path.join(os.homedir(), ".cache", "odg-clean-clone");
fs.mkdirSync(SANDBOX_BASE, { recursive: true });
const SANDBOX = fs.mkdtempSync(path.join(SANDBOX_BASE, "run-"));
evidence.sandbox = SANDBOX;
let kept = false;
try {
  const archive = run("bash", ["-c", "git archive HEAD | tar -x -C " + JSON.stringify(SANDBOX)], REPO);
  check(archive.status === 0, "clean clone materialised from `git archive HEAD`");
  // A real clean clone is a git working tree (git clone), not a bare tar extract. git-init the extracted
  // tree so git-dependent missions work (e.g. QUAL_CLEAN_GATEB's Clean Workspace scans git-ignored
  // artifacts via `git ls-files --others --ignored` — which REQUIRES a git repo). Faithful, not a bypass.
  run("bash", ["-c", "cd " + JSON.stringify(SANDBOX) + " && git init -q && git -c user.email=cc@local -c user.name=cc add -A && git -c commit.gpgsign=false -c user.email=cc@local -c user.name=cc commit -q -m clean-clone"], REPO);
  check(!fs.existsSync(path.join(SANDBOX, "runtime", "dist")), "clean clone has NO runtime/dist (gitignored — not shipped)");
  check(!fs.existsSync(path.join(SANDBOX, "node_modules")), "clean clone has NO node_modules (no symlink/stale substitution)");
  check(fs.existsSync(path.join(SANDBOX, "package-lock.json")), "clean clone carries package-lock.json (npm ci prerequisite)");

  // --- 2. REAL-NETWORK npm ci (CTO: no symlink substitution; failure ⇒ BLOCKED, never a pass). ---
  const ci = run("npm", ["ci", "--no-audit", "--no-fund"], SANDBOX);
  evidence.npmCi = { status: ci.status, tail: (ci.stderr || ci.stdout).slice(-600) };
  if (ci.status !== 0) {
    blocked("real-network `npm ci` from the clean clone", "exit=" + ci.status + " (network/registry) — PROOF NOT ACQUIRED");
    console.log("BLOCKED — npm ci did not complete; not claiming the clean-clone proof. Sandbox: " + SANDBOX);
    kept = true;
    process.exit(2);
  }
  check(ci.status === 0 && fs.existsSync(path.join(SANDBOX, "node_modules")), "real-network `npm ci` installed dependencies (exit 0)");

  // install-integrity gate (§S-1.C/E): `npm ci` can exit 0 yet leave truncated 0-byte files when the
  // disk/quota is exhausted mid-extraction. A truncated toolchain is a BLOCKED environment condition,
  // NOT a build FAILURE — classify it honestly (never a pass, never a false FAIL of the ODG runtime).
  const tscPkg = path.join(SANDBOX, "node_modules", "typescript", "package.json");
  const tscPkgSize = fs.existsSync(tscPkg) ? fs.statSync(tscPkg).size : 0;
  if (tscPkgSize === 0) {
    blocked("install integrity after `npm ci`", "node_modules/typescript/package.json is 0 bytes — truncated install (disk/quota) — PROOF NOT ACQUIRED");
    console.log("BLOCKED — `npm ci` left a truncated install (disk/quota). Use ODG_CLEAN_CLONE_BASE on a roomy filesystem. Sandbox: " + SANDBOX);
    kept = true;
    process.exit(2);
  }
  check(tscPkgSize > 0, "install integrity: toolchain package.json non-truncated (" + tscPkgSize + " bytes)");

  // --- 3. build:runtime on the clean clone — closure-complete + reproducible manifest sha. -------
  const DIST = path.join(SANDBOX, "runtime", "dist");
  const manPath = path.join(DIST, "dist-closure-manifest.json");
  const b1 = run("npm", ["run", "build:runtime"], SANDBOX);
  evidence.build1 = { status: b1.status, tail: (b1.stdout + b1.stderr).slice(-400) };
  check(b1.status === 0, "`npm run build:runtime` exit 0 on the clean clone");
  check(fs.existsSync(manPath), "build emits dist-closure-manifest.json");
  let man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, "utf8")) : {};
  check(man.totalClosure === man.emittedCount + man.copiedCount && man.copiedCount > 0,
    `manifest consistent + copies JS deps (emitted=${man.emittedCount} copied=${man.copiedCount} total=${man.totalClosure})`);
  const sha1 = fs.existsSync(manPath) ? sha256(fs.readFileSync(manPath)) : "";
  evidence.manifest = { emitted: man.emittedCount, copied: man.copiedCount, total: man.totalClosure, sha256: sha1 };

  // reproducibility: wipe dist and rebuild ⇒ byte-identical manifest.
  fs.rmSync(DIST, { recursive: true, force: true });
  const b2 = run("npm", ["run", "build:runtime"], SANDBOX);
  const sha2 = (b2.status === 0 && fs.existsSync(manPath)) ? sha256(fs.readFileSync(manPath)) : "";
  check(sha1 && sha1 === sha2, "reproducible build: two clean builds ⇒ identical manifest sha256");

  // static closure proof against the ACTUAL build: no unresolved relative/unexpected-external requires.
  function resolveInDir(dir, t) {
    for (const c of [t, t + ".js", t + ".json", path.join(t, "index.js")]) {
      const p = path.resolve(dir, c);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    }
    return null;
  }
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const coreDir = path.join(DIST, "core");
  const built = fs.existsSync(coreDir)
    ? [...fs.readdirSync(coreDir).filter((f) => f.endsWith(".js")).map((f) => path.join(coreDir, f)), path.join(DIST, "bin", "odg-run.js")]
    : [];
  let unresolved = 0;
  for (const f of built) {
    const src = strip(fs.readFileSync(f, "utf8"));
    const re = /require\(\s*("([^"]*)"|'([^']*)')\s*\)/g; let m;
    while ((m = re.exec(src))) {
      const t = m[2] !== undefined ? m[2] : m[3];
      if (t.startsWith("./") || t.startsWith("../")) { if (!resolveInDir(path.dirname(f), t)) { unresolved++; console.log("   UNRESOLVED:", path.relative(DIST, f), "->", t); } }
      else if (!builtins.has(t.replace(/^node:/, ""))) { unresolved++; console.log("   UNEXPECTED EXTERNAL:", path.relative(DIST, f), "->", t); }
    }
  }
  check(built.length > 0 && unresolved === 0, "built dist is closure-complete (0 unresolved relative requires, 0 unexpected external)");

  // --- 4. TRUE operator entrypoint: compiled TS runtime runs the real mission. -------------------
  const reportPath = path.join(SANDBOX, "runtime", "generated", "mission-report.json");
  const tsEnv = { ODG_STAGE_BASE: "runtime/dist/core" };
  delete tsEnv.ODG_RUNTIME_ENTRY;
  const ts = run("node", ["runtime/dist/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SANDBOX, tsEnv);
  check(ts.status === 0 && /PIPELINE SUCCESS/.test(ts.stdout + ts.stderr), "compiled TS entry runs QUAL_CLEAN_GATEB (PIPELINE SUCCESS)");
  const tsReport = fs.existsSync(reportPath) ? fs.readFileSync(reportPath) : Buffer.from("");
  const tsJson = tsReport.length ? JSON.parse(tsReport.toString("utf8")) : {};
  check(tsJson.status === "SUCCESS" && tsJson.validated === true, "compiled mission-report: status=SUCCESS validated=true");
  evidence.tsReport = tsJson;

  // --- 5. JS runtime (default) on the same clean clone, then BYTE-PARITY of the report. ----------
  const js = run("node", ["runtime/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SANDBOX, {});
  check(js.status === 0 && /PIPELINE SUCCESS/.test(js.stdout + js.stderr), "JS (default) entry runs QUAL_CLEAN_GATEB (PIPELINE SUCCESS)");
  const jsReport = fs.existsSync(reportPath) ? fs.readFileSync(reportPath) : Buffer.from("");
  const jsJson = jsReport.length ? JSON.parse(jsReport.toString("utf8")) : {};
  evidence.jsReport = jsJson;
  check(jsJson.status === "SUCCESS" && jsJson.validated === true, "JS mission-report: status=SUCCESS validated=true");
  // report has no volatile fields ({mission,status,validated}) ⇒ byte-parity is exact.
  check(tsReport.length > 0 && tsReport.equals(jsReport), "JS ≡ TS mission-report BYTE-IDENTICAL (parity, zero normalization)");

  // --- 6. Negatives — no silent fallback (real exit codes, not piped). ---------------------------
  const badBase = run("node", ["runtime/dist/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SANDBOX, { ODG_STAGE_BASE: "runtime/does-not-exist" });
  check(badBase.status !== 0 && !/PIPELINE SUCCESS/.test(badBase.stdout + badBase.stderr),
    `invalid stage base THROWS, no SUCCESS (exit=${badBase.status})`);
  fs.rmSync(DIST, { recursive: true, force: true });
  const noDist = run("node", ["runtime/dist/bin/odg-run.js", "QUAL_CLEAN_GATEB"], SANDBOX, { ODG_STAGE_BASE: "runtime/dist/core" });
  check(noDist.status !== 0 && !/PIPELINE SUCCESS/.test(noDist.stdout + noDist.stderr),
    `missing dist THROWS, no silent fallback to JS (exit=${noDist.status})`);

  // persist evidence to scratchpad-adjacent sandbox report before cleanup.
  evidence.result = failures === 0 ? "ALL_PASS" : "FAILURES=" + failures;
} finally {
  const evPath = path.join(os.tmpdir(), "odg-clean-clone-proof-evidence.json");
  try { fs.writeFileSync(evPath, JSON.stringify(evidence, null, 2)); console.log("evidence -> " + evPath); } catch (e) {}
  if (failures === 0 && !kept) { fs.rmSync(SANDBOX, { recursive: true, force: true }); }
  else { console.log("sandbox preserved for forensics: " + SANDBOX); }
}

console.log(failures === 0 ? "ALL PASS — CLEAN-CLONE TS RUNTIME PROOF" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
