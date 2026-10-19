#!/usr/bin/env node
/**
 * odg-maintenance-check — P5 actionable maintenance alerter (READ-ONLY observe + append alert artifact).
 * Gathers best-effort maintenance signals (health code, disk%, mem%, service NRestarts, newest-backup age,
 * release-current presence), evaluates them via the pure maintenance-alerts core, prints every alert, and
 * appends NEW (deduped vs the previous run) WARN/CRIT alerts to runtime/generated/maintenance-alerts.jsonl.
 * It NEVER remediates (restart/rollback/firewall/backup are reserved actions) — it only surfaces a signal.
 * Exit 1 if any CRIT is present, else 0. A signal that can't be observed is reported INFO *_UNKNOWN (honest).
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { execSync, execFileSync } = require("child_process");
const { evaluateMaintenance, newAlerts } = require(path.resolve(__dirname, "..", "core", "maintenance-alerts.js"));

function tryq(fn) { try { return fn(); } catch { return null; } }

function healthCode() {
  return tryq(() => {
    const out = execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", "http://127.0.0.1:3000/api/health"], { encoding: "utf8" });
    const c = parseInt(String(out).trim(), 10);
    return Number.isFinite(c) && c > 0 ? c : null;
  });
}
function diskPct() {
  return tryq(() => {
    const out = execSync(`df --output=pcent ${JSON.stringify(process.cwd())}`, { encoding: "utf8" });
    const m = String(out).match(/(\d+)%/);
    return m ? Number(m[1]) : null;
  });
}
function memPct() {
  return tryq(() => {
    const out = execSync("free | awk '/Mem:/{printf \"%d\", $3/$2*100}'", { encoding: "utf8" });
    const v = parseInt(String(out).trim(), 10);
    return Number.isFinite(v) ? v : null;
  });
}
function nRestarts() {
  return tryq(() => {
    const out = execFileSync("systemctl", ["show", "odg-preprod", "-p", "NRestarts", "--value"], { encoding: "utf8" });
    const v = parseInt(String(out).trim(), 10);
    return Number.isFinite(v) ? v : null;
  });
}
function backupAgeDays() {
  // Newest file under the known local vault; unreadable/absent ⇒ null (⇒ INFO unknown, never a false "fresh").
  for (const dir of ["/var/backups/odg-vault", path.join(process.env.HOME || "/home/ubuntu", "odg-backups")]) {
    const age = tryq(() => {
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir).map((f) => path.join(dir, f));
      let newest = 0;
      for (const f of files) { const st = tryq(() => fs.statSync(f)); if (st && st.mtimeMs > newest) newest = st.mtimeMs; }
      if (!newest) return null;
      return Math.floor((Date.now() - newest) / 86400000);
    });
    if (age !== null) return age;
  }
  return null;
}
function releaseCurrentPresent() {
  const root = process.env.ODG_RELEASE_ROOT || path.join(process.env.HOME || "/home/ubuntu", "odg-releases");
  const cur = path.join(root, "current");
  return tryq(() => fs.existsSync(cur)) === true ? true : (tryq(() => fs.existsSync(root)) ? false : null);
}

function priorIds(file) {
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (!lines.length) return [];
    const last = JSON.parse(lines[lines.length - 1]);
    return Array.isArray(last.ids) ? last.ids : [];
  } catch { return []; }
}

function main() {
  const signals = {
    healthCode: healthCode(),
    diskUsedPct: diskPct(),
    memUsedPct: memPct(),
    nRestarts: nRestarts(),
    backupAgeDays: backupAgeDays(),
    releaseCurrentPresent: releaseCurrentPresent(),
  };
  const r = evaluateMaintenance(signals);
  console.log(`Maintenance: ${r.ok ? "OK" : "ATTENTION"}  (CRIT=${r.counts.CRIT} WARN=${r.counts.WARN} INFO=${r.counts.INFO})`);
  for (const a of r.alerts) console.log(`  [${a.severity}] ${a.id}: ${a.reason}`);

  // Steady-state status (every run) — the single source odg-health reads read-only for a freshness summary.
  try {
    const STATUS = path.resolve(process.cwd(), "runtime", "generated", "maintenance-status.json");
    fs.mkdirSync(path.dirname(STATUS), { recursive: true });
    fs.writeFileSync(STATUS, JSON.stringify({ at: new Date().toISOString(), ok: r.ok, CRIT: r.counts.CRIT, WARN: r.counts.WARN, INFO: r.counts.INFO }));
  } catch { /* status is best-effort */ }

  const FILE = path.resolve(process.cwd(), "runtime", "generated", "maintenance-alerts.jsonl");
  const actionable = r.alerts.filter((a) => a.severity === "CRIT" || a.severity === "WARN");
  const fresh = newAlerts(actionable, priorIds(FILE));
  if (fresh.length) {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.appendFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), ids: actionable.map((a) => a.id), fresh: fresh.map((a) => a.id), alerts: actionable }) + "\n");
      console.log(`  alert       : ${fresh.length} new actionable alert(s) appended to ${FILE}`);
    } catch { /* non-blocking */ }
  } else if (actionable.length) {
    console.log("  alert       : (all actionable alerts deduped — unchanged since last run)");
  }
  process.exit(r.counts.CRIT > 0 ? 1 : 0);
}

main();
