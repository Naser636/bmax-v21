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

  const capList = Array.isArray(caps.capabilities) ? caps.capabilities : [];
  const missing = Array.isArray(caps.missingCapabilities) ? caps.missingCapabilities : [];
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const lastEntry = entries.at(-1) || {};
  const total = capList.length + missing.length;
  const pct = total > 0 ? Math.round((capList.length / total) * 100) : 100;

  const lastRun = state.lastRun && typeof state.lastRun === "object" ? state.lastRun : null;

  const nextPending = (queue.queue || []).find((m: any) => m && m.status === "PENDING");
  const nextMissionName = nextPending ? nextPending.mission : (status.nextMission || state.status || "SYSTEM_READY");
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
  L.push(`  Capabilities : ${capList.length} ready / ${missing.length} missing`);
  L.push(`  Completion   : ${bar(pct)}`);
  L.push(`  Missions     : ${ledger.count ?? entries.length} recorded`);
  L.push(`  Last Mission : ${lastEntry.mission ?? state.lastMission ?? "N/A"} (${lastEntry.state ?? "?"})`);
  if (lastRun) L.push(`  Last Run     : ${lastRun.mission} — ${lastRun.status}${lastRun.validated ? "" : " (validated=false)"}`);
  L.push("");
  L.push("BLOCKERS");
  if (missing.length === 0) {
    L.push("  None — all registered capabilities are present.");
  } else {
    for (const m of missing.slice(0, 8)) L.push(`  - ${m.id ?? m.goal ?? String(m)}`);
    if (missing.length > 8) L.push(`  ... and ${missing.length - 8} more`);
  }
  L.push("");
  L.push("NEXT ACTION");
  L.push(`  ${nextActionLine}`);
  L.push("");
  L.push("WORKING RULES");
  const rules = (constitution.principles || []).length
    ? constitution.principles
    : ["DETERMINISM_FIRST", "EVIDENCE_REQUIRED", "ARTIFACTS_ARE_IMMUTABLE"];
  for (const r of rules) L.push(`  - ${r}`);
  L.push("======================================================================");

  const out = L.length > 99 ? L.slice(0, 99) : L;
  return out.join("\n");
}

module.exports = { render };

if (require.main === module) {
  const state = read(G("runtime-state.json"), {});
  const status = read(G("runtime-status.json"), {});
  const caps = read(G("capability-registry.json"), { capabilities: [], missingCapabilities: [] });
  const ledger = read(G("mission-ledger.json"), { count: 0, entries: [] });
  const constitution = read(path.join("runtime", "constitution", "runtime-constitution.json"), { principles: [] });
  const queue = read(G("runtime-mission-queue.json"), { queue: [] });
  console.log(render({ state, status, caps, ledger, constitution, queue }));
}

export {};
