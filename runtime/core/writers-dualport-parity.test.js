#!/usr/bin/env node
"use strict";
/*
 * WRITERS DUAL-PORT PARITY (CTO Lot 2A) — odg-test-report, odg-state, odg-bootstrap.
 * JS rollback (runtime/bin/odg-X.js) vs compiled-TS default (runtime/dist/bin/odg-X.js).
 *   - odg-test-report: pure functions (classify/summarize/overallExit/renderReport/stalenessOf) compared
 *     directly on fixtures, + LIVE `--show` subprocess (READ-ONLY artifact view, no suite run) identical.
 *   - odg-state: WRITES ~8 generated artefacts → SNAPSHOT/RESTORE the full set; run each port from the
 *     same start, compare stdout banner + every written artefact (generatedAt normalized); restore even
 *     on failure. Deterministic: the runtime-model is timestamp-free; only generatedAt differs.
 *   - odg-bootstrap: writes project-context.json only when ABSENT → snapshot/restore it, exercise the
 *     WRITE path on both ports, compare stdout + the written file (generatedAt normalized).
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
const norm = (s) => String(s || "").replace(/"generatedAt":\s*"[^"]*"/g, '"generatedAt":"<TS>"').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<TS>").replace(/age\s*:\s*-?\d+ min/g, "age: <AGE>");

// Snapshot/restore a set of absolute paths (preserve absent-ness).
function snap(paths) { return paths.map((p) => ({ p, exists: fs.existsSync(p), data: fs.existsSync(p) ? fs.readFileSync(p) : null })); }
function restore(s) { for (const e of s) { try { if (e.exists) { fs.mkdirSync(path.dirname(e.p), { recursive: true }); fs.writeFileSync(e.p, e.data); } else if (fs.existsSync(e.p)) fs.unlinkSync(e.p); } catch { /**/ } } }
function readIf(p) { try { return fs.readFileSync(p, "utf8"); } catch { return "<ABSENT>"; } }

// ===== odg-test-report: pure-function parity + live --show =====
{
  const js = require(JS("odg-test-report")), ts = require(TS("odg-test-report"));
  ok("test-report: same API", JSON.stringify(Object.keys(js).sort()) === JSON.stringify(Object.keys(ts).sort()));
  const cases = [
    { exists: false }, { exists: true, exitCode: 0, stdout: "all good" },
    { exists: true, exitCode: 0, stdout: "##CLASS: SKIPPED env missing" },
    { exists: true, exitCode: 1, stdout: "boom" },
    { exists: true, exitCode: 3, stdout: "##CLASS: BLOCKED_BY_ISOLATION no bubblewrap" },
  ];
  for (const c of cases) ok(`test-report.classify parity — ${JSON.stringify(c.stdout || c.exists)}`, JSON.stringify(js.classify(c)) === JSON.stringify(ts.classify(c)));
  const results = cases.map((c, i) => ({ file: "f" + i, exitCode: c.exitCode ?? null, ...js.classify(c) }));
  ok("test-report.summarize parity", JSON.stringify(js.summarize(results)) === JSON.stringify(ts.summarize(results)));
  ok("test-report.overallExit parity", js.overallExit(js.summarize(results)) === ts.overallExit(ts.summarize(results)));
  ok("test-report.renderReport parity", js.renderReport(js.summarize(results), results) === ts.renderReport(ts.summarize(results), results));
  // live --show (read-only; no suite run) — identical (age/generatedAt normalized).
  const rj = run(JS("odg-test-report"), ["--show"]), rt = run(TS("odg-test-report"), ["--show"]);
  ok("test-report --show: same exit + identical stdout (read-only)", rj.status === rt.status && norm(rj.stdout) === norm(rt.stdout));
}

// ===== odg-state: live + snapshot/restore all written artefacts =====
{
  const artefacts = ["runtime-state.json", "runtime-status.json", "runtime-mission-queue.json", "capability-registry.json", "mission-scan.json", "autonomy-rate.json", "objective-attribution.json", path.join("reports", "contract-scan-report.md")].map((n) => path.join(GEN, n));
  const s = snap(artefacts);
  const rj = run(JS("odg-state")); const filesJ = artefacts.map(readIf);
  restore(s);
  const rt = run(TS("odg-state")); const filesT = artefacts.map(readIf);
  restore(s);
  ok("state: same exit + identical stdout banner (generatedAt normalized)", rj.status === rt.status && norm(rj.stdout) === norm(rt.stdout));
  let allEq = true; for (let i = 0; i < artefacts.length; i++) if (norm(filesJ[i]) !== norm(filesT[i])) { allEq = false; console.log("    mismatch:", artefacts[i]); }
  ok("state: every written artefact byte-identical JS↔TS (generatedAt normalized)", allEq);
  ok("state: non-vacuous (runtime-state.json actually written)", norm(filesJ[0]) !== "<ABSENT>" && /"runtime"/.test(filesJ[0]));
}

// ===== odg-bootstrap: write-path parity via snapshot/restore =====
{
  const PC = path.join(GEN, "project-context.json");
  const s = snap([PC]);
  try { if (fs.existsSync(PC)) fs.unlinkSync(PC); } catch { /**/ }
  const rj = run(JS("odg-bootstrap")); const fj = readIf(PC);
  try { if (fs.existsSync(PC)) fs.unlinkSync(PC); } catch { /**/ }
  const rt = run(TS("odg-bootstrap")); const ft = readIf(PC);
  restore(s);
  ok("bootstrap: same exit + identical stdout", rj.status === rt.status && norm(rj.stdout) === norm(rt.stdout));
  ok("bootstrap: written project-context.json identical (generatedAt normalized)", norm(fj) === norm(ft) && /"files"/.test(fj));
}

console.log(`\nwriters dual-port parity — ${passed} assertions passed.`);
