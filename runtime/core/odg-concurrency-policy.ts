#!/usr/bin/env node
"use strict";
/*
 * V15.7 (CTO directive — performance engineering WITHOUT weakening controls) — ADAPTIVE CONCURRENCY POLICY.
 *
 * A PURE decision function: given host pressure (loadavg, CPU count, available RAM), the agent-supervisor snapshot (which
 * agents are RUNNING — from evidence, never a UI list), contention / refusal / queue signals and throughput windows, decide
 * the per-role concurrency limits and how many NEW agents may be admitted now.
 *
 * Defaults (configurable): coordinator 1, builders max 3 (start 2, min 1), inspectors 1 (admitted only when a change is
 * READY for inspection), Git integration 1 at a time.
 *
 * Rules:
 *   - counts ONLY agents the supervisor classifies RUNNING (kind CLAIM = a lock record, not an agent — reported apart);
 *     an agent without a recognised role counts as a BUILDER (fail-closed: it consumes the elastic pool).
 *   - scales DOWN one step when: load/CPU > loadHigh, available RAM < memLowMb, write-set conflicts > 0, refusal rate rose
 *     (and ≥ refusalMin), CI or inspection queue grew (and ≥ queueMin), or a host signal is unreadable (NOT_MEASURED ⇒
 *     pressure, fail closed). load/CPU > loadCritical or RAM < memCriticalMb ⇒ admit NO new builder at all.
 *   - scales UP by ONE step only when no down-signal fired, every signal is MEASURED, and a measured throughput gain ≥
 *     minGain was observed between the last two windows (limit-1 → limit), each at least minWindowMs long.
 *   - an unreadable supervisor snapshot ⇒ running counts unknown ⇒ admit 0 for every role (never over-admit).
 *   - NOT_MEASURED is never coerced to 0: it blocks scale-up and is reported verbatim.
 * Writes nothing, runs nothing; the CLI (runtime/bin/odg-concurrency-policy-run.ts) gathers the real signals read-only.
 */

const ROLES = Object.freeze(["coordinator", "builder", "inspector", "gitIntegration"]);
const DEFAULT_CONFIG = Object.freeze({
  coordinator: 1, inspectors: 1, gitIntegration: 1,
  builders: Object.freeze({ min: 1, max: 3, initial: 2 }),
  loadHigh: 0.85, loadCritical: 1.5,                // 1-min loadavg per CPU
  memLowMb: 3072, memCriticalMb: 1536,              // MemAvailable
  refusalMin: 0.2, queueMin: 3,
  minGain: 0.10, minWindowMs: 30 * 60 * 1000,
});
const NM = "NOT_MEASURED";

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function finite(x: any): boolean { return typeof x === "number" && Number.isFinite(x); }
function mergeConfig(c: any): any {
  const o: any = { ...DEFAULT_CONFIG, ...(c || {}) };
  o.builders = { ...DEFAULT_CONFIG.builders, ...((c && c.builders) || {}) };
  for (const k of ["coordinator", "inspectors", "gitIntegration"]) if (!(Number.isInteger(o[k]) && o[k] >= 0)) o[k] = (DEFAULT_CONFIG as any)[k];
  const b = o.builders;
  if (!(Number.isInteger(b.max) && b.max >= 1)) b.max = DEFAULT_CONFIG.builders.max;
  if (!(Number.isInteger(b.min) && b.min >= 0 && b.min <= b.max)) b.min = Math.min(DEFAULT_CONFIG.builders.min, b.max);
  if (!(Number.isInteger(b.initial) && b.initial >= b.min && b.initial <= b.max)) b.initial = Math.max(b.min, Math.min(b.max, DEFAULT_CONFIG.builders.initial));
  return o;
}

/** parseLoadavg(text) → { load1, load5, load15 } | NOT_MEASURED (unreadable / truncated / non-numeric). */
function parseLoadavg(text: any): any {
  if (typeof text !== "string") return NM;
  const p = text.trim().split(/\s+/);
  if (p.length < 3) return NM;
  const v = p.slice(0, 3).map(Number);
  return v.every((x) => Number.isFinite(x) && x >= 0) ? freeze({ load1: v[0], load5: v[1], load15: v[2] }) : NM;
}
/** parseMeminfo(text) → { totalMb, availableMb } | NOT_MEASURED. MemAvailable is REQUIRED (MemFree is not a substitute:
 *  it ignores reclaimable cache) — a truncated file without it is NOT_MEASURED. */
function parseMeminfo(text: any): any {
  if (typeof text !== "string") return NM;
  const get = (k: string) => { const m = text.match(new RegExp("^" + k + ":\\s+(\\d+)\\s*kB\\s*$", "m")); return m ? Number(m[1]) : null; };
  const t = get("MemTotal"), a = get("MemAvailable");
  if (t === null || a === null || !(t > 0) || a > t) return NM;
  return freeze({ totalMb: Math.round(t / 1024), availableMb: Math.round(a / 1024) });
}

/** countRunning(snapshot, roleOf?) — only supervisor-classified RUNNING agents. null snapshot / no agents array ⇒ null. */
function countRunning(snapshot: any, roleOf?: any): any {
  if (!snapshot || !Array.isArray(snapshot.agents)) return null;
  const by: any = { coordinator: 0, builder: 0, inspector: 0, gitIntegration: 0 };
  let unclassified = 0, lockClaims = 0; const ids: string[] = [];
  for (const a of snapshot.agents) {
    if (!a || a.state !== "RUNNING") continue;
    if (a.kind === "CLAIM") { lockClaims++; continue; }
    const declared = (roleOf && typeof roleOf === "object" ? roleOf[a.id] : null) || a.role || null;
    const role = ROLES.includes(declared) ? declared : null;
    if (role) by[role]++; else { by.builder++; unclassified++; }
    ids.push(a.id);
  }
  return freeze({ ...by, unclassifiedCountedAsBuilder: unclassified, lockClaimsRunning: lockClaims, runningIds: freeze(ids) });
}

function rate(w: any): number | null { return w && finite(w.total) && w.total > 0 && finite(w.refused) && w.refused >= 0 ? w.refused / w.total : null; }

/**
 * decide(input, config?) → frozen decision.
 * input: { cpuCount, loadavg (parsed | NOT_MEASURED), meminfo (parsed | NOT_MEASURED), snapshot, roleOf?,
 *          currentBuilderLimit?, writesetConflicts?, refusal?:{current:{refused,total}, previous:{…}},
 *          ciQueue?:{current,previous}, inspectionQueue?:{current,previous}, changeReady?: bool,
 *          gitIntegrationActive?: bool, throughput?: [{builderLimit, completed, durationMs}] (oldest → newest) }
 */
function decide(input: any, config?: any): any {
  const cfg = mergeConfig(config);
  const i = input || {};
  const reasons: string[] = []; const down: string[] = []; const notMeasured: string[] = [];
  let critical = false;
  const cur0 = Number.isInteger(i.currentBuilderLimit) ? i.currentBuilderLimit : cfg.builders.initial;
  const cur = Math.max(cfg.builders.min, Math.min(cfg.builders.max, cur0));
  if (cur !== cur0) reasons.push(`currentBuilderLimit ${cur0} clamped to [${cfg.builders.min},${cfg.builders.max}] ⇒ ${cur}`);

  // host pressure
  const cpus = finite(i.cpuCount) && i.cpuCount >= 1 ? i.cpuCount : null;
  const la = i.loadavg && i.loadavg !== NM && finite(i.loadavg.load1) ? i.loadavg : null;
  const loadPerCpu = la && cpus ? la.load1 / cpus : null;
  if (loadPerCpu === null) { notMeasured.push("loadavg/cpuCount"); down.push("HOST_LOAD_UNREADABLE (NOT_MEASURED ⇒ treated as pressure, fail closed)"); }
  else if (loadPerCpu > cfg.loadCritical) { critical = true; down.push(`LOAD_CRITICAL ${loadPerCpu.toFixed(2)}/cpu > ${cfg.loadCritical}`); }
  else if (loadPerCpu > cfg.loadHigh) down.push(`LOAD_HIGH ${loadPerCpu.toFixed(2)}/cpu > ${cfg.loadHigh}`);
  const mem = i.meminfo && i.meminfo !== NM && finite(i.meminfo.availableMb) ? i.meminfo : null;
  if (!mem) { notMeasured.push("meminfo"); down.push("MEMINFO_UNREADABLE (NOT_MEASURED ⇒ treated as pressure, fail closed)"); }
  else if (mem.availableMb < cfg.memCriticalMb) { critical = true; down.push(`RAM_CRITICAL ${mem.availableMb}MB < ${cfg.memCriticalMb}MB`); }
  else if (mem.availableMb < cfg.memLowMb) down.push(`RAM_LOW ${mem.availableMb}MB < ${cfg.memLowMb}MB`);

  // coordination signals (absent ⇒ NOT_MEASURED: cannot trigger DOWN, but blocks UP)
  if (finite(i.writesetConflicts)) { if (i.writesetConflicts > 0) down.push(`WRITESET_CONFLICTS ${i.writesetConflicts}`); } else notMeasured.push("writesetConflicts");
  const rNow = rate(i.refusal && i.refusal.current), rPrev = rate(i.refusal && i.refusal.previous);
  if (rNow === null || rPrev === null) notMeasured.push("refusalRate");
  else if (rNow > rPrev && rNow >= cfg.refusalMin) down.push(`REFUSAL_RATE_RISING ${rPrev.toFixed(2)} → ${rNow.toFixed(2)}`);
  for (const [k, q] of [["ciQueue", i.ciQueue], ["inspectionQueue", i.inspectionQueue]] as any) {
    if (!q || !finite(q.current) || !finite(q.previous)) { notMeasured.push(k); continue; }
    if (q.current > q.previous && q.current >= cfg.queueMin) down.push(`${k.toUpperCase()}_GROWING ${q.previous} → ${q.current}`);
  }

  // running agents (supervisor evidence)
  const running = countRunning(i.snapshot, i.roleOf);
  if (!running) { notMeasured.push("supervisorSnapshot"); reasons.push("SUPERVISOR_SNAPSHOT_UNAVAILABLE ⇒ running counts unknown ⇒ admit 0 for every role (fail closed)"); }

  // builder limit
  let direction = "HOLD"; let next = cur;
  if (down.length) { direction = "DOWN"; next = Math.max(cfg.builders.min, cur - 1); reasons.push(...down.map((d) => "DOWN: " + d)); }
  else {
    const tp = Array.isArray(i.throughput) ? i.throughput.filter((w: any) => w && Number.isInteger(w.builderLimit) && finite(w.completed) && w.completed >= 0 && finite(w.durationMs) && w.durationMs > 0) : [];
    const last = tp[tp.length - 1], prev = tp[tp.length - 2];
    if (notMeasured.length) reasons.push(`HOLD: scale-up needs every signal MEASURED (NOT_MEASURED: ${notMeasured.join(", ")})`);
    else if (cur >= cfg.builders.max) reasons.push(`HOLD: at builders.max ${cfg.builders.max}`);
    else if (!last || !prev) reasons.push("HOLD: no two throughput windows measured — scale-up requires a MEASURED gain");
    else if (last.builderLimit !== cur || prev.builderLimit !== cur - 1) reasons.push(`HOLD: throughput windows are not (limit-1 → limit) = (${cur - 1} → ${cur}) — got (${prev.builderLimit} → ${last.builderLimit})`);
    else if (last.durationMs < cfg.minWindowMs || prev.durationMs < cfg.minWindowMs) reasons.push(`HOLD: throughput window shorter than ${cfg.minWindowMs}ms`);
    else {
      const tNow = last.completed / last.durationMs, tPrev = prev.completed / prev.durationMs;
      const gain = tPrev > 0 ? (tNow - tPrev) / tPrev : (tNow > 0 ? Infinity : 0);
      if (gain >= cfg.minGain) { direction = "UP"; next = Math.min(cfg.builders.max, cur + 1); reasons.push(`UP: measured throughput gain ${gain === Infinity ? "∞" : (gain * 100).toFixed(1) + "%"} ≥ ${(cfg.minGain * 100).toFixed(0)}% (${cur - 1} → ${cur}) ⇒ +1 step`); }
      else reasons.push(`HOLD: measured gain ${(gain * 100).toFixed(1)}% < ${(cfg.minGain * 100).toFixed(0)}% (diminishing returns)`);
    }
  }
  if (direction === "DOWN" && next === cur) reasons.push(`DOWN requested but already at builders.min ${cfg.builders.min}`);

  const limits = freeze({ coordinator: cfg.coordinator, builders: next, inspectors: cfg.inspectors, gitIntegration: cfg.gitIntegration });
  const admit: any = { coordinator: 0, builders: 0, inspectors: 0, gitIntegration: 0 };
  if (running) {
    admit.coordinator = Math.max(0, limits.coordinator - running.coordinator);
    admit.builders = critical ? 0 : Math.max(0, limits.builders - running.builder);
    if (critical) reasons.push("CRITICAL host pressure ⇒ admit 0 new builders");
    if (i.changeReady === true) admit.inspectors = Math.max(0, limits.inspectors - running.inspector);
    else reasons.push(`inspectors: admitted only when a change is READY (changeReady=${i.changeReady === false ? "false" : NM})`);
    if (i.gitIntegrationActive === false) admit.gitIntegration = Math.max(0, limits.gitIntegration - running.gitIntegration);
    else reasons.push(`gitIntegration: admitted only when no integration is active (gitIntegrationActive=${i.gitIntegrationActive === true ? "true" : NM})`);
  }
  return freeze({
    schema: "ODG_CONCURRENCY_DECISION", version: 1, direction, limits, admit: freeze(admit),
    running: running || NM, previousBuilderLimit: cur,
    signals: freeze({ cpuCount: cpus ?? NM, load1: la ? la.load1 : NM, loadPerCpu: loadPerCpu === null ? NM : +loadPerCpu.toFixed(3), memAvailableMb: mem ? mem.availableMb : NM, writesetConflicts: finite(i.writesetConflicts) ? i.writesetConflicts : NM, refusalRate: rNow === null ? NM : +rNow.toFixed(3), ciQueue: i.ciQueue && finite(i.ciQueue.current) ? i.ciQueue.current : NM, inspectionQueue: i.inspectionQueue && finite(i.inspectionQueue.current) ? i.inspectionQueue.current : NM }),
    notMeasured: freeze(notMeasured), reasons: freeze(reasons), config: freeze(cfg),
  });
}

const CONCURRENCY_POLICY_CONTRACT = freeze({
  id: "ODG-CONCURRENCY-POLICY", roles: ROLES, defaults: DEFAULT_CONFIG,
  invariants: freeze([
    "only supervisor-RUNNING agents are counted — never a UI listing; unknown role counts as builder",
    "any down-signal ⇒ one step down; critical load/RAM ⇒ admit 0 builders",
    "scale-up is +1 step only, only on a MEASURED throughput gain over (limit-1 → limit) windows ≥ minWindowMs, with every signal measured",
    "NOT_MEASURED is never coerced to 0; unreadable host signal ⇒ pressure; unreadable snapshot ⇒ admit 0",
    "inspectors admitted only when a change is READY; Git integration one at a time",
    "pure: no I/O, no clock, no randomness",
  ]),
});

module.exports = { ROLES, DEFAULT_CONFIG, NOT_MEASURED: NM, mergeConfig, parseLoadavg, parseMeminfo, countRunning, decide, CONCURRENCY_POLICY_CONTRACT };
export {};
