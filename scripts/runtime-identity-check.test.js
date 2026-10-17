#!/usr/bin/env node
"use strict";
/* Runtime-vs-disk identity detector tests — pure, deterministic, fail-closed (CTO §6). */
const assert = require("assert");
const { identityVerdict } = require("./runtime-identity-check.js");

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

console.log(`\nruntime-identity-check — ${passed} assertions passed.`);
