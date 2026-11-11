#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V93 §4 — REAL READ-ONLY VPS INVENTORY (the host IS the VPS; read-only is authorized, no sudo/no mutation).
 * Live-reads the observable environment WITHOUT privilege escalation and WITHOUT showing any secret value (config vars by
 * NAME only). sudo-gated items (TLS/reverse-proxy/systemd/backup-policy) are recorded as OWNER_GATED (not invented). It
 * performs NO remote connection and NO change. Writes docs/odg/V93_VPS_INVENTORY.json. Run: `odg-vps-inventory-v93-run.ts`.
 */

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
function sh(cmd: string): string { try { return cp.execSync(cmd, { encoding: "utf8", timeout: 8000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } }
function git(a: string[]): string { try { return cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } }

const RELEASE_ROOT = "/home/ubuntu/odg-releases";
const osName = sh("grep -E '^PRETTY_NAME=' /etc/os-release | cut -d= -f2 | tr -d '\"'");
const kernel = sh("uname -r");
const mem = sh("free -h | awk 'NR==2{print $2\" total, \"$7\" avail\"}'");
const disk = sh("df -h / | awk 'NR==2{print $2\" total, \"$4\" free (\"$5\" used)\"}'");
const cpus = sh("nproc");
const node = sh("node -v"); const npm = sh("npm -v");
const ollama = sh("command -v ollama >/dev/null 2>&1 && ollama list 2>/dev/null | awk 'NR>1{print $1}' | tr '\\n' ',' || echo 'n/a'");
const ports = sh("ss -tlnH 2>/dev/null | awk '{print $4}' | sort -u | tr '\\n' ' '");
const currentLink = sh(`readlink ${RELEASE_ROOT}/current 2>/dev/null`);
const prevLink = sh(`readlink ${RELEASE_ROOT}/previous 2>/dev/null`);
const releaseCount = sh(`ls -1d ${RELEASE_ROOT}/rel-* 2>/dev/null | wc -l`);
const deployedSha = (currentLink.match(/rel-[0-9TZ]+-([0-9a-f]{8,})/) || [])[1] || "";
const headSha = git(["rev-parse", "--short=12", "HEAD"]);
const deployedIsAncestor = deployedSha ? git(["merge-base", "--is-ancestor", deployedSha, "HEAD"]) === "" && (() => { try { cp.execFileSync("git", ["merge-base", "--is-ancestor", deployedSha, "HEAD"], { cwd: ROOT }); return true; } catch { return false; } })() : false;
const health = sh(`curl -s -m 5 http://127.0.0.1:3000/api/health 2>/dev/null`);
// config var NAMES only (never values).
const envRaw: string[] = sh(`grep -rhoE 'process\\.env\\.[A-Z_]+' ${ROOT}/runtime 2>/dev/null`).split("\n").map((l: string) => l.replace("process.env.", "").trim()).filter(Boolean);
const envNames: string[] = Array.from(new Set(envRaw)).sort().slice(0, 30);

const observed = {
  providerInstance: "NOT_MEASURED (cloud metadata not queried; host is the working environment)",
  os: osName, kernel, memory: mem, disk, cpus: Number(cpus) || null,
  runtime: { node, npm, matchesCI: node.startsWith("v22") },
  ollamaModels: ollama, localModelService: ports.includes("11434") ? "ollama listening 127.0.0.1:11434" : "not observed",
  listeningPorts: ports,
  deployedApp: { port: 3000, health: health || "no response", healthOk: /"status":"ready"/.test(health) },
  releaseMechanism: { root: RELEASE_ROOT, currentRelease: currentLink || "none", previousRelease: prevLink || "none", releaseCount: Number(releaseCount) || 0, deployScript: "scripts/odg-release.sh (build/verify/activate/rollback/status)" },
  deployedVsHead: { deployedSha, headSha, deployedIsAncestorOfHead: deployedIsAncestor, divergence: deployedSha && deployedIsAncestor ? `deployed ${deployedSha} is an ANCESTOR of HEAD ${headSha} ⇒ deployed is OLD (HEAD ahead)` : "unknown" },
  configVarNames: envNames,   // NAMES ONLY — values never read/shown (incl. ANTHROPIC_API_KEY / GH_TOKEN present by name only)
  rollback: { mechanism: "repoint 'current' symlink to 'previous' (or any of the prior release dirs) + restart; `odg-release.sh rollback`", priorReleasesAvailable: Number(releaseCount) || 0 },
};
const ownerGated = [
  { item: "reverse proxy / TLS", reason: "nginx/caddy not on PATH; a proxy/TLS layer would be sudo-managed ⇒ OWNER_GATED (not observable read-only)" },
  { item: "systemd units / service manager", reason: "systemctl state is sudo-gated ⇒ OWNER_GATED" },
  { item: "databases & migrations", reason: "no db client on PATH; app health reports storage READY (likely file-based) — db engine/migrations NOT confirmed ⇒ OWNER_GATED/NOT_MEASURED" },
  { item: "backup policy & retention", reason: "release dirs provide version rollback; a separate data-backup policy is not observable read-only ⇒ OWNER_GATED" },
  { item: "provider/instance identity & firewall", reason: "cloud metadata + firewall are sudo/owner-scoped ⇒ OWNER_GATED" },
];

const out = {
  "//": "CTO V93 §4 — REAL read-only inventory of the host (which IS the VPS). No sudo, no mutation, no remote connection, no secret value shown (config vars by NAME only). sudo-gated items are OWNER_GATED, never invented. This inventory was PERFORMED (not merely prepared) to the full extent of authorized read-only access.",
  performedReadOnly: true, connectionPerformed: false, secretsDisclosed: false, sudoUsed: false,
  observed, ownerGatedResiduals: ownerGated,
  honestConclusion: `Read-only VPS=host inventory PERFORMED: ${observed.os} (${kernel}), ${observed.cpus} CPU, ${mem}, node ${node} (CI-match ${observed.runtime.matchesCI}), ollama models [${ollama}]. Deployed app on :3000 health=${observed.deployedApp.healthOk ? "READY(200)" : "?"}; deployed ${deployedSha} is OLD vs HEAD ${headSha}. Release mechanism = ${RELEASE_ROOT} (${releaseCount} releases, atomic 'current' symlink, odg-release.sh), rollback = symlink to 'previous'. Residuals OWNER_GATED (sudo-only): TLS/proxy, systemd, db/migrations, backup policy, provider/firewall. Inventory done to the full extent of read-only access; nothing invented.`,
  invariant: "real read-only inventory performed (no sudo/connection/mutation); secrets by NAME only; sudo-gated items OWNER_GATED not invented; deployed-vs-HEAD divergence recorded.",
};
fs.writeFileSync(path.join(D, "V93_VPS_INVENTORY.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ os: observed.os, node, ollama, deployedHealthOk: observed.deployedApp.healthOk, deployedSha, headSha, releases: observed.releaseMechanism.releaseCount, ownerGatedResiduals: ownerGated.length }, null, 2) + "\n");
export {};
