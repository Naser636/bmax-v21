#!/usr/bin/env node
"use strict";
/*
 * V297 — ISOLATED VPS-VALIDATION PRE-FLIGHT (prepares C9 start/health + C8 perf; EXECUTES NOTHING). PURE, read-only,
 * deny-by-default. It composes the V296 deployable-package identity and encodes the isolation protocol as INSPECTABLE
 * DATA + a deny-by-default readiness gate. It starts no server, binds no port, runs no benchmark, and changes no
 * status: readiness ≠ execution. C9/C8 stay PARTIAL until a SEPARATELY-AUTHORIZED execution actually proves
 * start+health / real VPS performance. No new orchestrator/service/primitive.
 *
 * Verified facts this prep rests on (real, read-only): node v22.22.1 (= deployed), active ODG release on loopback
 * :3000 (/api/health), candidate isolated ports 3100/3999/4010 FREE, 11 historical rel-* slots, 21Gi RAM / 160G free.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const ACTIVE_PORT = 3000;   // the live ODG release — MUST NOT be touched
const ACTIVE_RELEASE_ROOT = "/home/ubuntu/odg-releases";   // active/previous/rel-* live here — the slot must be OUTSIDE

// The exact protocol, as DATA (templates). Nothing here is executed by this module; it is reviewed before execution.
const ISOLATION_PROTOCOL = Object.freeze({
  verifyIdentity: "odg-deployable-package.verifyPackage({packageDigest:<candidate>}, <rebuilt-files>) === ok   # refuse any artifact ≠ qualified commit",
  start: "cd <ISOLATED_SLOT> && PORT=<PORT> HOST=127.0.0.1 nohup npx next start -p <PORT> -H 127.0.0.1 > <SLOT>/start.log 2>&1 &   # loopback ONLY, isolated slot, distinct free port",
  verifyProcess: "ss -ltn | grep '127.0.0.1:<PORT>'   # confirm bound to loopback only, PID tracked",
  health: "curl -fsS --max-time 5 http://127.0.0.1:<PORT>/api/health   # expect 200; same endpoint ODG already uses on :3000",
  criticalRoutes: "curl -fsS --max-time 5 http://127.0.0.1:<PORT>/ and /api/runtime-state   # boot-critical routes only, read-only GET",
  benchmark: "progressive warm-up → min → nominal → controlled-high → repeat; capture p50/p95/p99, throughput, errorRate, CPU, RSS; STOP if resources breach SAFETY_LIMITS",
  stop: "kill <PID>; wait; ss -ltn | grep -q ':<PORT>' && echo LEAK || echo CLEAN   # clean stop + post-stop verify (no residual process/port)",
});

// Pre-declared safety limits (experimental; no canonical SLO). Execution aborts if breached.
const SAFETY_LIMITS = Object.freeze({ minFreeMemMiB: 2048, minFreeDiskGiB: 10, loopbackOnly: true, maxTestDurationSec: 120, portMustDifferFrom: ACTIVE_PORT });

/** preflight(facts) -> deny-by-default readiness. Every precondition must hold; execution ALWAYS needs separate owner auth. */
function preflight(facts: any): any {
  const f = isObj(facts) ? facts : {};
  const port = Number(f.candidatePort);
  const slot = typeof f.isolatedSlot === "string" ? f.isolatedSlot : "";
  const checks: any[] = [];
  const req = (name: string, ok: boolean, detail: string) => checks.push(Object.freeze({ name, ok: ok === true, detail }));

  req("artifact-identity-verified", f.artifactIdentityVerified === true, "verifyPackage matched the qualified candidate digest");
  req("port-free", f.portFree === true, "candidate port observed free");
  req("port-distinct-from-active", Number.isInteger(port) && port !== ACTIVE_PORT, `port must differ from the active release port ${ACTIVE_PORT}`);
  req("loopback-only", f.loopbackOnly === true, "bind 127.0.0.1 only — no public exposure");
  req("slot-outside-active-release", slot.length > 0 && !slot.startsWith(ACTIVE_RELEASE_ROOT), `isolated slot must be OUTSIDE ${ACTIVE_RELEASE_ROOT} (no active/previous/rel-* path)`);
  req("no-active-symlink", f.usesNoActiveSymlink === true, "no alias/symlink/path of the active release");
  req("no-proxy-change", f.noProxyChange === true, "reverse-proxy/routing untouched");
  req("no-systemd-change", f.noSystemdChange === true, "no systemd service activation/config change");
  req("no-public-bind", f.noPublicBind === true, "no public port opened, no firewall change");
  req("resources-safe", f.freeMemMiB >= SAFETY_LIMITS.minFreeMemMiB && f.freeDiskGiB >= SAFETY_LIMITS.minFreeDiskGiB, `free mem ≥ ${SAFETY_LIMITS.minFreeMemMiB}MiB and disk ≥ ${SAFETY_LIMITS.minFreeDiskGiB}GiB`);
  req("clean-stop-planned", f.cleanStopPlanned === true, "a clean stop + post-stop no-residual verification is part of the plan");

  const failed = checks.filter((c) => !c.ok).map((c) => c.name);
  const ready = failed.length === 0;
  return Object.freeze({
    ready: ready ? "READY_TO_EXECUTE" : "BLOCKED",
    checks: Object.freeze(checks), failedChecks: Object.freeze(failed),
    requiresSeparateAuth: true,          // execution (start/bind/benchmark) ALWAYS needs explicit owner authorization of the protocol
    c9ExecutionGated: true, c8ExecutionGated: true,
    protocol: ISOLATION_PROTOCOL, safetyLimits: SAFETY_LIMITS,
    note: ready
      ? "all isolation preconditions satisfied — the protocol MAY be executed ONLY after explicit owner authorization; this module started nothing. C9/C8 remain PARTIAL until a separately-authorized execution proves start+health / real VPS performance."
      : `BLOCKED — unmet preconditions: ${failed.join(", ")}. Do not execute; resolve or document the blocker.`,
  });
}

const VPS_VALIDATION_PREFLIGHT_CONTRACT = Object.freeze({
  id: "V297-VPS-VALIDATION-PREFLIGHT",
  source: "V297 — prepare the isolated VPS validation for C9 (start+health) and C8 (real perf); preparation only",
  reuses: Object.freeze(["odg-deployable-package.verifyPackage (V296) for artifact identity", "the existing /api/health endpoint ODG already uses on :3000"]),
  notAuthority: "preparation + deny-by-default readiness gate; starts NO server, binds NO port, runs NO benchmark, changes NO status; no new orchestrator/service/primitive",
  invariants: Object.freeze([
    "EXECUTES NOTHING: readiness ≠ execution; start/bind/benchmark always require a separate explicit owner authorization",
    "deny-by-default: any unmet isolation precondition ⇒ BLOCKED; never READY by omission",
    "the isolated slot must be OUTSIDE the active-release root; the port must differ from the active :3000; loopback-only, no public bind, no proxy/systemd change",
    "C9/C8 stay PARTIAL until a separately-authorized execution actually proves start+health / real VPS performance — preparation is NEVER proof of execution",
    "deterministic + read-only; distinguishes real VPS measures from the V295 synthetic ones",
  ]),
});

module.exports = { preflight, ISOLATION_PROTOCOL, SAFETY_LIMITS, ACTIVE_PORT, VPS_VALIDATION_PREFLIGHT_CONTRACT };
export {};
