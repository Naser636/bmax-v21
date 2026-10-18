#!/usr/bin/env node
"use strict";
/*
 * W6 SCRIPTS DUAL-PORT PARITY (CTO L6 sub-lot 1) — tsx-run observability scripts w6-collect, w6-review.
 * Both are side-effecting top-level scripts (no exports): w6-collect APPENDS a record to the W6 journal +
 * recomputes the checkpoint; w6-review reads the journal + writes a dated report. Dual-port = TS SOURCE
 * (scripts/X.ts, tsx-run) + JS rollback (scripts/X.js). Parity is proven by running each port in an
 * ISOLATED temp cwd (REPO=process.cwd()) over the SAME fixture and comparing every written artefact +
 * stdout, with timestamps / elapsed-hours normalized (the only non-deterministic fields).
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const TSX = path.join(REPO, "node_modules", ".bin", "tsx");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const norm = (s) => String(s || "")
  .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<TS>")
  .replace(/"elapsedHours":\s*[\d.]+/g, '"elapsedHours":<H>')
  .replace(/\d{4}-\d{2}-\d{2}/g, "<DATE>");
const runJs = (script, args, cwd) => cp.spawnSync(process.execPath, [script, ...(args || [])], { cwd, encoding: "utf8", timeout: 30000 });
const runTs = (script, args, cwd) => cp.spawnSync(TSX, [script, ...(args || [])], { cwd, encoding: "utf8", timeout: 60000 });
const readIf = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return "<ABSENT>"; } }

function mkRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "w6-par-"));
  fs.mkdirSync(path.join(root, "runtime", "generated", "w6"), { recursive: true });
  fs.mkdirSync(path.join(root, "runtime", "dist"), { recursive: true });
  return root;
}

// ===== w6-collect: append a journal record + recompute checkpoint =====
{
  const JS = path.join(REPO, "scripts", "w6-collect.js"), TS = path.join(REPO, "scripts", "w6-collect.ts");
  function drive(runner, script) {
    const root = mkRepo();
    fs.writeFileSync(path.join(root, "runtime", "generated", "mission-report.json"), JSON.stringify({ mission: "MTEST", status: "SUCCESS", validated: true }));
    fs.writeFileSync(path.join(root, "runtime", "dist", "dist-closure-manifest.json"), JSON.stringify({ emittedCount: 5, copiedCount: 2 }));
    const r = runner(script, ["MTEST", "A-shell", "0"], root);
    const journal = readIf(path.join(root, "runtime", "generated", "w6", "journal.jsonl"));
    const ckpt = readIf(path.join(root, "runtime", "generated", "w6", "checkpoint.json"));
    fs.rmSync(root, { recursive: true, force: true });
    return { code: r.status, journal, ckpt };
  }
  const j = drive(runJs, JS), t = drive(runTs, TS);
  ok("w6-collect: same exit (0 — always)", j.code === 0 && t.code === 0);
  ok("w6-collect: journal record byte-identical (ts normalized)", norm(j.journal) === norm(t.journal) && j.journal !== "<ABSENT>");
  ok("w6-collect: checkpoint byte-identical (ts/elapsed normalized)", norm(j.ckpt) === norm(t.ckpt) && j.ckpt !== "<ABSENT>");
  ok("w6-collect: non-vacuous (record carries the mission + SUCCESS + dist tally)", /MTEST/.test(j.journal) && /"status":"SUCCESS"/.test(j.journal) && /emitted=5,copied=2/.test(j.journal));
}

// ===== w6-review: read journal → stdout report + dated snapshot =====
{
  const JS = path.join(REPO, "scripts", "w6-review.js"), TS = path.join(REPO, "scripts", "w6-review.ts");
  const fixture = [
    { ts: "2026-10-01T00:00:00.000Z", type: "A", entry: "A-shell", status: "SUCCESS", validated: true, source: "auto-collect", parity: null },
    { ts: "2026-10-02T00:00:00.000Z", type: "B", entry: "A-shell", status: "SUCCESS", validated: true, source: "auto-collect", parity: true },
    { event: "stale-recovery-drill", ok: true },
    { event: "rollback-drill", ok: true },
  ].map((r) => JSON.stringify(r)).join("\n") + "\n";
  function drive(runner, script) {
    const root = mkRepo();
    fs.writeFileSync(path.join(root, "runtime", "generated", "w6", "journal.jsonl"), fixture);
    const r = runner(script, [], root);
    const reportsDir = path.join(root, "runtime", "generated", "w6", "reports");
    let report = "<ABSENT>";
    try { const f = fs.readdirSync(reportsDir).find((x) => x.endsWith(".json")); if (f) report = fs.readFileSync(path.join(reportsDir, f), "utf8"); } catch { /* */ }
    fs.rmSync(root, { recursive: true, force: true });
    return { code: r.status, stdout: r.stdout, report };
  }
  const j = drive(runJs, JS), t = drive(runTs, TS);
  ok("w6-review: same exit code", j.code === t.code);
  ok("w6-review: stdout report identical (date/elapsed normalized)", norm(j.stdout) === norm(t.stdout));
  ok("w6-review: written dated snapshot identical", norm(j.report) === norm(t.report) && j.report !== "<ABSENT>");
  ok("w6-review: non-vacuous (2 real missions, IN PROGRESS verdict — thresholds pending)", /"realMissions": 2/.test(j.report) && /IN PROGRESS/.test(j.stdout));
}

console.log(`\nw6 scripts dual-port parity — ${passed} assertions passed.`);
