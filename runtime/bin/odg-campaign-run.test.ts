#!/usr/bin/env node
// @ts-nocheck — runs under tsx. INTEGRATION test of the REAL entry point (odg-campaign-run) as a spawned PROCESS with a
// REAL executor (verification = genuine `node --check`). Demonstrates: multi-mission auto-execution through the real
// launcher, persistence + resume across process terminations, idempotent re-run (no double-execution), and the
// fail-closed NO_EXECUTOR default (no fictitious executor). Not a pure-driver test — it drives the actual CLI.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const REPO = path.join(__dirname, "..", "..");
const CLI = path.join("runtime", "bin", "odg-campaign-run.ts");

// a chain of 3 REAL verification lots (each runs node --check on clean JS ⇒ PASS); dep-ordered.
const vlot = (id, dep) => ({ id, status: "READY", deps: dep ? [dep] : [], priority: 1, exec: { kind: "verification", language: "JavaScript", content: `const ${id} = 1;\nmodule.exports = ${id};\n`, expectedStatus: "PASS" } });
function writeReg(p) { fs.writeFileSync(p, JSON.stringify({ version: "entrypoint-itest", items: [vlot("m0"), vlot("m1", "m0"), vlot("m2", "m1")] })); }
function runCli(regPath, env) {
  const r = cp.spawnSync("npx", ["tsx", CLI, regPath], { cwd: REPO, encoding: "utf8", env: { ...process.env, ...env }, timeout: 120000 });
  let json = null; try { json = JSON.parse(r.stdout); } catch { /* */ }
  return { code: r.status, json, stderr: r.stderr };
}
function statuses(p) { return JSON.parse(fs.readFileSync(p, "utf8")).items.reduce((m, it) => (m[it.id] = it.status, m), {}); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-entrypoint-"));
try {
  // (1) real CLI, real executor, interrupt after 1 mission.
  const p = path.join(dir, "reg.json"); writeReg(p);
  const r1 = runCli(p, { ODG_CAMPAIGN_EXECUTOR: "verification", ODG_CAMPAIGN_MAX_ITER: "1" });
  ok("entry point runs via real process ⇒ exit 0, 1 mission executed, persisted", r1.code === 0 && r1.json && r1.json.iterations === 1 && statuses(p).m0 === "ACCEPTED");

  // (2) resume from the persisted checkpoint in a NEW process ⇒ drains the rest ⇒ COMPLETED.
  const r2 = runCli(p, { ODG_CAMPAIGN_EXECUTOR: "verification" });
  ok("new process resumes from checkpoint ⇒ COMPLETED, all 3 ACCEPTED", r2.json && r2.json.campaignComplete === true && Object.values(statuses(p)).every(s => s === "ACCEPTED"));

  // (3) idempotent re-run ⇒ 0 iterations, still COMPLETED (no double-execution).
  const r3 = runCli(p, { ODG_CAMPAIGN_EXECUTOR: "verification" });
  ok("re-run on completed campaign ⇒ 0 iterations (idempotent)", r3.json && r3.json.iterations === 0 && r3.json.campaignComplete === true);

  // (4) multi-mission in ONE launch (fresh register, no interrupt) ⇒ 3 consecutive missions, COMPLETED.
  const p2 = path.join(dir, "reg2.json"); writeReg(p2);
  const r4 = runCli(p2, { ODG_CAMPAIGN_EXECUTOR: "verification" });
  ok("single launch drives 3 consecutive missions ⇒ COMPLETED in 3 iterations", r4.json && r4.json.iterations === 3 && r4.json.campaignComplete === true);

  // (5) fail-closed: default (no executor) ⇒ NO_EXECUTOR_AUTHORIZED, register UNTOUCHED, exit 0 (not a crash).
  const p3 = path.join(dir, "reg3.json"); writeReg(p3); const before = fs.readFileSync(p3, "utf8");
  const r5 = runCli(p3, { ODG_CAMPAIGN_EXECUTOR: "" });
  ok("no authorized executor ⇒ NO_EXECUTOR_AUTHORIZED, no fictitious run, register untouched", r5.code === 0 && r5.json && r5.json.stopped === "NO_EXECUTOR_AUTHORIZED" && fs.readFileSync(p3, "utf8") === before);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

console.log(`\nODG-CAMPAIGN-RUN entry-point integration — ${pass} assertions passed. (real process, real executor; multi-mission; resume across process terminations; idempotent; fail-closed NO_EXECUTOR)`);
