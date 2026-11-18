#!/usr/bin/env node
"use strict";
/* V297 — tests for odg-vps-validation-preflight (prepares C9/C8 isolated VPS validation; executes nothing). Asserts
 * deny-by-default readiness, each isolation precondition has teeth (slot outside active release, port ≠ active :3000,
 * loopback-only, no public bind, resources), execution ALWAYS needs separate owner auth, and the protocol is documented
 * data (loopback /api/health, clean stop). Pure/read-only. */
const PF = require("./odg-vps-validation-preflight.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

const good = {
  artifactIdentityVerified: true, portFree: true, candidatePort: 3100, loopbackOnly: true,
  isolatedSlot: "/home/ubuntu/odg-validation-slot", usesNoActiveSymlink: true, noProxyChange: true,
  noSystemdChange: true, noPublicBind: true, freeMemMiB: 21000, freeDiskGiB: 160, cleanStopPlanned: true,
};

function main() {
  const r = PF.preflight(good);
  check("all isolation preconditions satisfied ⇒ READY_TO_EXECUTE", r.ready === "READY_TO_EXECUTE" && r.failedChecks.length === 0);
  check("execution ALWAYS requires separate owner auth; C9/C8 execution stays gated (readiness ≠ execution)", r.requiresSeparateAuth === true && r.c9ExecutionGated === true && r.c8ExecutionGated === true);

  // deny-by-default: empty facts ⇒ BLOCKED, never READY by omission.
  check("deny-by-default: empty facts ⇒ BLOCKED", PF.preflight({}).ready === "BLOCKED" && PF.preflight({}).failedChecks.length >= 8);

  // each precondition has teeth.
  check("slot UNDER the active-release root ⇒ BLOCKED", PF.preflight({ ...good, isolatedSlot: "/home/ubuntu/odg-releases/rel-x" }).failedChecks.includes("slot-outside-active-release"));
  check("port == active :3000 ⇒ BLOCKED", PF.preflight({ ...good, candidatePort: 3000 }).failedChecks.includes("port-distinct-from-active"));
  check("not loopback-only ⇒ BLOCKED", PF.preflight({ ...good, loopbackOnly: false }).failedChecks.includes("loopback-only"));
  check("public bind ⇒ BLOCKED", PF.preflight({ ...good, noPublicBind: false }).failedChecks.includes("no-public-bind"));
  check("proxy/systemd change ⇒ BLOCKED", PF.preflight({ ...good, noProxyChange: false }).failedChecks.includes("no-proxy-change") && PF.preflight({ ...good, noSystemdChange: false }).failedChecks.includes("no-systemd-change"));
  check("insufficient resources ⇒ BLOCKED", PF.preflight({ ...good, freeMemMiB: 100 }).failedChecks.includes("resources-safe") && PF.preflight({ ...good, freeDiskGiB: 1 }).failedChecks.includes("resources-safe"));
  check("artifact identity not verified ⇒ BLOCKED (never deploy an unverified artifact)", PF.preflight({ ...good, artifactIdentityVerified: false }).failedChecks.includes("artifact-identity-verified"));
  check("no clean-stop planned ⇒ BLOCKED", PF.preflight({ ...good, cleanStopPlanned: false }).failedChecks.includes("clean-stop-planned"));

  // protocol is documented DATA (nothing executed): loopback health, distinct port, clean stop.
  check("protocol documents loopback /api/health + distinct free port + clean stop + post-stop verify", /127\.0\.0\.1:<PORT>\/api\/health/.test(PF.ISOLATION_PROTOCOL.health) && /next start -p <PORT> -H 127\.0\.0\.1/.test(PF.ISOLATION_PROTOCOL.start) && /post-stop|no residual|LEAK|CLEAN/i.test(PF.ISOLATION_PROTOCOL.stop));
  check("safety limits: loopback-only, port must differ from active, bounded duration", PF.SAFETY_LIMITS.loopbackOnly === true && PF.SAFETY_LIMITS.portMustDifferFrom === PF.ACTIVE_PORT && PF.SAFETY_LIMITS.maxTestDurationSec <= 300);

  // determinism + frozen + contract.
  check("deterministic + frozen", JSON.stringify(PF.preflight(good)) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(PF.ISOLATION_PROTOCOL));
  check("contract: executes-nothing + deny-by-default + slot-outside-active + PARTIAL-until-executed invariants", PF.VPS_VALIDATION_PREFLIGHT_CONTRACT.invariants.some((i: string) => /EXECUTES NOTHING/.test(i)) && PF.VPS_VALIDATION_PREFLIGHT_CONTRACT.invariants.some((i: string) => /deny-by-default/.test(i)) && PF.VPS_VALIDATION_PREFLIGHT_CONTRACT.invariants.some((i: string) => /OUTSIDE the active-release root/.test(i)) && PF.VPS_VALIDATION_PREFLIGHT_CONTRACT.invariants.some((i: string) => /PARTIAL until a separately-authorized execution/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-vps-validation-preflight (V297: prepares C9 start/health + C8 perf; EXECUTES NOTHING; deny-by-default readiness [slot outside active release, port≠3000, loopback-only, no public bind, resources], execution ALWAYS needs separate owner auth, protocol documented as data; C9/C8 stay PARTIAL until a separately-authorized execution)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
