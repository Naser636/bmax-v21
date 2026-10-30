#!/usr/bin/env node
/**
 * odg cockpit — READ-ONLY text-mode operational cockpit (Track I). TS port (compiles to
 * runtime/dist/bin/odg-cockpit.js, the DEFAULT the `odg` wrapper runs; runtime/bin/odg-cockpit.js is the
 * ODG_RUNTIME=js rollback). Behavioural parity with the JS port (proven by odg-cockpit.test.js +
 * odg-cockpit-dualport-parity.test.js). Reads files only — never writes, spawns, networks, or triggers a
 * mission. CTO Track B bin-CLI dual-port (lowest-risk read-only candidate).
 */
"use strict";

const fs = require("fs");
const path = require("path");

const GEN = path.join("runtime", "generated"); // cwd-relative (repo root) — robust from any dist depth; matches odg-status/odg-diagnose
const LOGS = path.join(GEN, "logs");

function readJson(file: string): any {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { ok: false, error: "absent" };
  }
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, error: "malformed" };
  }
}

function readActiveLog(tail: number): any {
  let files: any[];
  try {
    files = fs
      .readdirSync(LOGS)
      .filter((f: string) => f.endsWith(".run.log"))
      .map((f: string) => ({ f, m: safeMtime(path.join(LOGS, f)) }))
      .sort((a: any, b: any) => b.m - a.m);
  } catch {
    return { name: null, lines: [], note: "no logs dir" };
  }
  if (files.length === 0) return { name: null, lines: [], note: "no run logs" };
  const name = files[0].f;
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(path.join(LOGS, name), "utf8").split(/\r?\n/).filter(Boolean);
  } catch {
    return { name, lines: [], note: "unreadable" };
  }
  return { name, lines: lines.slice(-tail), mtime: files[0].m };
}

function safeMtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function composeModel(io: any, { tail = 12, nowMs = null as any, staleMs = 3600_000 } = {}): any {
  const degraded: string[] = [];
  const get = (name: string) => {
    const r = io.json(name);
    if (!r.ok) degraded.push(`${name}:${r.error}`);
    return r.ok ? r.value : {};
  };
  const state = get("runtime-state.json");
  const status = get("runtime-status.json");
  const caps = get("capability-registry.json");
  const queueDoc = get("runtime-mission-queue.json");
  const ledger = get("mission-ledger.json");
  const diag = get("self-diagnostic-report.json");

  const capList = Array.isArray(caps.capabilities) ? caps.capabilities : [];
  const missing = Array.isArray(caps.missingCapabilities) ? caps.missingCapabilities : [];
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const queue = Array.isArray(queueDoc.queue) ? queueDoc.queue : [];
  const divs = Array.isArray(diag.divergences) ? diag.divergences : [];
  // B-3 secondary (V2 Pole B): absence is already recorded in `degraded` — derive per-source availability from it
  // so the NEXT field does not fabricate SYSTEM_READY when BOTH status and state are absent (the same fabricated-
  // green the Foundation dashboard / odg-health fixes removed). The degraded banner alone did not fix the value.
  const stateAvailable = !degraded.some((d) => d.startsWith("runtime-state.json:"));
  const statusAvailable = !degraded.some((d) => d.startsWith("runtime-status.json:"));
  const log = io.activeLog(tail);

  const autoRes = io.json("autonomy-rate.json");
  const auto = autoRes.ok ? autoRes.value : null;
  let autonomy: any = null;
  if (auto && auto.measure && typeof auto.measure === "object") {
    const mz = auto.measure;
    const dc = (auto.description && auto.description.counts) || {};
    const measurable = mz.measurable === true;
    autonomy = {
      measurable,
      label: measurable
        ? `${mz.autonomyPercent}% (ODG verified ${mz.numerator}/${mz.denominator})`
        : `not measurable — ${mz.reason || "insufficient evidence"}`,
      attribution: {
        odgVerified: dc.odgExecutedVerified || 0,
        external: dc.external || 0,
        human: dc.humanMandatory || 0,
        blocked: dc.blockedFailed || 0,
        notRun: dc.notExecuted || 0,
        unverified: dc.unknownOrUnverified || 0,
      },
      mission: typeof auto.mission === "string" ? auto.mission : null,
      source: (auto.attribution && auto.attribution.source) || null,
    };
    if (!measurable) autonomy.blocker = mz.reason || "autonomy not measurable";
    else if (mz.numerator === 0 && mz.denominator > 0 && !autonomy.source)
      autonomy.blocker = "verified-autonomy 0 — objective-attribution.json not persisted";
    else autonomy.blocker = null;
  }

  // EFFICIENCY (Lot A) — surface ONLY what has a reliable source; everything else is an honest UNKNOWN.
  // Reuses already-produced artifacts; absence ⇒ UNKNOWN (NOT a degraded-source flag — these are optional
  // efficiency inputs). Provider cost is UNKNOWN unless a paid provider actually ran (no artifact ⇒ never a
  // fabricated figure). Duration is the LAST run only (pipeline-checkpoint is a single slot, no history).
  const ckRes = io.json("pipeline-checkpoint.json");
  let lastRunMs: any = null;
  if (ckRes.ok && ckRes.value) {
    const a = Date.parse(ckRes.value.startedAt), b = Date.parse(ckRes.value.completedAt);
    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) lastRunMs = b - a;
  }
  const incRes = io.json("autonomy/self-diagnostic-incidents.json");
  let repeatedWork: any = null;
  if (incRes.ok && incRes.value && incRes.value.incidents && typeof incRes.value.incidents === "object") {
    const list = Object.values(incRes.value.incidents).filter((x: any) => x && typeof x === "object");
    repeatedWork = { recurring: list.filter((i: any) => (i.attempts || 0) > 1).length, frozen: list.filter((i: any) => i.status === "FROZEN").length };
  }
  const efficiency = {
    lastRunMs, // null ⇒ UNKNOWN
    humanInterventions: autonomy
      ? { human: autonomy.attribution.human, external: autonomy.attribution.external, of: auto && auto.measure && typeof auto.measure.denominator === "number" ? auto.measure.denominator : null }
      : null,
    repeatedWork, // null ⇒ UNKNOWN
    providerCost: "UNKNOWN", // no paid provider ran / no metering artifact — never fabricated
  };

  const lastRun = state && state.lastRun && typeof state.lastRun === "object" ? state.lastRun : null;
  const tasks = {
    proven: entries.filter((e: any) => e && e.proven === true).length,
    notRun: queue.length,
    blocked: diag && diag.incident ? 1 : 0,
    lastRun: lastRun
      ? `${lastRun.mission || "?"}:${lastRun.status || (lastRun.validated === true ? "VALIDATED" : "?")}`
      : "N/A",
  };

  const freshness: any = {};
  for (const [k, doc] of [["state", state], ["queue", queueDoc]] as any[]) {
    if (nowMs && doc && typeof doc.generatedAt === "string") {
      const t = Date.parse(doc.generatedAt);
      if (!Number.isNaN(t)) freshness[k] = nowMs - t > staleMs ? "STALE" : "fresh";
    }
  }

  return {
    health: {
      runtime: status.runtime ?? state.runtime ?? state.status ?? "UNKNOWN",
      foundation: status.foundation ?? "UNKNOWN",
      pipeline: state.pipeline ?? "UNKNOWN",
      brain: state.brain ?? "UNKNOWN",
      converged: state.converged,
    },
    progress: {
      ready: capList.length,
      missing: missing.length,
      missions: typeof ledger.count === "number" ? ledger.count : entries.length,
      last: entries.at(-1) ? `${entries.at(-1).mission} (${entries.at(-1).state ?? "?"})` : "N/A",
      next: status.nextMission ?? state.nextMission ?? state.status ?? ((statusAvailable || stateAvailable) ? "SYSTEM_READY" : "UNKNOWN — runtime status/state unavailable"),
    },
    queue: queue.filter((m: any) => m && (m.status === "PENDING" || m.status === undefined)).slice(0, 6)
      .map((m: any) => `${m.mission}${m.objective ? " / " + m.objective : ""}`),
    recentLedger: entries.slice(-6).map((e: any) => `${e.mission} → ${e.state ?? "?"}${e.proven ? " ✓" : ""}`),
    diagnostic: {
      summary: diag.summary ?? "UNKNOWN",
      converged: diag.converged,
      divergences: divs.length,
      incident: diag.incident ?? null,
      mode: diag.mode ?? null,
    },
    activeLog: log,
    autonomy,
    efficiency,
    tasks,
    degraded,
    freshness,
  };
}

function renderCockpit(model: any, { stamp = "" } = {}): string {
  const L: string[] = [];
  const rule = "======================================================================";
  L.push(rule);
  L.push(`  ODG COCKPIT (read-only)${stamp ? "  ·  " + stamp : ""}`);
  L.push(rule);
  const h = model.health;
  L.push(`HEALTH   runtime=${h.runtime} foundation=${h.foundation} pipeline=${h.pipeline} brain=${h.brain} converged=${fmt(h.converged)}`);
  const p = model.progress;
  L.push(`PROGRESS caps ${p.ready} ready / ${p.missing} missing · missions=${p.missions} · last=${p.last}`);
  L.push(`NEXT     ${p.next}`);
  const d = model.diagnostic;
  L.push(`DIAG     ${d.summary} · divergences=${d.divergences}${d.incident ? " · incident=" + d.incident : ""}${d.mode ? " · mode=" + d.mode : ""}`);
  const a = model.autonomy;
  if (a) {
    L.push(`AUTONOMY ${a.label}${a.mission ? "  [" + a.mission + "]" : ""}`);
    L.push(`  attribution ODG-verified=${a.attribution.odgVerified} external=${a.attribution.external} human=${a.attribution.human} blocked=${a.attribution.blocked} not-run=${a.attribution.notRun} unverified=${a.attribution.unverified}`);
    if (a.blocker) L.push(`  next blocker: ${a.blocker}`);
  } else {
    L.push("AUTONOMY (no autonomy-rate.json — run `odg state`)");
  }
  const ef = model.efficiency;
  if (ef) {
    const dur = ef.lastRunMs == null ? "UNKNOWN" : (ef.lastRunMs / 1000).toFixed(2) + "s";
    const hi = ef.humanInterventions ? `human=${ef.humanInterventions.human}/ext=${ef.humanInterventions.external} of ${ef.humanInterventions.of ?? "?"}` : "UNKNOWN";
    const rw = ef.repeatedWork ? `recurring=${ef.repeatedWork.recurring}/frozen=${ef.repeatedWork.frozen}` : "UNKNOWN";
    L.push(`EFFICIENCY last-run=${dur} · interventions ${hi} · repeated-work ${rw} · provider-cost=${ef.providerCost}`);
  }
  const t = model.tasks || { proven: 0, notRun: 0, blocked: 0, lastRun: "N/A" };
  L.push(`TASKS    PROVEN=${t.proven} · NOT-RUN(queue)=${t.notRun} · BLOCKED=${t.blocked} · last=${t.lastRun}`);
  L.push(`NEXT DECISION  ${p.next}`);
  L.push("QUEUE (pending)");
  if (model.queue.length === 0) L.push("  (none)");
  else model.queue.forEach((q: string) => L.push("  - " + q));
  L.push("RECENT LEDGER");
  if (model.recentLedger.length === 0) L.push("  (none)");
  else model.recentLedger.forEach((e: string) => L.push("  - " + e));
  L.push(`ACTIVE RUN LOG${model.activeLog.name ? " : " + model.activeLog.name : " : (none)"}`);
  if (model.activeLog.note) L.push("  [" + model.activeLog.note + "]");
  model.activeLog.lines.forEach((ln: string) => L.push("  | " + ln));
  const flags: string[] = [];
  if (model.degraded.length) flags.push("degraded sources: " + model.degraded.join(", "));
  const staleKeys = Object.entries(model.freshness).filter(([, v]) => v === "STALE").map(([k]) => k);
  if (staleKeys.length) flags.push("STALE: " + staleKeys.join(", "));
  if (flags.length) { L.push(rule.slice(0, 40)); flags.forEach((f) => L.push("! " + f)); }
  L.push(rule);
  return L.join("\n");
}

function fmt(v: any): string {
  return v === undefined ? "?" : String(v);
}

function parseArgs(argv: string[]): any {
  const a: any = { once: false, interval: 3, iterations: Infinity, tail: 12 };
  for (const s of argv) {
    if (s === "--once") a.once = true;
    else if (s.startsWith("--interval=")) a.interval = Math.max(1, Number(s.slice(11)) || 3);
    else if (s.startsWith("--iterations=")) a.iterations = Math.max(1, Number(s.slice(13)) || 1);
    else if (s.startsWith("--tail=")) a.tail = Math.max(1, Number(s.slice(7)) || 12);
  }
  if (a.once) a.iterations = 1;
  return a;
}

const liveIo = {
  json: (name: string) => readJson(path.join(GEN, name)),
  activeLog: (tail: number) => readActiveLog(tail),
};

function runLoop(io: any, args: any, out: any, clock: any, schedule: any): any {
  let n = 0;
  let stopped = false;
  const stop = () => { stopped = true; };
  const tick = () => {
    if (stopped) return;
    const model = composeModel(io, { tail: args.tail, nowMs: clock() });
    out(renderCockpit(model, { stamp: `refresh ${n + 1}${args.iterations === Infinity ? "" : "/" + args.iterations}` }));
    n += 1;
    if (n >= args.iterations) { stop(); return; }
    schedule(tick, args.interval * 1000);
  };
  tick();
  return { stop, count: () => n };
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const ctl = runLoop(
    liveIo,
    args,
    (s: string) => console.log("\n" + s),
    () => Date.now(),
    (fn: any, ms: number) => setTimeout(fn, ms),
  );
  process.on("SIGINT", () => { ctl.stop(); console.log("\n[cockpit stopped]"); process.exit(0); });
}

module.exports = { readJson, readActiveLog, composeModel, renderCockpit, parseArgs, runLoop };

export {};
