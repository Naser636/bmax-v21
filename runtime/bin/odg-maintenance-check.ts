#!/usr/bin/env node
"use strict";

/*
 * odg-maintenance-check — P5 actionable maintenance alerting CLI (READ-ONLY). TS port → runtime/dist/bin/
 * odg-maintenance-check.js (the canonical compiled entrypoint invoked by scripts/odg-monitor.sh). The original
 * runtime/bin/odg-maintenance-check.js was retired by the zero-JS convergence (commit fba76c7) WITHOUT a TS
 * replacement, leaving odg-monitor.sh crashing with MODULE_NOT_FOUND every tick; this file restores the CLI
 * faithfully over the surviving pure core module runtime/core/maintenance-alerts.ts (evaluateMaintenance/newAlerts) —
 * NO threshold/evaluation logic is duplicated here.
 *
 * It gathers read-only signals (health HTTP code / disk% / mem% / odg-preprod NRestarts / backup age / current
 * release present) and emits CRIT/WARN/INFO alerts, appending only FRESH actionable (CRIT|WARN) alerts, deduped, to
 * runtime/generated/maintenance-alerts.jsonl. It NEVER remediates: no restart, rollback, config/firewall/bind change,
 * or business-data write. Exit 1 only when a CRIT is present (actionable), else 0.
 */

const fs = require("fs");
const path = require("path");
const { execSync, execFileSync } = require("child_process");
const { evaluateMaintenance, newAlerts } = require(path.resolve(__dirname, "..", "core", "maintenance-alerts.js"));

function tryq<T>(fn: () => T): T | null { try { return fn(); } catch { return null; } }

function healthCode(): number | null {
  return tryq(() => {
    const out = execFileSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "5", "http://127.0.0.1:3000/api/health"], { encoding: "utf8" });
    const c = parseInt(String(out).trim(), 10);
    return Number.isFinite(c) && c > 0 ? c : null;
  });
}
function diskPct(): number | null {
  return tryq(() => {
    const out = execSync(`df --output=pcent ${JSON.stringify(process.cwd())}`, { encoding: "utf8" });
    const m = String(out).match(/(\d+)%/);
    return m ? Number(m[1]) : null;
  });
}
function memPct(): number | null {
  return tryq(() => {
    const out = execSync("free | awk '/Mem:/{printf \"%d\", $3/$2*100}'", { encoding: "utf8" });
    const v = parseInt(String(out).trim(), 10);
    return Number.isFinite(v) ? v : null;
  });
}
function nRestarts(): number | null {
  return tryq(() => {
    const out = execFileSync("systemctl", ["show", "odg-preprod", "-p", "NRestarts", "--value"], { encoding: "utf8" });
    const v = parseInt(String(out).trim(), 10);
    return Number.isFinite(v) ? v : null;
  });
}
function backupAgeDays(): number | null {
  // Newest file under the known local vault; unreadable/absent ⇒ null (⇒ INFO unknown, never a false "fresh").
  for (const dir of ["/var/backups/odg-vault", path.join(process.env.HOME || "/home/ubuntu", "odg-backups")]) {
    const age = tryq(() => {
      if (!fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir).map((f: string) => path.join(dir, f));
      let newest = 0;
      for (const f of files) { const st = tryq(() => fs.statSync(f)); if (st && st.mtimeMs > newest) newest = st.mtimeMs; }
      if (!newest) return null;
      return Math.floor((Date.now() - newest) / 86400000);
    });
    if (age !== null) return age;
  }
  return null;
}
function releaseCurrentPresent(): boolean | null {
  const root = process.env.ODG_RELEASE_ROOT || path.join(process.env.HOME || "/home/ubuntu", "odg-releases");
  const cur = path.join(root, "current");
  return tryq(() => fs.existsSync(cur)) === true ? true : (tryq(() => fs.existsSync(root)) ? false : null);
}

function priorIds(file: string): string[] {
  try {
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    if (!lines.length) return [];
    const last = JSON.parse(lines[lines.length - 1]);
    return Array.isArray(last.ids) ? last.ids : [];
  } catch { return []; }
}

function main(): void {
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

  // Steady-state status (every run) — the single source odg-health §G reads read-only for a freshness summary.
  try {
    const STATUS = path.resolve(process.cwd(), "runtime", "generated", "maintenance-status.json");
    fs.mkdirSync(path.dirname(STATUS), { recursive: true });
    fs.writeFileSync(STATUS, JSON.stringify({ at: new Date().toISOString(), ok: r.ok, CRIT: r.counts.CRIT, WARN: r.counts.WARN, INFO: r.counts.INFO }));
  } catch { /* status is best-effort */ }

  const FILE = path.resolve(process.cwd(), "runtime", "generated", "maintenance-alerts.jsonl");
  const actionable = r.alerts.filter((a: any) => a.severity === "CRIT" || a.severity === "WARN");
  const fresh = newAlerts(actionable, priorIds(FILE));
  if (fresh.length) {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.appendFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), ids: actionable.map((a: any) => a.id), fresh: fresh.map((a: any) => a.id), alerts: actionable }) + "\n");
      console.log(`  alert       : ${fresh.length} new actionable alert(s) appended to ${FILE}`);
    } catch { /* non-blocking */ }
  } else if (actionable.length) {
    console.log("  alert       : (all actionable alerts deduped — unchanged since last run)");
  }
  process.exit(r.counts.CRIT > 0 ? 1 : 0);
}

main();
export {};
