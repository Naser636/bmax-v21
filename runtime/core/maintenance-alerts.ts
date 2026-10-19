/**
 * maintenance-alerts — P5 actionable-alert evaluator (pure; the alerting half of §P5, complementing
 * mission-attempt-log.metricsSnapshot). Takes OBSERVED maintenance signals + thresholds and returns a list
 * of actionable alerts. Honesty rules:
 *   - A signal that is null/undefined (couldn't be observed) yields an `<id>_UNKNOWN` INFO alert with a
 *     reason — NEVER a silent pass (absence of data is not health).
 *   - A breached threshold yields a WARN/CRIT alert with the observed value, threshold and reason.
 *   - Fabricates nothing; computes nothing it wasn't given. Deterministic (no clock/fs/net) — the caller
 *     supplies signals and (for dedup) the previously-emitted alert ids.
 *
 * This module decides WHAT to alert on; it never remediates (restart/rollback/firewall are elsewhere and are
 * reserved actions). Alert severity: CRIT = act now (service/data at risk), WARN = attention, INFO = unknown/notable.
 */

const DEFAULT_THRESHOLDS: any = {
  diskPct: 90,          // disk usage % that is a WARN; +criticalDelta ⇒ CRIT
  memPct: 90,
  nRestartsMax: 3,      // > this many service restarts ⇒ WARN (instability)
  backupMaxAgeDays: 7,  // backup older than this ⇒ WARN
  criticalDiskPct: 97,  // >= ⇒ CRIT
  criticalMemPct: 97,
};

function num(v: any): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

/**
 * Evaluate signals → alerts. `signals`: { healthCode, diskUsedPct, memUsedPct, nRestarts, backupAgeDays,
 * releaseCurrentPresent }. Any field may be null (unobserved). Returns { alerts:[{id,severity,reason,value}],
 * counts:{CRIT,WARN,INFO}, ok:boolean } where ok = no CRIT and no WARN (INFO/unknown does not fail `ok`).
 */
function evaluateMaintenance(signals: any, thresholds?: any): any {
  const s = signals && typeof signals === "object" ? signals : {};
  const T = Object.assign({}, DEFAULT_THRESHOLDS, thresholds && typeof thresholds === "object" ? thresholds : {});
  const alerts: any[] = [];
  const push = (id: string, severity: string, reason: string, value?: any) => alerts.push({ id, severity, reason, value: value === undefined ? null : value });

  // Health endpoint
  const hc = s.healthCode;
  if (num(hc) === null) push("HEALTH_UNKNOWN", "INFO", "health code not observed", null);
  else if (hc !== 200) push("HEALTH_NOT_200", "CRIT", `health endpoint returned ${hc} (expected 200)`, hc);

  // Disk
  const disk = num(s.diskUsedPct);
  if (disk === null) push("DISK_UNKNOWN", "INFO", "disk usage not observed", null);
  else if (disk >= T.criticalDiskPct) push("DISK_CRITICAL", "CRIT", `disk ${disk}% >= ${T.criticalDiskPct}%`, disk);
  else if (disk >= T.diskPct) push("DISK_HIGH", "WARN", `disk ${disk}% >= ${T.diskPct}%`, disk);

  // Memory
  const mem = num(s.memUsedPct);
  if (mem === null) push("MEM_UNKNOWN", "INFO", "memory usage not observed", null);
  else if (mem >= T.criticalMemPct) push("MEM_CRITICAL", "CRIT", `memory ${mem}% >= ${T.criticalMemPct}%`, mem);
  else if (mem >= T.memPct) push("MEM_HIGH", "WARN", `memory ${mem}% >= ${T.memPct}%`, mem);

  // Service restarts (instability)
  const nr = num(s.nRestarts);
  if (nr === null) push("RESTARTS_UNKNOWN", "INFO", "NRestarts not observed", null);
  else if (nr > T.nRestartsMax) push("RESTARTS_HIGH", "WARN", `NRestarts ${nr} > ${T.nRestartsMax}`, nr);

  // Backup age
  const age = num(s.backupAgeDays);
  if (age === null) push("BACKUP_AGE_UNKNOWN", "INFO", "no backup age observed (no backup found?)", null);
  else if (age > T.backupMaxAgeDays) push("BACKUP_STALE", "WARN", `latest backup ${age}d old > ${T.backupMaxAgeDays}d`, age);

  // Release pointer present
  if (s.releaseCurrentPresent === false) push("RELEASE_CURRENT_MISSING", "CRIT", "no current release symlink/target", false);
  else if (s.releaseCurrentPresent !== true) push("RELEASE_CURRENT_UNKNOWN", "INFO", "release current pointer not observed", null);

  const counts: any = { CRIT: 0, WARN: 0, INFO: 0 };
  for (const a of alerts) counts[a.severity] = (counts[a.severity] || 0) + 1;
  return { alerts, counts, ok: counts.CRIT === 0 && counts.WARN === 0 };
}

/**
 * Dedup helper: given the full new alert set and the set of previously-emitted alert ids (array/Set), return
 * only the alerts whose id is NOT already present — so repeated runs don't re-emit the same steady-state alert.
 */
function newAlerts(alerts: any, priorIds: any): any[] {
  const prior = priorIds instanceof Set ? priorIds : new Set(Array.isArray(priorIds) ? priorIds : []);
  return (Array.isArray(alerts) ? alerts : []).filter((a: any) => a && !prior.has(a.id));
}

module.exports = { evaluateMaintenance, newAlerts, DEFAULT_THRESHOLDS };
export {};
