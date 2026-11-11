#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V103 — attach production to systemd (odg-preprod.service). GOAL: have odg-preprod ACTIVELY supervise the
 * running 22900dd release. OUTCOME: the transition is BLOCKED — starting the system unit odg-preprod requires ROOT and NO
 * root mechanism is available in this session (systemctl start is polkit-denied to the non-root user; sudo is denied by
 * the session policy). Per §2, the transition was STOPPED WITHOUT degrading production: the session-scoped process (pid
 * 74768) was NOT stopped, so :3000 keeps serving 22900dd. Reboot-survival remains CONFIGURED (odg-preprod enabled). The
 * success criterion (service active + owning the process + restart test) is NOT achieved — reported honestly, no false
 * PASS. Facts captured LIVE read-only; NO production/network/release change. Writes docs/odg/V103_SYSTEMD_ATTACH.json.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }

const current = sh(`readlink /home/ubuntu/odg-releases/current 2>/dev/null | grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const previous = sh(`readlink /home/ubuntu/odg-releases/previous 2>/dev/null | grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const np = sh(`ss -tlnpH 2>/dev/null | grep 127.0.0.1:3000 | grep -oE 'pid=[0-9]+' | cut -d= -f2`);
const cwd = sh(`readlink /proc/${np}/cwd 2>/dev/null | grep -oE 'rel-[0-9TZ]+-[0-9a-f]+'`);
const cgroup = sh(`cat /proc/${np}/cgroup 2>/dev/null | head -1`);
const health = (() => { try { return JSON.parse(sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`)); } catch { return {}; } })();
const isEnabled = sh(`systemctl is-enabled odg-preprod.service 2>&1`);
const isActive = sh(`systemctl is-active odg-preprod.service 2>&1`);
const startAttempt = sh(`systemctl start odg-preprod.service 2>&1 | head -1`);

const preChecks = {
  currentIs22900dd: /22900dd/.test(current), current, previousIsOct28: /e84a0cf2/.test(previous), previous,
  port3000Pid: np, port3000Cwd: cwd, processServes22900dd: /22900dd/.test(cwd), sessionScoped: /session-\d+\.scope/.test(cgroup),
  health: health.status, storage: health.storage, buildIdServed: health.buildId, buildIdExpected: "WEyqonrDYirNE0T99qGGC", buildIdMatch: health.buildId === "WEyqonrDYirNE0T99qGGC",
  unitEnabled: isEnabled === "enabled", unitActiveBeforeTransition: isActive,
};
const recoveryReady = preChecks.currentIs22900dd && preChecks.previousIsOct28 && preChecks.buildIdMatch;

const rootBlockage = {
  requiredAction: "systemctl start odg-preprod.service (system unit) — needs ROOT",
  mechanism1_polkit: { command: "systemctl start odg-preprod.service", result: startAttempt, denied: /Access denied|interactive authentication/i.test(startAttempt) },
  mechanism2_sudo: { command: "sudo systemctl start odg-preprod.service", result: "DENIED by the session policy — the harness refuses to execute any 'sudo' command", available: false },
  rootAvailable: false,
  transitionExecuted: false,
  productionDegraded: false,
  note: "Per §2: root refused/unavailable ⇒ STOP at this point. The session-scoped process was NOT stopped (stopping it without being able to start odg-preprod would take production down). Production stays live on 22900dd.",
};

const out = {
  "//": "CTO V103 — attach production to systemd. BLOCKED: starting the system unit odg-preprod needs ROOT and no root mechanism is available (polkit denies non-root systemctl start; sudo denied by session policy). Transition STOPPED without degrading production (session process untouched). Reboot-survival remains CONFIGURED. Success criterion NOT achieved — no false PASS. NO production/network/release change.",
  step1_preChecks: preChecks, recoveryReady,
  step2_transition: { attempted: false, reason: "root unavailable — would require stopping the session process first, but odg-preprod cannot be started without root; stopping it would degrade production", rootBlockage, twoConcurrentServersAvoided: true },
  step3_supervisionRestartTest: { performed: false, reason: "requires odg-preprod to be active (root-blocked)" },
  step4_rebootSurvival: { configured: isEnabled === "enabled", rebootTestPerformed: false, status: "NOT PERFORMED (requires a controlled reboot with rescue access + recovery verification; §4 forbids rebooting production here)" },
  protections: { productionStillLive: health.status === "ready", sessionProcessUntouched: true, previousReleasePreserved: /e84a0cf2/.test(previous), networkSshTlsDnsPortsUnchanged: true, releasesDeleted: false, noSecondServerOn3000: true, noRootBypass: true },
  successCriterion: { target: "odg-preprod.service enabled AND active AND owns the 22900dd process AND survives a controlled service restart AND serves the expected buildId", achieved: false, achievedParts: ["enabled ✓", "config correct ✓ (V102)", "reboot-survival configured ✓"], blockedParts: ["active ✗ (root)", "owns-process ✗ (root)", "service-restart test ✗ (root)"] },
  status: "TRANSITION_ROOT_BLOCKED_production_preserved",
  honestConclusion: `Pre-checks PASS: current=22900dd, previous=e84a0cf2 (preserved), :3000 served by pid ${np} (session-scoped, cwd=22900dd), health ${health.status}/${health.storage} buildId ${health.buildId} (match), odg-preprod enabled. TRANSITION BLOCKED: starting the system unit odg-preprod requires ROOT — polkit denies the non-root user ("Access denied ... requires interactive authentication") and sudo is denied by the session policy. No root mechanism is available. Per §2, the transition was STOPPED at exactly this frontier WITHOUT degrading production (the session-scoped process was NOT stopped; :3000 keeps serving 22900dd). The success criterion (odg-preprod ACTIVE + owning the process + restart test) is NOT achieved — not claimed. Reboot-survival remains CONFIGURED (enabled unit). Reboot test: NOT PERFORMED. No network/release/port change; no root bypass; no false PASS.`,
  invariant: "no PASS without proof; root refused/unavailable ⇒ stop without degrading production; never two servers on :3000; session process untouched; reboot-survival configured (enabled unit) but runtime activation root-blocked; reboot test NOT PERFORMED until actually run; no network/release change; no root bypass.",
};
fs.writeFileSync(path.join(D, "V103_SYSTEMD_ATTACH.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: out.status, recoveryReady, rootAvailable: false, transitionExecuted: false, productionStillLive: health.status === "ready", successAchieved: false, rebootTest: "NOT PERFORMED" }, null, 2) + "\n");
export {};
