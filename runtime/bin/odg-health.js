#!/usr/bin/env node
/**
 * odg health — Unified Runtime Dashboard.
 *
 * Capability: IMPLEMENT_RUNTIME_HEALTH_COMMAND.
 * Reads the EXISTING Runtime artefacts only (no new source of truth) and renders a single,
 * <100-line dashboard: Health, Progress, Blockers, Next Action, Working Rules.
 *
 * Constitution §REUSE_BEFORE_CREATE / §ARTIFACTS_ARE_IMMUTABLE: this command only READS the
 * generated artefacts; it never mutates them.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const G = (name) => path.join(ROOT, "runtime", "generated", name);

function read(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

// OBJ-002 — load the four existing Runtime artefacts (graceful fallback, never throws).
const state = read(G("runtime-state.json"), {});
const status = read(G("runtime-status.json"), {});
const caps = read(G("capability-registry.json"), { capabilities: [], missingCapabilities: [] });
const ledger = read(G("mission-ledger.json"), { count: 0, entries: [] });
const constitution = read(
  path.join(ROOT, "runtime", "constitution", "runtime-constitution.json"),
  { principles: [] }
);

const capList = Array.isArray(caps.capabilities) ? caps.capabilities : [];
const missing = Array.isArray(caps.missingCapabilities) ? caps.missingCapabilities : [];
const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
const lastEntry = entries.at(-1) || {};
const total = capList.length + missing.length;
const pct = total > 0 ? Math.round((capList.length / total) * 100) : 100;

// Next Action — prefer the pending mission queue, fall back to the published nextMission.
const queue = read(G("runtime-mission-queue.json"), { queue: [] });
const nextPending = (queue.queue || []).find((m) => m && m.status === "PENDING");
const nextAction = nextPending
  ? `${nextPending.mission}${nextPending.objective ? " / " + nextPending.objective : ""}`
  : status.nextMission || state.status || "SYSTEM_READY";

const bar = (p) => {
  const filled = Math.round((p / 100) * 20);
  return "[" + "#".repeat(filled) + "-".repeat(20 - filled) + `] ${p}%`;
};

const L = [];
L.push("======================================================================");
L.push("  ODG RUNTIME — UNIFIED HEALTH DASHBOARD");
L.push("======================================================================");

// OBJ-003 — Health.
L.push("HEALTH");
L.push(`  Runtime      : ${status.runtime ?? state.status ?? "UNKNOWN"}`);
L.push(`  Foundation   : ${status.foundation ?? "UNKNOWN"}`);
L.push(`  Pipeline     : ${state.pipeline ?? "UNKNOWN"}`);
L.push(`  Brain        : ${state.brain ?? "UNKNOWN"}`);
L.push("");

// OBJ-003 — Progress.
L.push("PROGRESS");
L.push(`  Capabilities : ${capList.length} ready / ${missing.length} missing`);
L.push(`  Completion   : ${bar(pct)}`);
L.push(`  Missions     : ${ledger.count ?? entries.length} recorded`);
L.push(`  Last Mission : ${lastEntry.mission ?? state.lastMission ?? "N/A"} (${lastEntry.state ?? "?"})`);
L.push("");

// OBJ-003 — Blockers.
L.push("BLOCKERS");
if (missing.length === 0) {
  L.push("  None — all registered capabilities are present.");
} else {
  for (const m of missing.slice(0, 8)) {
    L.push(`  - ${m.id ?? m.goal ?? String(m)}`);
  }
  if (missing.length > 8) L.push(`  ... and ${missing.length - 8} more`);
}
L.push("");

// OBJ-003 — Next Action.
L.push("NEXT ACTION");
L.push(`  ${nextAction}`);
L.push("");

// OBJ-003 — Working Rules (sourced from the immutable runtime constitution).
L.push("WORKING RULES");
const rules = (constitution.principles || []).length
  ? constitution.principles
  : ["DETERMINISM_FIRST", "EVIDENCE_REQUIRED", "ARTIFACTS_ARE_IMMUTABLE"];
for (const r of rules) L.push(`  - ${r}`);
L.push("======================================================================");

// OBJ-003 — enforce the <100-line contract deterministically.
const out = L.length > 99 ? L.slice(0, 99) : L;
console.log(out.join("\n"));
