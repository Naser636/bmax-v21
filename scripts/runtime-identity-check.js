#!/usr/bin/env node
"use strict";
/*
 * RUNTIME-vs-DISK IDENTITY CHECK (CTO deployment-hygiene mandate §6).
 *
 * Detects the drift class where the live service runs an artifact that no longer matches what is on disk
 * — e.g. a mid-session `next build` replaced `.next/standalone`, so the running process executes from a
 * DELETED inode while the on-disk BUILD_ID has moved on. A matching page title / HTTP 200 does NOT prove
 * the served artifact equals the verified on-disk build; this check makes that drift observable and
 * FAIL-CLOSED, without exposing any secret and without restarting anything.
 *
 * The decision logic is a PURE function (deterministic, unit-tested). The thin main() gathers live inputs
 * (on-disk .next/BUILD_ID, the service PID's /proc cwd, optionally a served build marker) and degrades
 * gracefully (UNKNOWN, never a false OK) when a signal is unavailable.
 *
 * Exit: 0 CONSISTENT · 3 DRIFT (fail-closed) · 2 UNKNOWN (signal unavailable) · 2 bad usage.
 */
const fs = require("fs");
const path = require("path");

/**
 * Pure verdict. Inputs (any may be null when unobservable):
 *  - onDiskBuildId : contents of .next/BUILD_ID (latest build on disk)
 *  - standaloneBuildId : contents of .next/standalone/.next/BUILD_ID (deployed standalone on disk)
 *  - runningCwd : the live service process cwd string (may end with " (deleted)")
 *  - servedBuildId : build id reported by the running service (e.g. via /api/health), or null if not exposed
 * Returns { status: CONSISTENT|DRIFT|UNKNOWN, reasons: string[] }.
 */
function identityVerdict({ onDiskBuildId, standaloneBuildId, runningCwd, servedBuildId }) {
  const reasons = [];
  let drift = false, unknown = false;

  // 1. On-disk coherence: the top-level .next build must equal the deployed standalone's build.
  if (onDiskBuildId && standaloneBuildId) {
    if (onDiskBuildId !== standaloneBuildId) { drift = true; reasons.push(`on-disk drift: .next/BUILD_ID(${onDiskBuildId}) != standalone(${standaloneBuildId})`); }
  } else {
    unknown = true; reasons.push("on-disk BUILD_ID(s) unreadable");
  }

  // 2. Deleted-inode signal: the running process executes from a replaced/removed standalone directory.
  if (runningCwd == null) {
    unknown = true; reasons.push("running service cwd unobservable (service down or no access)");
  } else if (/\(deleted\)\s*$/.test(runningCwd)) {
    drift = true; reasons.push(`running service executes from a DELETED working dir: ${runningCwd}`);
  }

  // 3. Served-vs-disk build id: only when the service actually exposes its build id.
  if (servedBuildId != null && onDiskBuildId) {
    if (servedBuildId !== onDiskBuildId) { drift = true; reasons.push(`served build(${servedBuildId}) != on-disk .next/BUILD_ID(${onDiskBuildId})`); }
    else reasons.push(`served build matches on-disk (${servedBuildId})`);
  } else if (servedBuildId == null) {
    reasons.push("served build id not exposed by the service (reliable served-vs-disk check needs /api/health to expose it)");
  }

  if (drift) return { status: "DRIFT", reasons };
  if (unknown) return { status: "UNKNOWN", reasons };
  return { status: "CONSISTENT", reasons };
}

function readTrim(p) { try { return fs.readFileSync(p, "utf8").trim(); } catch { return null; } }

function gatherLive(repoRoot) {
  const onDiskBuildId = readTrim(path.join(repoRoot, ".next", "BUILD_ID"));
  const standaloneBuildId = readTrim(path.join(repoRoot, ".next", "standalone", ".next", "BUILD_ID"));
  let runningCwd = null;
  try {
    const cp = require("child_process");
    const pid = cp.execSync("systemctl show odg-preprod.service -p MainPID --value", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    if (pid && pid !== "0") { try { runningCwd = fs.readlinkSync(`/proc/${pid}/cwd`); } catch { runningCwd = null; } }
  } catch { runningCwd = null; }
  // servedBuildId: only if /api/health exposes one — read a local marker file if the route writes it; else null.
  let servedBuildId = null;
  try {
    const cp = require("child_process");
    const body = cp.execSync("curl -s -m5 http://127.0.0.1:3000/api/health", { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const j = JSON.parse(body);
    servedBuildId = j.buildId || j.build || (j.version && j.version.buildId) || null;
  } catch { servedBuildId = null; }
  return { onDiskBuildId, standaloneBuildId, runningCwd, servedBuildId };
}

// Exit code for a verdict status (shared by human + --json output so they never diverge).
function exitCodeFor(status) { return status === "CONSISTENT" ? 0 : status === "DRIFT" ? 3 : 2; }

if (require.main === module) {
  const json = process.argv.includes("--json");
  const inputs = gatherLive(path.resolve(__dirname, ".."));
  const v = identityVerdict(inputs);
  if (json) {
    // One machine-readable object (status + reasons) for the deploy-hygiene gate; same exit code as human mode.
    process.stdout.write(JSON.stringify({ status: v.status, reasons: v.reasons }) + "\n");
  } else {
    process.stdout.write(`runtime-identity: ${v.status}\n`);
    for (const r of v.reasons) process.stdout.write(`  - ${r}\n`);
  }
  process.exit(exitCodeFor(v.status));
}
module.exports = { identityVerdict, gatherLive, exitCodeFor };
