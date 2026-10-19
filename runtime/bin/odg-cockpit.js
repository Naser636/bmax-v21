#!/usr/bin/env node
/**
 * odg cockpit — READ-ONLY text-mode operational cockpit (Track I).
 *
 * Composes the EXISTING Runtime observability sources into one refreshable text view. It creates NO
 * new source of truth, NO second state authority, NO new primitive, and NO new runtime (Constitution
 * §REUSE_BEFORE_CREATE / §ARTIFACTS_ARE_IMMUTABLE). It ONLY reads files with fs — it never writes,
 * never spawns a child process, never opens the network, and never triggers a mission.
 *
 * Sources (all under runtime/generated, graceful when missing/malformed/empty/stale):
 *   1. health      — runtime-state.json + runtime-status.json + capability-registry.json
 *   2. queue       — runtime-mission-queue.json (+ runtime-state.json convergence)
 *   3. ledger      — mission-ledger.json (recent proven entries)
 *   4. run-log     — newest runtime/generated/logs/<MISSION>.run.log (active stream tail)
 *   5. diagnostic  — self-diagnostic-report.json (divergences / incident)
 *
 * Pure functions (composeModel / renderCockpit) take injected readers so they are testable without
 * touching live state; the refresh loop runs ONLY when invoked as the main module and is bounded.
 *
 * Usage: odg cockpit [--once] [--interval=<seconds>] [--iterations=<n>] [--tail=<lines>]
 */
"use strict";

const fs = require("fs");
const path = require("path");

const GEN = path.join("runtime", "generated"); // cwd-relative (repo root) — robust from any dist depth; matches odg-status/odg-diagnose
const LOGS = path.join(GEN, "logs");

// ---- read helpers (injectable for tests) ---------------------------------------------------------

/** Read + parse a generated JSON artifact. Returns {ok, value|error} — NEVER throws (honest degraded). */
function readJson(file) {
  let raw;
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

/** Newest *.run.log in runtime/generated/logs plus its last `tail` lines. Never throws. */
function readActiveLog(tail) {
  let files;
  try {
    files = fs
      .readdirSync(LOGS)
      .filter((f) => f.endsWith(".run.log"))
      .map((f) => ({ f, m: safeMtime(path.join(LOGS, f)) }))
      .sort((a, b) => b.m - a.m);
  } catch {
    return { name: null, lines: [], note: "no logs dir" };
  }
  if (files.length === 0) return { name: null, lines: [], note: "no run logs" };
  const name = files[0].f;
  let lines = [];
  try {
    lines = fs.readFileSync(path.join(LOGS, name), "utf8").split(/\r?\n/).filter(Boolean);
  } catch {
    return { name, lines: [], note: "unreadable" };
  }
  return { name, lines: lines.slice(-tail), mtime: files[0].m };
}

function safeMtime(p) {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

// ---- pure composition ----------------------------------------------------------------------------

/**
 * Build the cockpit model from injected source readers. `io` supplies { json(name), activeLog(tail) }
 * so tests can feed fixtures (including missing/malformed/empty). `tail` bounds the run-log lines.
 * Pure: no fs, no clock (nowMs passed in for deterministic staleness).
 */
function composeModel(io, { tail = 12, nowMs = null, staleMs = 3600_000 } = {}) {
  const degraded = [];
  const get = (name) => {
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
  const log = io.activeLog(tail);

  // Autonomy signal (S2) — READ-ONLY surfacing of the governed runtime/generated/autonomy-rate.json
  // (written by `odg state`, derived via the pure autonomy-measure.js). This is an OPTIONAL source:
  // its absence is shown as "not available" and is NEVER flagged degraded or fabricated. Honesty rule:
  // a non-measurable signal is rendered as a REASON, never as a number.
  const autoRes = io.json("autonomy-rate.json");
  const auto = autoRes.ok ? autoRes.value : null;
  let autonomy = null;
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

  // Result buckets (PROVEN / PARTIAL / BLOCKED / NOT RUN) from already-read governed sources only.
  // PROVEN = ledger entries proven===true; NOT RUN = executable queue length; BLOCKED = a live
  // self-diagnostic incident; PARTIAL (and the current verdict) is carried by lastRun from runtime-state.
  // EFFICIENCY (Lot A) — surface ONLY what has a reliable source; everything else is an honest UNKNOWN.
  // Reuses already-produced artifacts; absence ⇒ UNKNOWN (NOT a degraded-source flag — these are optional
  // efficiency inputs). Provider cost is UNKNOWN unless a paid provider actually ran (no artifact ⇒ never a
  // fabricated figure). Duration is the LAST run only (pipeline-checkpoint is a single slot, no history).
  const ckRes = io.json("pipeline-checkpoint.json");
  let lastRunMs = null;
  if (ckRes.ok && ckRes.value) {
    const a = Date.parse(ckRes.value.startedAt), b = Date.parse(ckRes.value.completedAt);
    if (!Number.isNaN(a) && !Number.isNaN(b) && b >= a) lastRunMs = b - a;
  }
  const incRes = io.json("autonomy/self-diagnostic-incidents.json");
  let repeatedWork = null;
  if (incRes.ok && incRes.value && incRes.value.incidents && typeof incRes.value.incidents === "object") {
    const list = Object.values(incRes.value.incidents).filter((x) => x && typeof x === "object");
    repeatedWork = { recurring: list.filter((i) => (i.attempts || 0) > 1).length, frozen: list.filter((i) => i.status === "FROZEN").length };
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
    proven: entries.filter((e) => e && e.proven === true).length,
    notRun: queue.length,
    blocked: diag && diag.incident ? 1 : 0,
    lastRun: lastRun
      ? `${lastRun.mission || "?"}:${lastRun.status || (lastRun.validated === true ? "VALIDATED" : "?")}`
      : "N/A",
  };

  // Honest staleness: only when a clock is supplied and the artifact carries generatedAt.
  const freshness = {};
  for (const [k, doc] of [["state", state], ["queue", queueDoc]]) {
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
      next: status.nextMission ?? state.nextMission ?? state.status ?? "SYSTEM_READY",
    },
    queue: queue.filter((m) => m && (m.status === "PENDING" || m.status === undefined)).slice(0, 6)
      .map((m) => `${m.mission}${m.objective ? " / " + m.objective : ""}`),
    recentLedger: entries.slice(-6).map((e) => `${e.mission} → ${e.state ?? "?"}${e.proven ? " ✓" : ""}`),
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

/** Render the model to a concise, deterministic text block. Pure (timestamp passed in). */
function renderCockpit(model, { stamp = "" } = {}) {
  const L = [];
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
  else model.queue.forEach((q) => L.push("  - " + q));
  L.push("RECENT LEDGER");
  if (model.recentLedger.length === 0) L.push("  (none)");
  else model.recentLedger.forEach((e) => L.push("  - " + e));
  L.push(`ACTIVE RUN LOG${model.activeLog.name ? " : " + model.activeLog.name : " : (none)"}`);
  if (model.activeLog.note) L.push("  [" + model.activeLog.note + "]");
  model.activeLog.lines.forEach((ln) => L.push("  | " + ln));
  const flags = [];
  if (model.degraded.length) flags.push("degraded sources: " + model.degraded.join(", "));
  const staleKeys = Object.entries(model.freshness).filter(([, v]) => v === "STALE").map(([k]) => k);
  if (staleKeys.length) flags.push("STALE: " + staleKeys.join(", "));
  if (flags.length) { L.push(rule.slice(0, 40)); flags.forEach((f) => L.push("! " + f)); }
  L.push(rule);
  return L.join("\n");
}

function fmt(v) {
  return v === undefined ? "?" : String(v);
}

// ---- bounded refresh loop (main only) ------------------------------------------------------------

function parseArgs(argv) {
  const a = { once: false, interval: 3, iterations: Infinity, tail: 12 };
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
  json: (name) => readJson(path.join(GEN, name)),
  activeLog: (tail) => readActiveLog(tail),
};

function runLoop(io, args, out, clock, schedule) {
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
    (s) => console.log("\n" + s),
    () => Date.now(),
    // Keep the process alive between refreshes (do NOT unref) so the live loop actually refreshes
    // until `iterations` is reached or SIGINT; tests inject their own scheduler, so no real timer runs.
    (fn, ms) => setTimeout(fn, ms),
  );
  process.on("SIGINT", () => { ctl.stop(); console.log("\n[cockpit stopped]"); process.exit(0); });
}

module.exports = { readJson, readActiveLog, composeModel, renderCockpit, parseArgs, runLoop };
