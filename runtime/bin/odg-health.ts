#!/usr/bin/env node
/**
 * odg health — Unified Runtime Dashboard (TS port → runtime/dist/bin/odg-health.js, DEFAULT;
 * runtime/bin/odg-health.js is the ODG_RUNTIME=js rollback). READS existing artefacts only; never
 * mutates. `render(artifacts)` is a PURE function (unit-testable). CLI reads live via cwd-relative paths
 * (robust from any dist depth — lesson from the odg-cockpit dist path-depth fix).
 */
"use strict";

const fs = require("fs");
const path = require("path");
// relative: resolves to runtime/dist/core under the compiled dist bin, to the .ts under tsx (same pattern as odg-delegate).
const { resolveRequiredPort } = require("../core/prefer-dist-bin.js");

const G = (name: string) => path.join("runtime", "generated", name); // cwd-relative (repo root)

function read(file: string, fallback: any): any {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

function render(artifacts: any): string {
  const state = artifacts.state || {};
  const status = artifacts.status || {};
  const caps = artifacts.caps || { capabilities: [], missingCapabilities: [] };
  const ledger = artifacts.ledger || { count: 0, entries: [] };
  const constitution = artifacts.constitution || { principles: [] };
  const queue = artifacts.queue || { queue: [] };
  // F2b: same fail-VISIBLE discipline as capsAvailable, for the other sources whose absence render used to collapse
  // into an optimistic default (NEXT ACTION "SYSTEM_READY", Missions "0 recorded", a hardcoded WORKING RULES list
  // presented as if loaded). The caller signals which sources actually loaded; absence ⇒ UNKNOWN / labelled default,
  // never a benign-looking fabrication. Default false so a bare render({...}) without flags is fail-visible.
  const stateAvailable = artifacts.stateAvailable === true;
  const statusAvailable = artifacts.statusAvailable === true;
  const ledgerAvailable = artifacts.ledgerAvailable === true;
  const constitutionAvailable = artifacts.constitutionAvailable === true;

  // FAIL-VISIBLE (fixes an audited fabricated-health): read() collapses an ABSENT/unreadable capability-registry.json
  // into the SAME {capabilities:[],missingCapabilities:[]} shape as a genuinely-empty registry, so absence used to
  // render "Completion 100%" + "BLOCKERS: None — all present" — the opposite of the dashboard's "Absent ⇒ UNKNOWN,
  // never a fabricated pass" contract (which the Compass/Supervision lines already honour). The caller now signals
  // whether the registry actually loaded; when it did not, Completion/BLOCKERS/Capabilities are UNKNOWN, never healthy.
  const capsAvailable = artifacts.capsAvailable === true;
  const capList = Array.isArray(caps.capabilities) ? caps.capabilities : [];
  const missing = Array.isArray(caps.missingCapabilities) ? caps.missingCapabilities : [];
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const lastEntry = entries.at(-1) || {};
  const total = capList.length + missing.length;
  const pct = total > 0 ? Math.round((capList.length / total) * 100) : 100;

  const lastRun = state.lastRun && typeof state.lastRun === "object" ? state.lastRun : null;

  const nextPending = (queue.queue || []).find((m: any) => m && m.status === "PENDING");
  // A concrete next mission from a loaded source (a pending queue item, or status/state) is real; falling through to
  // the idle "SYSTEM_READY" default is only honest when status OR state actually loaded — otherwise the system's next
  // action is genuinely UNKNOWN (absent sources must not read as a healthy idle system).
  const nextFromSources = nextPending ? nextPending.mission : (status.nextMission || state.status || null);
  const nextMissionName = nextFromSources || ((statusAvailable || stateAvailable) ? "SYSTEM_READY" : "UNKNOWN — runtime status/state unavailable");
  const nextAction = nextPending
    ? `${nextPending.mission}${nextPending.objective ? " / " + nextPending.objective : ""}`
    : nextMissionName;
  const nextActionLine = lastRun && lastRun.mission === nextMissionName
    ? `${nextAction} — last run: ${lastRun.status}${lastRun.validated ? " (validated, awaiting ledger record)" : ""}`
    : nextAction;

  const bar = (p: number) => {
    const filled = Math.round((p / 100) * 20);
    return "[" + "#".repeat(filled) + "-".repeat(20 - filled) + `] ${p}%`;
  };

  const L: string[] = [];
  L.push("======================================================================");
  L.push("  ODG RUNTIME — UNIFIED HEALTH DASHBOARD");
  L.push("======================================================================");
  L.push("HEALTH");
  L.push(`  Runtime      : ${status.runtime ?? state.status ?? "UNKNOWN"}`);
  L.push(`  Foundation   : ${status.foundation ?? "UNKNOWN"}`);
  L.push(`  Pipeline     : ${state.pipeline ?? "UNKNOWN"}`);
  L.push(`  Brain        : ${state.brain ?? "UNKNOWN"}`);
  L.push("");
  L.push("PROGRESS");
  L.push(`  Capabilities : ${capsAvailable ? `${capList.length} ready / ${missing.length} missing` : "UNKNOWN — capability-registry unavailable"}`);
  L.push(`  Completion   : ${capsAvailable ? bar(pct) : "UNKNOWN — capability-registry unavailable (not a fabricated 100%)"}`);
  L.push(`  Missions     : ${ledgerAvailable ? `${ledger.count ?? entries.length} recorded` : "UNKNOWN — mission-ledger unavailable"}`);
  L.push(`  Last Mission : ${lastEntry.mission ?? state.lastMission ?? "N/A"} (${lastEntry.state ?? "?"})`);
  if (lastRun) L.push(`  Last Run     : ${lastRun.mission} — ${lastRun.status}${lastRun.validated ? "" : " (validated=false)"}`);
  L.push("");
  L.push("BLOCKERS");
  if (!capsAvailable) {
    L.push("  UNKNOWN — capability-registry unavailable; blockers cannot be determined (NOT 'none').");
  } else if (missing.length === 0) {
    L.push("  None — all registered capabilities are present.");
  } else {
    for (const m of missing.slice(0, 8)) L.push(`  - ${m.id ?? m.goal ?? String(m)}`);
    if (missing.length > 8) L.push(`  ... and ${missing.length - 8} more`);
  }
  L.push("");
  L.push("NEXT ACTION");
  L.push(`  ${nextActionLine}`);
  L.push("");
  // WORKING RULES: show the LOADED constitution when available; otherwise label the hardcoded set honestly as a
  // fallback (never present defaults as if they were the loaded runtime-constitution.json).
  const constitutionLoaded = constitutionAvailable && (constitution.principles || []).length > 0;
  // Distinguish loaded-with-principles from loaded-but-empty from genuinely-unavailable — the label must not claim
  // "unavailable" when the file was actually read (just empty).
  const rulesHeader = constitutionLoaded
    ? "WORKING RULES"
    : constitutionAvailable
      ? "WORKING RULES (defaults — runtime-constitution.json has no principles)"
      : "WORKING RULES (defaults — runtime-constitution.json unavailable)";
  L.push(rulesHeader);
  const rules = constitutionLoaded
    ? constitution.principles
    : ["DETERMINISM_FIRST", "EVIDENCE_REQUIRED", "ARTIFACTS_ARE_IMMUTABLE"];
  for (const r of rules) L.push(`  - ${r}`);
  L.push("======================================================================");

  const out = L.length > 99 ? L.slice(0, 99) : L;
  return out.join("\n");
}

module.exports = { render };

if (require.main === module) {
  // Read each source with a null fallback so render can distinguish an ABSENT/unreadable source (fail-VISIBLE UNKNOWN)
  // from a genuinely-present one — never fabricating a healthy default (100% / SYSTEM_READY / 0 recorded / loaded rules)
  // on absence. *Available = the source actually loaded.
  const stateRaw = read(G("runtime-state.json"), null);
  const statusRaw = read(G("runtime-status.json"), null);
  const capsRaw = read(G("capability-registry.json"), null);
  const ledgerRaw = read(G("mission-ledger.json"), null);
  const constitutionRaw = read(path.join("runtime", "constitution", "runtime-constitution.json"), null);
  const queue = read(G("runtime-mission-queue.json"), { queue: [] });
  console.log(render({
    state: stateRaw || {}, stateAvailable: stateRaw !== null,
    status: statusRaw || {}, statusAvailable: statusRaw !== null,
    caps: capsRaw || { capabilities: [], missingCapabilities: [] }, capsAvailable: capsRaw !== null,
    ledger: ledgerRaw || { count: 0, entries: [] }, ledgerAvailable: ledgerRaw !== null,
    constitution: constitutionRaw || { principles: [] }, constitutionAvailable: constitutionRaw !== null,
    queue,
  }));
  // §F — READ-ONLY compass coherence observable: surfaces prose(ODG_PROJECT_STATE.md)/HEAD divergence so a stale
  // prose is visible (CONSISTENT/BEHIND/DIVERGENT/UNKNOWN), never blocking operations, never a fabricated pass.
  try {
    // Phase-2A: compass-update is now compiled into runtime/dist/scripts, so the COMPILED dist dashboard loads it from
    // dist (fail-closed resolveRequiredPort: prefers the dist .js, falls back to the .ts source under tsx, else throws
    // a clear rebuild error — never a silent drop). Restores the §F observable's real content in the production path.
    const compassPort = resolveRequiredPort("runtime/dist/scripts/compass-update.js", "scripts/compass-update.ts", (p: string) => fs.existsSync(path.resolve(process.cwd(), p)));
    const { compassProseDivergence } = require(path.resolve(process.cwd(), compassPort));
    const d = compassProseDivergence(process.cwd());
    console.log(`Compass    : ${d.status}${d.proseHead ? ` (prose ${d.proseHead} vs HEAD ${String(d.head || "?").slice(0, 7)})` : ""} — ${d.reason}`);
  } catch (e: any) {
    // FAIL-VISIBLE: the §F observable must never SILENTLY vanish (that reads as "N/A" when it is really unavailable).
    // If the dist port is somehow missing (dist not built), surface it honestly as UNAVAILABLE rather than dropping
    // the line entirely — never a fabricated pass.
    console.log(`Compass    : UNAVAILABLE — compass-update not loadable in this build (${(e && (e.code || e.message)) || "error"}); run \`npm run build:runtime\` or under tsx`);
  }

  // §G — READ-ONLY supervision summary: the LAST odg-monitor tick result (exposure + maintenance) + its
  // freshness BUCKET. Single source = the monitor's own status files (no second source of truth, no live probe
  // here). Absent/stale ⇒ UNKNOWN, NEVER presented as healthy. Foreign/co-tenant listeners are info only — this
  // line is never an authorization to act on them. Freshness is a coarse bucket (no timestamp) so JS↔dist stay
  // byte-identical. Cadence is 10 min ⇒ a status older than 25 min is STALE.
  try {
    const rd = (f: string) => { try { return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "runtime", "generated", f), "utf8")); } catch { return null; } };
    // supervision-summary IS compiled to dist (added to tsconfig.runtime-dist include) — resolve the dist port under the
    // compiled bin, the .ts under tsx. This RESTORES the §G line in the production (dist) dashboard (it was silently dropped
    // because the source-path require resolved to a non-existent runtime/core/*.js under zero-JS).
    const supPort = resolveRequiredPort("runtime/dist/core/supervision-summary.js", "runtime/core/supervision-summary.js", (p: string) => fs.existsSync(path.resolve(process.cwd(), p)));
    const { summarizeSupervision } = require(path.resolve(process.cwd(), supPort));
    console.log(`Supervision: ${summarizeSupervision(rd("exposure-status.json"), rd("maintenance-status.json"), Date.now())}`);
  } catch (e: any) {
    console.log(`Supervision: UNAVAILABLE — supervision-summary not loadable (${(e && (e.code || e.message)) || "error"})`);
  }
}

export {};
