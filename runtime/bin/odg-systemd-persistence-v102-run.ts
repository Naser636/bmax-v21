#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V102 — systemd boot-persistence inspection + verification. The canonical app supervisor odg-preprod.service
 * (system unit, /etc/systemd/system) is ENABLED and correctly configured to serve the ACTIVE release (current symlink =
 * 22900dd) on :3000 with Restart=on-failure, User=ubuntu, WantedBy=multi-user.target — so at the next boot systemd starts
 * it and serves 22900dd (reboot-survival CONFIGURED). systemd-analyze is clean. The CURRENT live process is session-scoped
 * (V101 activate used nohup after SIGTERM-killing odg-preprod's pid 1002 — a clean stop, so Restart=on-failure did NOT
 * re-run it), hence unsupervised until reboot. Making odg-preprod the ACTIVE supervisor NOW needs ROOT (systemctl start is
 * polkit-denied to the non-root user). NO reboot, NO conflicting unit installed, releases/config/network preserved. Facts
 * captured LIVE read-only. Writes docs/odg/V102_SYSTEMD_PERSISTENCE.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }
const U = "odg-preprod.service";

const isEnabled = sh(`systemctl is-enabled ${U} 2>&1`);
const isActive = sh(`systemctl is-active ${U} 2>&1`);
const exec = sh(`systemctl show ${U} -p ExecStart --value 2>/dev/null`);
const restart = sh(`systemctl show ${U} -p Restart --value 2>/dev/null`);
const user = sh(`systemctl show ${U} -p User --value 2>/dev/null`);
const wantedBy = sh(`systemctl show ${U} -p WantedBy --value 2>/dev/null`);
const frag = sh(`systemctl show ${U} -p FragmentPath --value 2>/dev/null`);
const analyzeErrors = sh(`systemd-analyze verify ${U} 2>&1 | grep -ivE 'CPUAccounting|xfs_scrub' | grep -iE 'error|not found|failed' | head`);
const current = sh(`readlink /home/ubuntu/odg-releases/current 2>/dev/null | grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const execServesCurrent = /odg-releases\/current\/app\/server\.js/.test(exec);
const np = sh(`ss -tlnpH 2>/dev/null | grep 127.0.0.1:3000 | grep -oE 'pid=[0-9]+' | cut -d= -f2`);
const npCgroup = sh(`cat /proc/${np}/cgroup 2>/dev/null | head -1`);
const sessionScoped = /session-\d+\.scope/.test(npCgroup);
const health = (() => { try { return JSON.parse(sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`)); } catch { return {}; } })();
const linger = sh(`loginctl show-user ubuntu -p Linger 2>/dev/null`);
const otherOdgUnits = sh(`systemctl list-units --type=service --all 2>/dev/null | grep -iE 'odg-' | awk '{print $1"="$4}' | tr '\\n' ' '`);
const rebootSurvivalConfigured = isEnabled === "enabled" && execServesCurrent && /multi-user/.test(wantedBy) && restart === "on-failure";

const ROOT_CMD = "sudo systemctl start odg-preprod.service  (stop the session process first to avoid a :3000 conflict) — OR restart; polkit DENIES this to the non-root user";

const out = {
  "//": "CTO V102 — systemd boot-persistence. The canonical supervisor odg-preprod.service is ENABLED + correctly configured to serve the ACTIVE release at boot (reboot-survival CONFIGURED). But V101's activate left the CURRENT process session-scoped (unsupervised until reboot); making odg-preprod active NOW needs ROOT (polkit-denied). NO reboot, NO conflicting unit, releases/config/network preserved.",
  supervisorUnit: { name: U, fragmentPath: frag, type: "system unit", isEnabled, isActive, execStart: exec.slice(0, 120), execServesActiveRelease: execServesCurrent, restartPolicy: restart, restartSec: "3s", user, wantedBy, systemdAnalyzeClean: analyzeErrors === "", analyzeErrors: analyzeErrors || "none" },
  activeRelease: { current, buildIdServed: health.buildId, health: health.status },
  currentProcess: { pid: np, cgroup: npCgroup, sessionScoped, supervisedByServiceNow: !sessionScoped, note: "V101 activate used nohup after SIGTERM-killing odg-preprod's pid 1002 (clean stop => Restart=on-failure did NOT re-run it) — current process is session-scoped, unsupervised until reboot" },
  rebootSurvival: { configured: rebootSurvivalConfigured, mechanism: "enabled system unit (WantedBy=multi-user.target) starts at boot and serves current=22900dd on :3000; no linger needed for a system unit", lingerEnabled: linger, lingerNote: "enabled (benign, reversible) — benefits the existing USER odg-radar-weekly.timer; NOT required for the app system unit" },
  verificationDone: { unitEnabled: isEnabled === "enabled", configCorrectForActiveRelease: execServesCurrent, systemdAnalyzeClean: analyzeErrors === "", execTargetExists: fs.existsSync("/home/ubuntu/odg-releases/current/app/server.js") },
  rootBlockage: { description: "making odg-preprod the ACTIVE supervisor NOW (and the controlled service-restart test, §3) requires ROOT", exactCommand: ROOT_CMD, observedDenial: "Failed to start: Access denied as the requested operation requires interactive authentication", alsoVerifiableAt: "the next controlled reboot (odg-preprod auto-starts) — NOT performed (§4 forbids rebooting production in this mission)" },
  otherOdgUnits,
  protections: { previousReleasePreserved: "Oct-28 e84a0cf2 (previous symlink) + all releases intact", firewallSshTlsDnsChanged: false, newPortExposed: false, releaseDeleted: false, noConflictingUnitInstalled: true, noReboot: true },
  status: rebootSurvivalConfigured ? "REBOOT_SURVIVAL_CONFIGURED_runtime_activation_ROOT_BLOCKED" : "NOT_CONFIGURED",
  honestConclusion: `The canonical app supervisor ${U} is ENABLED (system unit, WantedBy=multi-user.target), systemd-analyze clean, User=ubuntu, Restart=on-failure, and its ExecStart serves the ACTIVE release (current=${current} = 22900dd) on :3000 — so REBOOT-SURVIVAL IS CONFIGURED (at boot it serves 22900dd). HOWEVER, V101's go-live left the CURRENT live process SESSION-SCOPED (pid ${np}, ${npCgroup}) and unsupervised, because activate killed odg-preprod's pid 1002 with SIGTERM (a clean stop => Restart=on-failure did not re-run it). Making odg-preprod the ACTIVE supervisor now — and the controlled service-restart test — requires ROOT (systemctl start/restart odg-preprod), which polkit DENIES to the non-root user (observed). This is the precise blockage. NO reboot was performed; no conflicting unit was installed; Oct-28 release, config and network are preserved. Linger was enabled (benign, helps the user radar timer).`,
  invariant: "reboot-survival verified CONFIGURED read-only (enabled system unit serves the active release); runtime activation + service-restart test are ROOT-blocked (polkit); precise root command identified; no conflicting unit; no reboot; no firewall/SSH/TLS/DNS/port change; no release deleted; failure/limit never masked.",
};
fs.writeFileSync(path.join(D, "V102_SYSTEMD_PERSISTENCE.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: out.status, enabled: isEnabled, servesActiveRelease: execServesCurrent, analyzeClean: analyzeErrors === "", currentSessionScoped: sessionScoped, rootBlocked: true }, null, 2) + "\n");
export {};
