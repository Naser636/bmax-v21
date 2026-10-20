#!/usr/bin/env node
// @ts-nocheck — L5/L6 bulk test migration: runtime-compat under tsx proven; this suppresses
// tsc typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/* Runtime-vs-disk identity detector tests — pure, deterministic, fail-closed (CTO §6). */
const assert = require("assert");
const cp = require("child_process");
const path = require("path");
const { identityVerdict, exitCodeFor } = require("./runtime-identity-check.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

// 1 — fully consistent: matching on-disk, live cwd not deleted, served == disk.
{
  const v = identityVerdict({ onDiskBuildId: "ABC", standaloneBuildId: "ABC", runningCwd: "/app/.next/standalone", servedBuildId: "ABC" });
  ok("all aligned ⇒ CONSISTENT", v.status === "CONSISTENT");
}
// 2 — deleted-inode drift: running cwd ends with (deleted).
{
  const v = identityVerdict({ onDiskBuildId: "ABC", standaloneBuildId: "ABC", runningCwd: "/app/.next/standalone (deleted)", servedBuildId: null });
  ok("running from DELETED dir ⇒ DRIFT", v.status === "DRIFT" && v.reasons.some((r) => /DELETED/.test(r)));
}
// 3 — on-disk drift: .next/BUILD_ID != standalone.
{
  const v = identityVerdict({ onDiskBuildId: "NEW", standaloneBuildId: "OLD", runningCwd: "/app/.next/standalone", servedBuildId: null });
  ok(".next != standalone ⇒ DRIFT", v.status === "DRIFT" && v.reasons.some((r) => /on-disk drift/.test(r)));
}
// 4 — served-vs-disk mismatch: the running service reports a different build than on disk.
{
  const v = identityVerdict({ onDiskBuildId: "NEW", standaloneBuildId: "NEW", runningCwd: "/app/.next/standalone", servedBuildId: "OLD" });
  ok("served != on-disk ⇒ DRIFT", v.status === "DRIFT" && v.reasons.some((r) => /served build/.test(r)));
}
// 5 — service down / cwd unobservable ⇒ UNKNOWN (never a false CONSISTENT).
{
  const v = identityVerdict({ onDiskBuildId: "ABC", standaloneBuildId: "ABC", runningCwd: null, servedBuildId: null });
  ok("cwd unobservable ⇒ UNKNOWN (fail-closed, not CONSISTENT)", v.status === "UNKNOWN");
}
// 6 — on-disk unreadable ⇒ UNKNOWN (not a false OK), unless a hard drift is already proven.
{
  const v = identityVerdict({ onDiskBuildId: null, standaloneBuildId: null, runningCwd: "/app/.next/standalone", servedBuildId: null });
  ok("on-disk unreadable + no drift signal ⇒ UNKNOWN", v.status === "UNKNOWN");
}
// 7 — DRIFT dominates UNKNOWN: a proven deleted-inode drift is reported even if another signal is missing.
{
  const v = identityVerdict({ onDiskBuildId: null, standaloneBuildId: null, runningCwd: "/app/.next/standalone (deleted)", servedBuildId: null });
  ok("deleted-inode DRIFT dominates a missing on-disk signal", v.status === "DRIFT");
}
// 8 — served match is reported positively when aligned.
{
  const v = identityVerdict({ onDiskBuildId: "X", standaloneBuildId: "X", runningCwd: "/app/standalone", servedBuildId: "X" });
  ok("served match reported", v.status === "CONSISTENT" && v.reasons.some((r) => /served build matches/.test(r)));
}

// 9 — exitCodeFor maps statuses to the documented codes (0 CONSISTENT, 3 DRIFT, 2 UNKNOWN).
{
  ok("exitCodeFor: CONSISTENT=0, DRIFT=3, UNKNOWN=2", exitCodeFor("CONSISTENT") === 0 && exitCodeFor("DRIFT") === 3 && exitCodeFor("UNKNOWN") === 2);
}
// 10 — --json CLI prints ONE valid JSON object {status, reasons} and preserves the status exit code.
{
  const res = cp.spawnSync("node", [path.join(__dirname, "runtime-identity-check.js"), "--json"], { encoding: "utf8" });
  let parsed = null, parseOk = true;
  try { parsed = JSON.parse(res.stdout.trim()); } catch { parseOk = false; }
  ok("--json emits valid JSON with status + reasons", parseOk && parsed && typeof parsed.status === "string" && Array.isArray(parsed.reasons));
  ok("--json exit code matches exitCodeFor(status)", parsed && res.status === exitCodeFor(parsed.status));
  ok("--json prints a single line (one object)", res.stdout.trim().split("\n").length === 1);
}

// 11 — RELEASE MODE (the fix): the service serves from an immutable release; the repo .next is a separate local
//      build. served == active-release build ⇒ CONSISTENT, even though the repo .next/BUILD_ID differs. This is
//      the false positive that previously forced a wrongful rollback of a correct release.
{
  const v = identityVerdict({ onDiskBuildId: "REPO_LOCAL", standaloneBuildId: "REPO_LOCAL", runningCwd: "/home/u/odg-releases/current/app", servedBuildId: "RELEASE_A", activeReleaseBuildId: "RELEASE_A" });
  ok("release mode: served==active release ⇒ CONSISTENT despite differing repo .next (false-DRIFT fixed)", v.status === "CONSISTENT" && v.reasons.some((r) => /served build matches active release/.test(r)));
}
// 12 — RELEASE MODE: served != active release ⇒ DRIFT (a genuine orphan/stale process serving the wrong release).
{
  const v = identityVerdict({ onDiskBuildId: "REPO_LOCAL", standaloneBuildId: "REPO_LOCAL", runningCwd: "/home/u/odg-releases/rel-old/app", servedBuildId: "RELEASE_OLD", activeReleaseBuildId: "RELEASE_NEW" });
  ok("release mode: served!=active release ⇒ DRIFT (real stale/orphan)", v.status === "DRIFT" && v.reasons.some((r) => /served build\(RELEASE_OLD\) != active release\(RELEASE_NEW\)/.test(r)));
}
// 13 — RELEASE MODE: a repo-local .next!=standalone difference is informational, NOT a served-drift verdict
//      (the service serves the immutable release, not the repo build).
{
  const v = identityVerdict({ onDiskBuildId: "REPO_NEW", standaloneBuildId: "REPO_OLD", runningCwd: "/home/u/odg-releases/current/app", servedBuildId: "RELEASE_A", activeReleaseBuildId: "RELEASE_A" });
  ok("release mode: repo .next!=standalone is informational (not DRIFT) when served matches active release", v.status === "CONSISTENT" && v.reasons.some((r) => /irrelevant to the served immutable release/.test(r)));
}

console.log(`\nruntime-identity-check — ${passed} assertions passed.`);
