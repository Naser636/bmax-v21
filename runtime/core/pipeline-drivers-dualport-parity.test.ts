#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * PIPELINE-DRIVER DUAL-PORT PARITY (CTO Wave 2b) — odg-verify, odg-delegate.
 * JS rollback (runtime/bin/odg-X.js) vs compiled-TS default (runtime/dist/bin/odg-X.js).
 *
 * Both drivers are cwd-relative (ROOT = process.cwd(), sibling `../core` requires) with NO __dirname —
 * so neither has the dist-depth hazard; the compiled port resolves root + siblings identically to the
 * rollback by construction. We prove behavioural parity CHEAPLY without running the heavy pipeline:
 *
 *  - odg-verify: exports pure (verifyExitCode) + heavy (runVerify, which spawns `npm run build` + tsc —
 *    HEAVY + mutating, so NOT invoked here). We assert same export API, then verifyExitCode parity on a
 *    matrix of verify-result fixtures (green / each-gate-red / report-only) — that IS the decision logic.
 *    runVerify is deterministic-by-construction across ports: it spawns IDENTICAL hardcoded commands
 *    (`npm run build`, `npx tsc --noEmit`) with no path/depth-dependent arguments, so no per-port variance.
 *  - odg-delegate: NO exports (pure top-level CLI). Parity via the BOUNDED `--prepare-only` path on a real
 *    delegable mission — it runs the Mission Loader + emits the scoped Delegation Brief and STOPS before
 *    verify/converge/archive (no heavy build, no git-state dependence). Snapshot/restore every written
 *    artefact (mission-plan.json, mission-context.json, the two brief files), run each port from the same
 *    start, and compare exit + stdout (timestamps normalized) + the written brief (byte-identical).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const GEN = path.join(REPO, "runtime", "generated");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const JS = (b) => path.join(REPO, "runtime", "bin", b + ".js");
const TS = (b) => path.join(REPO, "runtime", "dist", "bin", b + ".js");
const run = (script, args) => cp.spawnSync(process.execPath, [script, ...(args || [])], { cwd: REPO, encoding: "utf8", timeout: 60000 });
const norm = (s) => String(s || "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<TS>");
function snap(paths) { return paths.map((p) => ({ p, exists: fs.existsSync(p), data: fs.existsSync(p) ? fs.readFileSync(p) : null })); }
function restore(s) { for (const e of s) { try { if (e.exists) { fs.mkdirSync(path.dirname(e.p), { recursive: true }); fs.writeFileSync(e.p, e.data); } else if (fs.existsSync(e.p)) fs.unlinkSync(e.p); } catch { /**/ } } }
function readIf(p) { try { return fs.readFileSync(p, "utf8"); } catch { return "<ABSENT>"; } }

// ===== odg-verify: export API + pure verifyExitCode decision-logic parity =====
{
  const js = require(JS("odg-verify")), ts = require(TS("odg-verify"));
  ok("verify: same export API", JSON.stringify(Object.keys(js).sort()) === JSON.stringify(Object.keys(ts).sort()) && typeof js.verifyExitCode === "function" && typeof ts.verifyExitCode === "function");
  const fixtures = [
    [{ build: true, typescript: true, gitClean: true }, false],   // all green, enforcing
    [{ build: false, typescript: true, gitClean: true }, false],  // build red
    [{ build: true, typescript: false, gitClean: true }, false],  // tsc red
    [{ build: true, typescript: true, gitClean: false }, false],  // dirty tree red
    [{ build: false, typescript: false, gitClean: false }, true], // all red, but report-only → 0
    [{ build: true, typescript: true, gitClean: true }, true],    // all green, report-only
  ];
  for (const [v, reportOnly] of fixtures) {
    ok(`verify.verifyExitCode parity — ${JSON.stringify(v)} reportOnly=${reportOnly}`, js.verifyExitCode(v, reportOnly) === ts.verifyExitCode(v, reportOnly));
  }
  // Non-vacuous: the decision logic is real — green+enforcing is 0, any-red+enforcing is 1, report-only is 0.
  ok("verify.verifyExitCode non-vacuous (green=0, build-red=1, report-only=0)",
    js.verifyExitCode({ build: true, typescript: true, gitClean: true }, false) === 0 &&
    js.verifyExitCode({ build: false, typescript: true, gitClean: true }, false) === 1 &&
    js.verifyExitCode({ build: false, typescript: true, gitClean: true }, true) === 0);
}

// ===== odg-delegate: bounded --prepare-only brief parity (snapshot/restore) =====
{
  const M = "ACTIVATE_EXTERNAL_RESEARCH_CAPABILITY";
  const artefacts = [
    path.join(GEN, "mission-plan.json"),
    path.join(GEN, "mission-context.json"),
    path.join(GEN, "delegation", `${M}.brief.json`),
    path.join(GEN, "delegation", `${M}.brief.md`),
  ];
  const briefJsonPath = artefacts[2], briefMdPath = artefacts[3];
  const s = snap(artefacts);
  const rj = run(JS("odg-delegate"), [M, "--prepare-only"]); const bjJ = readIf(briefJsonPath), bmJ = readIf(briefMdPath);
  restore(s);
  const rt = run(TS("odg-delegate"), [M, "--prepare-only"]); const bjT = readIf(briefJsonPath), bmT = readIf(briefMdPath);
  restore(s);
  ok("delegate --prepare-only: same exit (0) + identical stdout (timestamps normalized)", rj.status === 0 && rt.status === 0 && norm(rj.stdout) === norm(rt.stdout));
  ok("delegate --prepare-only: brief.json byte-identical JS↔TS (generatedAt normalized)", norm(bjJ) === norm(bjT) && bjJ !== "<ABSENT>");
  ok("delegate --prepare-only: brief.md byte-identical JS↔TS", norm(bmJ) === norm(bmT) && bmJ !== "<ABSENT>");
  ok("delegate --prepare-only: non-vacuous (brief names the mission + its contract scope)",
    bjJ.includes(M) && /runtime\/missions\/ACTIVATE_EXTERNAL_RESEARCH_CAPABILITY\.json/.test(bmJ));
}

console.log(`\npipeline-driver dual-port parity — ${passed} assertions passed.`);
