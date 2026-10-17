#!/usr/bin/env node
"use strict";
/* §8 compass-update tests — fail-closed, idempotence, interruption-safety, no-self-authorization.
 * Isolated temp state file + temp repoRoot; deterministic clock; no runtime mutation. */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { update, effectiveStatus } = require("./compass-update.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
function tmpd() { return fs.mkdtempSync(path.join(os.tmpdir(), "compass-")); }

const now = () => "2026-10-17T00:00:00.000Z";
function ctx() { const root = tmpd(); return { repoRoot: root, file: path.join(root, "cp.json"), now }; }

// 1 — fail-closed: PASS with a MISSING evidence file ⇒ BLOCKED (never PASS).
{
  const c = ctx();
  const r = update({ mission: "M1", commit: "abc", status: "PASS", acceptanceMet: true, evidence: ["does/not/exist.json"], verified: true }, c);
  ok("PASS + missing evidence ⇒ BLOCKED (fail-closed)", r.effective.status === "BLOCKED");
  ok("verifiedCheckpoint NOT advanced on fail-closed", r.state.verifiedCheckpoint === null);
}
// 2 — fail-closed: PASS with acceptanceMet false ⇒ BLOCKED.
{
  const c = ctx();
  const r = update({ mission: "M1", commit: "abc", status: "PASS", acceptanceMet: false, evidence: [], verified: true }, c);
  ok("PASS + acceptanceMet=false ⇒ BLOCKED", r.effective.status === "BLOCKED");
}
// 3 — genuine PASS: acceptance + existing evidence ⇒ PASS + verifiedCheckpoint advances.
{
  const c = ctx();
  fs.writeFileSync(path.join(c.repoRoot, "ev.txt"), "x");
  const r = update({ mission: "M2", commit: "c0ffee", branch: "main", worktreeClean: true, status: "PASS", acceptanceMet: true, evidence: ["ev.txt"], verified: true, nextAction: "ship" }, c);
  ok("genuine PASS recorded", r.effective.status === "PASS");
  ok("verifiedCheckpoint advanced to commit", r.state.verifiedCheckpoint && r.state.verifiedCheckpoint.commit === "c0ffee");
}
// 4 — idempotent: replaying the same verified event ⇒ no-op (no duplicate history).
{
  const c = ctx();
  fs.writeFileSync(path.join(c.repoRoot, "ev.txt"), "x");
  const ev = { mission: "M2", commit: "c0ffee", status: "PASS", acceptanceMet: true, evidence: ["ev.txt"], verified: true };
  update(ev, c);
  const before = JSON.parse(fs.readFileSync(c.file, "utf8")).history.length;
  const r2 = update(ev, c);
  const after = JSON.parse(fs.readFileSync(c.file, "utf8")).history.length;
  ok("idempotent replay ⇒ no-op", r2.changed === false && before === after && before === 1);
}
// 5 — interrupted/unverified ⇒ recorded inProgress ONLY; verifiedCheckpoint untouched.
{
  const c = ctx();
  fs.writeFileSync(path.join(c.repoRoot, "ev.txt"), "x");
  update({ mission: "M2", commit: "good", status: "PASS", acceptanceMet: true, evidence: ["ev.txt"], verified: true }, c);
  const r = update({ mission: "M3", commit: "wip", status: "PASS", acceptanceMet: true, evidence: ["ev.txt"], verified: false }, c);
  ok("unverified ⇒ inProgress recorded", r.state.inProgress && r.state.inProgress.mission === "M3");
  ok("unverified NEVER overwrites last verifiedCheckpoint", r.state.verifiedCheckpoint.commit === "good");
}
// 6 — FAIL recorded as FAIL (failure never hidden / never auto-upgraded).
{
  const c = ctx();
  const r = update({ mission: "M4", commit: "x", status: "FAIL", verified: true }, c);
  ok("FAIL recorded as FAIL", r.effective.status === "FAIL" && r.state.lastMission.status === "FAIL");
}
// 7 — malformed input ⇒ throws (fail-closed).
{
  let threw = false; try { effectiveStatus(null, "/tmp"); } catch { threw = true; }
  ok("malformed input ⇒ throws", threw);
}
// 8 — nextAction is advisory data only (no authority/execution field).
{
  const c = ctx(); fs.writeFileSync(path.join(c.repoRoot, "ev.txt"), "x");
  const r = update({ mission: "M5", commit: "y", status: "PASS", acceptanceMet: true, evidence: ["ev.txt"], verified: true, nextAction: "do X" }, c);
  ok("nextAction stored as inert string (no authority)", typeof r.state.lastMission.nextAction === "string" && !("execute" in r.state.lastMission) && !("authorized" in r.state.lastMission));
}

console.log(`\ncompass-update §8 — ${passed} assertions passed.`);
