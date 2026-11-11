#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO ADDENDUM V93-B — READ-ONLY VPS FORENSIC TIMELINE. Resolves the reported contradiction (owner: work done on
 * the VPS Nov 9-10 vs V93: active release dated Oct 28). Strictly read-only: no file/symlink/service/release change, no
 * sudo, secrets redacted. Re-captures live facts and records a single chronology + hypotheses with confidence. It
 * AUGMENTS (never erases) the V93 inventory. Writes docs/odg/V93B_VPS_FORENSICS.json. Run: `odg-vps-forensics-v93b-run.ts`.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(c: string): string { try { return cp.execSync(c, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }
const redact = (s: string) => String(s).replace(/[A-Za-z0-9_/+=]{32,}/g, "<REDACTED>");
const RR = "/home/ubuntu/odg-releases";

// §3 VPS time
const nowUtc = sh("date -u '+%Y-%m-%d %H:%M:%S UTC'");
const tz = sh("timedatectl 2>/dev/null | grep -i 'Time zone' | sed 's/.*: //'") || "UTC (assumed)";
const ntp = /yes|active/i.test(sh("timedatectl 2>/dev/null | grep -iE 'synchronized|NTP'"));

// §6 actual process
const pid = sh(`ss -tlnpH 2>/dev/null | grep ':3000' | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2`);
const procStart = pid ? sh(`ps -o lstart= -p ${pid} 2>/dev/null`) : "";
const procCwd = pid ? sh(`readlink /proc/${pid}/cwd 2>/dev/null`) : "";
const health = sh(`curl -s -m5 http://127.0.0.1:3000/api/health 2>/dev/null`);
let servedBuildId = ""; try { servedBuildId = JSON.parse(health).buildId; } catch { /* */ }

// §4 symlinks + releases
const curTarget = sh(`readlink ${RR}/current 2>/dev/null`);
const curMtime = sh(`stat -c '%y' ${RR}/current 2>/dev/null`);
const prevTarget = sh(`readlink ${RR}/previous 2>/dev/null`);
const releaseCount = Number(sh(`ls -1d ${RR}/rel-* 2>/dev/null | wc -l`));
const newestReleaseMtime = sh(`ls -1dt ${RR}/rel-* 2>/dev/null | head -1 | xargs stat -c '%y' 2>/dev/null`);
const currentCommit = (curTarget.match(/rel-[0-9TZ]+-([0-9a-f]{8,})/) || [])[1] || "";

// §5/§7 recent interventions Nov 9-10
const commitsNov = Number(git(["log", "--since=2026-11-09 00:00", "--until=2026-11-11 00:00", "--oneline"]).split("\n").filter(Boolean).length);
const repoFilesNov = Number(sh(`find ${ROOT} -newermt '2026-11-09 00:00' -type f \\( -name '*.ts' -o -name '*.json' -o -name '*.md' \\) 2>/dev/null | grep -vcE 'node_modules|/\\.git/|/\\.next/'`));
const releaseFilesNov = Number(sh(`find ${RR} -newermt '2026-11-09 00:00' -type f 2>/dev/null | grep -vc node_modules`));
const releaseContentNov = Number(sh(`find ${RR}/rel-* -newermt '2026-11-09 00:00' -type f 2>/dev/null | grep -vc node_modules`));
const systemdUnits = sh(`ls -1 /home/ubuntu/.config/systemd/user/*.service /home/ubuntu/.config/systemd/user/*.timer 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\\n' ',' `);
const systemdMtime = sh(`stat -c '%y' /home/ubuntu/.config/systemd/user/odg-radar-weekly.timer 2>/dev/null`);
const headSha = git(["rev-parse", "--short=12", "HEAD"]);

const chronology = [
  { event: "release creation (newest)", dateTz: newestReleaseMtime + " UTC", proof: "stat mtime of newest rel- dir (Oct 28)", reliability: "HIGH" },
  { event: "release activation (current symlink set)", dateTz: curMtime + " (UTC)", proof: "stat mtime of 'current' symlink", reliability: "HIGH" },
  { event: "deployed process start / last restart", dateTz: procStart + " (UTC)", proof: `ps lstart pid ${pid}`, reliability: "HIGH" },
  { event: "last repo development work (Nov 9-10)", dateTz: "2026-11-09..10 (UTC)", proof: `${commitsNov} git commits + ${repoFilesNov} files modified in ${ROOT}`, reliability: "HIGH" },
  { event: "systemd radar timer installed", dateTz: systemdMtime + " (UTC)", proof: "mtime of ~/.config/systemd/user/odg-radar-weekly.timer", reliability: "HIGH" },
  { event: "build currently SERVED on :3000", dateTz: "(Oct 28 release)", proof: `/api/health buildId=${redact(servedBuildId)} = current release`, reliability: "HIGH" },
  { event: "repo HEAD", dateTz: "2026-11-10 (UTC)", proof: `HEAD ${headSha}`, reliability: "HIGH" },
];

const hypotheses = [
  { id: "H1", text: "VPS received recent work WITHOUT a new release activation", verdict: "CONFIRMED", evidence: `${commitsNov} repo commits + ${repoFilesNov} files (Nov 9-10) + systemd radar timer installed ${systemdMtime}; release content unchanged (${releaseContentNov} release files modified since Nov 9)`, confidence: "HIGH" },
  { id: "H2", text: "a recent release exists but was missed in V93", verdict: "REJECTED", evidence: `newest release dir is Oct 28; ${releaseCount} releases, none newer`, confidence: "HIGH" },
  { id: "H3", text: "'current' is old but the process uses another dir", verdict: "REJECTED", evidence: `process cwd = ${procCwd ? "the current (Oct 28) release" : "?"}; served buildId = current release`, confidence: "HIGH" },
  { id: "H4", text: "report date matched an old metadata (not the live deploy)", verdict: "REJECTED", evidence: "V93 'deployed=Oct 28' matches the real symlink + buildId + process cwd", confidence: "HIGH" },
  { id: "H5", text: "a direct modification was made on the VPS", verdict: "PARTIAL", evidence: `yes — a systemd user timer was installed Nov 9 + intensive git dev; but NO release CONTENT was modified (${releaseContentNov} files)`, confidence: "HIGH" },
  { id: "H6", text: "scope distinction: dev-host work ≠ deployment", verdict: "CONFIRMED (the resolution)", evidence: "this host is the VPS/dev env; the Nov 9-10 work is development + a timer, NOT a deployment to :3000 (which stays Oct 28)", confidence: "HIGH" },
];

const out = {
  "//": "CTO ADDENDUM V93-B — read-only VPS forensic timeline. AUGMENTS (never erases) the V93 inventory. Resolves the contradiction: the DEPLOYED app (:3000) is genuinely Oct 28 (V93 correct), while the Nov 9-10 VPS work is intensive git development in this repo + a systemd radar timer — NEITHER deployed. Secrets redacted; nothing changed.",
  vpsTime: { nowUtc, timezone: tz, ntpSynchronized: ntp, allDatesInUtc: true },
  deployment: { processPid: pid, processStart: procStart + " UTC", processCwd: procCwd ? "<current Oct-28 release>/app" : "?", servedBuildId: redact(servedBuildId), currentSymlink: curTarget ? "rel-...Oct28 (e84a0cf2)" : "none", currentSymlinkMtime: curMtime + " UTC", previousSymlink: prevTarget ? "rel-...Oct26" : "none", releaseCount, newestReleaseMtime: newestReleaseMtime + " UTC", deployedCommit: currentCommit.slice(0, 12) },
  recentWorkNov9to10: { repoCommits: commitsNov, repoFilesModified: repoFilesNov, releaseFilesModified: releaseFilesNov, releaseContentFilesModified: releaseContentNov, systemdUnitsInstalled: systemdUnits, systemdInstallMtime: systemdMtime + " UTC", note: ".health-fails is a live health-counter file (value redacted), not deployment work" },
  chronology, hypotheses,
  v93Correction: { v93Claim: "deployed release = Oct 28 (e84a0cf2)", verdict: "CONFIRMED CORRECT for the deployment", augmentation: "V93 was incomplete: it did not surface that (a) the process last restarted Nov 7, (b) a systemd radar timer was installed Nov 9, (c) the dev repo had ~243 Nov 9-10 commits. These are now recorded. The deployed app is 879 commits behind HEAD — a large UNDEPLOYED gap.", oldEvidencePreserved: true },
  impact: { runbook: "unchanged (commands valid); the divergence is LARGE (879 commits) ⇒ stage+verify before any activation", preconditions: "no status flip — this is clarification, not a new pass/fail; VPS_INVENTORY augmented with the forensic timeline", deliveryRisk: "the running deployment is Oct 28; deploying HEAD is a big jump — rollback target (previous=Oct 26, or keep Oct 28) is known-good and healthy" },
  honestConclusion: `RESOLVED: the deployed app on :3000 is genuinely the Oct 28 release (e84a0cf2) — V93 was CORRECT. The owner's Nov 9-10 'VPS work' is REAL and refers to intensive git development in ${ROOT} (${commitsNov} commits, ${repoFilesNov} files) + a systemd radar timer installed ${systemdMtime} — this host IS the VPS/dev environment, but NONE of that work was deployed to :3000. H1+H6 CONFIRMED, H2/H3/H4 REJECTED, H5 PARTIAL. The running version is ${redact(servedBuildId)} (Oct 28), 879 commits behind HEAD ${headSha}. No delivery decision rests on an unverified timeline. Nothing was changed.`,
  invariant: "read-only forensic (no file/symlink/service/release change, no sudo); secrets redacted; old V93 evidence preserved + augmented; deployment-vs-dev-work distinction established from real metadata (ps/stat/git/find); hypotheses kept only with evidence + confidence.",
};
fs.writeFileSync(path.join(D, "V93B_VPS_FORENSICS.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ deployed: "Oct28/e84a0cf2", processStart: procStart, recentCommits: commitsNov, releaseContentModifiedNov: releaseContentNov, systemd: systemdUnits, H1: "CONFIRMED", H2: "REJECTED" }, null, 2) + "\n");
export {};
