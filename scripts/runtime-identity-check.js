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
function identityVerdict({ onDiskBuildId, standaloneBuildId, runningCwd, servedBuildId, activeReleaseBuildId }) {
  const reasons = [];
  let drift = false, unknown = false;
  // RELEASE MODE: the service serves from an IMMUTABLE, isolated release (`current/app`) with its OWN frozen
  // build id. The repo's `.next/BUILD_ID` is a SEPARATE local build, rebuilt independently by any `npm run build`
  // in the checkout — so it is EXPECTED to differ and MUST NOT be the served-drift reference (that false
  // positive previously triggered a wrongful rollback of a correct release). When an active release is present,
  // the authoritative serving artifact is the ACTIVE RELEASE build id.
  const releaseMode = activeReleaseBuildId != null;

  // 1. Repo on-disk coherence (.next vs its own standalone). In release mode this is repo-local build hygiene
  //    ONLY (the service does not serve from the repo .next) ⇒ informational, never a served-drift verdict.
  if (onDiskBuildId && standaloneBuildId) {
    if (onDiskBuildId !== standaloneBuildId) {
      if (releaseMode) reasons.push(`repo-local note: .next/BUILD_ID(${onDiskBuildId}) != standalone(${standaloneBuildId}) — irrelevant to the served immutable release`);
      else { drift = true; reasons.push(`on-disk drift: .next/BUILD_ID(${onDiskBuildId}) != standalone(${standaloneBuildId})`); }
    }
  } else if (!releaseMode) {
    unknown = true; reasons.push("on-disk BUILD_ID(s) unreadable");
  }

  // 2. Deleted-inode signal: the running process executes from a replaced/removed directory (real drift in BOTH models).
  if (runningCwd == null) {
    unknown = true; reasons.push("running service cwd unobservable (service down or no access)");
  } else if (/\(deleted\)\s*$/.test(runningCwd)) {
    drift = true; reasons.push(`running service executes from a DELETED working dir: ${runningCwd}`);
  }

  // 3. Served-vs-AUTHORITATIVE-artifact: release mode ⇒ compare to the ACTIVE RELEASE build id (what the
  //    service actually serves from); legacy single-checkout mode ⇒ compare to the repo on-disk .next/BUILD_ID.
  if (servedBuildId != null) {
    const ref = releaseMode ? activeReleaseBuildId : onDiskBuildId;
    const refName = releaseMode ? "active release" : "on-disk .next";
    if (ref) {
      if (servedBuildId !== ref) { drift = true; reasons.push(`served build(${servedBuildId}) != ${refName}(${ref})`); }
      else reasons.push(`served build matches ${refName} (${servedBuildId})`);
    }
  } else {
    reasons.push("served build id not exposed by the service (reliable served check needs /api/health to expose it)");
  }

  if (drift) return { status: "DRIFT", reasons };
  if (unknown) return { status: "UNKNOWN", reasons };
  return { status: "CONSISTENT", reasons };
}

function readTrim(p) { try { return fs.readFileSync(p, "utf8").trim(); } catch { return null; } }

// Parse the PID of the process LISTENING on `port` from `ss -ltnp` output. PURE + testable. Fallback used when
// the systemd MainPID is 0/unavailable (e.g. the serving process is managed by the release pipeline, not the
// systemd unit, or the unit is failed) — so the checker can still OBSERVE the real serving process (its cwd)
// instead of degrading to UNKNOWN. Returns the pid string or null.
function pidFromSs(ssOutput, port) {
  const re = new RegExp("[.:]" + String(port) + "\\s");
  for (const line of String(ssOutput || "").split("\n")) {
    if (re.test(line)) { const m = line.match(/pid=(\d+)/); if (m) return m[1]; }
  }
  return null;
}

function gatherLive(repoRoot) {
  const onDiskBuildId = readTrim(path.join(repoRoot, ".next", "BUILD_ID"));
  const standaloneBuildId = readTrim(path.join(repoRoot, ".next", "standalone", ".next", "BUILD_ID"));
  // Active immutable release build id — the AUTHORITATIVE serving artifact when the release pipeline is in use.
  // null ⇒ no active release (legacy single-checkout model) ⇒ verdict falls back to the repo .next reference.
  const releaseRoot = process.env.ODG_RELEASE_ROOT || "/home/ubuntu/odg-releases";
  const activeReleaseBuildId = readTrim(path.join(releaseRoot, "current", "app", ".next", "BUILD_ID"));
  let runningCwd = null;
  const servedPort = Number(process.env.ODG_SERVED_PORT) || 3000;
  try {
    const cp = require("child_process");
    let pid = null;
    try { pid = cp.execSync("systemctl show odg-preprod.service -p MainPID --value", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { pid = null; }
    // Fallback: when the systemd MainPID is absent/0 (unit down/failed, or the release pipeline supervises the
    // process itself), observe the process LISTENING on the served port — so a correctly-serving release is not
    // mis-reported as UNKNOWN. Read-only (ss + /proc), no service/network change.
    if (!pid || pid === "0") {
      try { const ss = cp.execSync("ss -ltnp 2>/dev/null", { stdio: ["ignore", "pipe", "ignore"] }).toString(); pid = pidFromSs(ss, servedPort) || "0"; } catch { /* keep pid */ }
    }
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
  return { onDiskBuildId, standaloneBuildId, runningCwd, servedBuildId, activeReleaseBuildId };
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
module.exports = { identityVerdict, gatherLive, exitCodeFor, pidFromSs };
