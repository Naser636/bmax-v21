#!/usr/bin/env node
"use strict";
/* §8 compass-update tests — fail-closed, idempotence, interruption-safety, no-self-authorization.
 * Isolated temp state file + temp repoRoot; deterministic clock; no runtime mutation. */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { update, effectiveStatus, fromReport, resumeState } = require("./compass-update.js");
const cp = require("child_process");

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

function writeReport(root, obj) { fs.mkdirSync(path.join(root, "runtime", "generated"), { recursive: true }); fs.writeFileSync(path.join(root, "runtime", "generated", "mission-report.json"), JSON.stringify(obj)); return path.join(root, "runtime", "generated", "mission-report.json"); }

// 9 — fromReport (pipeline hook): matching-mission validated+SUCCESS report ⇒ verified PASS with real evidence.
{
  const root = tmpd();
  writeReport(root, { mission: "M-HOOK", status: "SUCCESS", validated: true });
  const r = fromReport("M-HOOK", root);
  ok("fromReport: identity+SUCCESS+validated ⇒ PASS", r.status === "PASS" && r.acceptanceMet === true && r.verified === true);
  ok("fromReport: evidence points at the real report", r.evidence.includes("runtime/generated/mission-report.json"));
}
// 10 — fromReport fail-closed: report NOT validated ⇒ FAIL (never PASS), acceptanceMet false.
{
  const root = tmpd();
  writeReport(root, { mission: "M-HOOK", status: "SUCCESS", validated: false });
  const r = fromReport("M-HOOK", root);
  ok("fromReport: SUCCESS but validated=false ⇒ FAIL (fail-closed)", r.status === "FAIL" && r.acceptanceMet === false);
}
// 11 — fromReport: absent report ⇒ NOT_RUN (never fabricates a PASS).
{
  const r = fromReport("M-HOOK", tmpd());
  ok("fromReport: no report ⇒ NOT_RUN", r.status === "NOT_RUN" && r.acceptanceMet === false);
}
// 12 — end-to-end hook: a FAIL-derived result recorded ⇒ never advances verifiedCheckpoint.
{
  const c = ctx();
  writeReport(c.repoRoot, { mission: "M-E2E", status: "FAILED", validated: false });
  const r = update(fromReport("M-E2E", c.repoRoot), c);
  ok("hook FAIL ⇒ recorded FAIL, verifiedCheckpoint still null", r.effective.status === "FAIL" && r.state.verifiedCheckpoint === null);
}
// 13 — GUARD 1 (identity): report belongs to a DIFFERENT mission ⇒ NOT_RUN (never attributed/false-PASS).
{
  const root = tmpd();
  writeReport(root, { mission: "OTHER_MISSION", status: "SUCCESS", validated: true });
  const r = fromReport("M-WANTED", root);
  ok("cross-mission stale SUCCESS report ⇒ NOT_RUN (not a false PASS for M-WANTED)", r.status === "NOT_RUN" && r.acceptanceMet === false && /≠/.test(r.reason));
}
// 14 — GUARD 2 (freshness): SAME-mission report older than run-start ⇒ NOT_RUN (no replay of a prior PASS).
{
  const root = tmpd();
  const rp = writeReport(root, { mission: "M-SAME", status: "SUCCESS", validated: true });
  const old = fs.statSync(rp).mtimeMs - 10000; // report written 10s before "run start"
  const r = fromReport("M-SAME", root, { sinceMs: fs.statSync(rp).mtimeMs + 5000 });
  ok("same-mission report older than run-start ⇒ NOT_RUN (no stale replay)", r.status === "NOT_RUN" && /stale/.test(r.reason));
  void old;
}
// 15 — GUARD 2 passes when the report is fresh (mtime >= run-start) ⇒ PASS.
{
  const root = tmpd();
  const rp = writeReport(root, { mission: "M-FRESH", status: "SUCCESS", validated: true });
  const r = fromReport("M-FRESH", root, { sinceMs: fs.statSync(rp).mtimeMs - 1000 }); // run started before the report was written
  ok("fresh same-mission report (mtime >= run-start) ⇒ PASS", r.status === "PASS" && r.acceptanceMet === true);
}
// 16 — end-to-end anti-stale: a NOT_RUN (stale) derivation NEVER advances a previously-verified checkpoint.
{
  const c = ctx();
  fs.writeFileSync(path.join(c.repoRoot, "ev.txt"), "x");
  update({ mission: "PRIOR", commit: "goodc", status: "PASS", acceptanceMet: true, evidence: ["ev.txt"], verified: true }, c); // establish a verified checkpoint
  writeReport(c.repoRoot, { mission: "OTHER", status: "SUCCESS", validated: true }); // stale/cross-mission
  const r = update(fromReport("NEWMISSION", c.repoRoot), c); // guard ⇒ NOT_RUN
  ok("stale report ⇒ NOT_RUN recorded, prior verifiedCheckpoint PRESERVED", r.effective.status === "NOT_RUN" && r.state.verifiedCheckpoint.commit === "goodc");
}

// 17-20 — RESUME + DIVERGENCE (read-only): CONSISTENT when checkpoint commit===HEAD, STALE when it differs,
//         UNKNOWN (never false CONSISTENT) when absent/corrupt.
{
  const root = tmpd();
  fs.mkdirSync(path.join(root, "runtime", "generated"), { recursive: true });
  cp.execSync("git init -q && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m x", { cwd: root, stdio: "ignore" });
  const head = cp.execSync("git rev-parse HEAD", { cwd: root }).toString().trim();
  const cpFile = path.join(root, "runtime", "generated", "compass-checkpoint.json");
  const file2 = path.join(root, "cp2.json"); void file2;
  // (a) no checkpoint ⇒ UNKNOWN
  ok("resume: no checkpoint ⇒ UNKNOWN (no false CONSISTENT)", resumeState(root).status === "UNKNOWN");
  // (b) verified checkpoint commit === HEAD ⇒ CONSISTENT
  fs.writeFileSync(cpFile, JSON.stringify({ verifiedCheckpoint: { mission: "M", commit: head }, lastMission: { mission: "M", status: "PASS" } }));
  ok("resume: checkpoint commit === HEAD ⇒ CONSISTENT", resumeState(root).status === "CONSISTENT" && resumeState(root).consistent === true);
  // (c) verified checkpoint commit != HEAD ⇒ STALE
  fs.writeFileSync(cpFile, JSON.stringify({ verifiedCheckpoint: { mission: "M", commit: "0000000000000000000000000000000000000000" }, lastMission: { mission: "M", status: "PASS" } }));
  ok("resume: checkpoint commit != HEAD ⇒ STALE (divergence detected)", resumeState(root).status === "STALE" && resumeState(root).consistent === false);
  // (d) checkpoint present but NO verifiedCheckpoint ⇒ UNKNOWN
  fs.writeFileSync(cpFile, JSON.stringify({ verifiedCheckpoint: null, lastMission: null }));
  ok("resume: no verifiedCheckpoint ⇒ UNKNOWN (never false CONSISTENT)", resumeState(root).status === "UNKNOWN");
}

console.log(`\ncompass-update §8 — ${passed} assertions passed.`);
