#!/usr/bin/env node
/*
 * odg status — READ-ONLY Foundation dashboard (TS port → runtime/dist/bin/odg-status.js, the DEFAULT;
 * runtime/bin/odg-status.js is the ODG_RUNTIME=js rollback). Reads runtime/generated artifacts
 * (cwd-relative, repo root) + the capability classifier; prints the status block. No writes/spawn/network.
 * cwd-relative paths are robust from any dist depth (lesson from the odg-cockpit dist path-depth fix).
 *
 * FAIL-VISIBLE (B-3, V2 Pole B — mirrors the odg-health fabricated-health fix): a fresh checkout or a wiped
 * runtime/generated/ made this dashboard print `Capabilities: 0 / Missing: 0 / Converged: NO / Next Mission:
 * SYSTEM_READY` — reading as "no gaps, system ready" when the TRUE state is UNKNOWN (artifacts never built).
 * render() now takes per-source availability flags and shows UNKNOWN for any absent source instead of a
 * fabricated healthy default; SYSTEM_READY is gated on status/state actually having loaded.
 */
const fs = require("fs");
const path = require("path");
// "../core/prefer-dist-bin.js" resolves from BOTH runtime/bin (tsx) and runtime/dist/bin (compiled) — same as odg-health.
const { resolveRequiredPort } = require("../core/prefer-dist-bin.js");

// Read a source with a NULL fallback so the caller can distinguish an ABSENT/unreadable source (⇒ fail-VISIBLE
// UNKNOWN) from one that genuinely loaded. Never collapse absence into a healthy-looking empty default.
function readOrNull(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

/**
 * render(artifacts): PURE Foundation-dashboard renderer (unit-testable; no fs/require). An absent source
 * (available flag false) is shown as UNKNOWN, never a fabricated healthy value. `classifiedLine` is the
 * CM-4 decomposition string the CLI computed (it requires a dynamic import, so it is resolved outside).
 */
function render(artifacts: any): string[] {
  const a = artifacts || {};
  const av = a.available || {};
  const status = a.status || {};
  const state = a.state || {};
  const caps = a.caps || {};
  const ledger = a.ledger || { entries: [] };
  const queue = a.queue || { queue: [] };

  const statusAvailable = av.status === true;
  const stateAvailable = av.state === true;
  const capsAvailable = av.caps === true;
  const ledgerAvailable = av.ledger === true;
  const queueAvailable = av.queue === true;

  const qlist = Array.isArray(queue.queue) ? queue.queue : [];
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const next = qlist.find((m: any) => m && m.status === "PENDING");
  const outstanding = Array.isArray(state.outstanding) ? state.outstanding : [];

  const L: string[] = [];
  L.push("======================================");
  L.push("ODG FOUNDATION DASHBOARD");
  L.push("======================================");
  L.push("Runtime            : " + (statusAvailable ? (status.runtime ?? "UNKNOWN") : "UNKNOWN — runtime-status unavailable"));
  L.push("Foundation         : " + (statusAvailable ? (status.foundation ?? "UNKNOWN") : "UNKNOWN — runtime-status unavailable"));
  // Converged is a STATE claim; absent state must not read as a definite "NO" (which looks like a known-not-converged
  // healthy-enough system) — it is genuinely UNKNOWN.
  L.push("Converged          : " + (stateAvailable ? (state.converged === true ? "YES" : "NO") : "UNKNOWN — runtime-state unavailable"));
  L.push("Capabilities       : " + (capsAvailable ? String((caps.capabilities || []).length) : "UNKNOWN — capability-registry unavailable"));
  L.push("  classified       : " + (a.classifiedLine || "UNAVAILABLE"));
  L.push("Missing            : " + (capsAvailable ? String((caps.missingCapabilities || []).length) : "UNKNOWN — capability-registry unavailable (not a fabricated 0)"));
  L.push("Last Mission       : " + ((!ledgerAvailable && !stateAvailable) ? "UNKNOWN — mission-ledger/state unavailable" : (entries.at(-1)?.mission || "N/A")));
  // SYSTEM_READY is only honest when a real source said so; otherwise an absent-status+absent-state system is
  // UNKNOWN, not "ready" (the exact fabricated-green the sibling odg-health fix removed).
  L.push("Next Mission       : " + (next?.mission ?? state.nextMission ?? ((statusAvailable || stateAvailable) ? "SYSTEM_READY" : "UNKNOWN — runtime status/state unavailable")));
  L.push("Objective          : " + (next?.objective ?? "-"));
  L.push("Goal               : " + (next?.goal ?? "-"));
  L.push("Queue Remaining    : " + (queueAvailable ? String(qlist.filter((m: any) => m && m.status === "PENDING").length) : "UNKNOWN — mission-queue unavailable"));
  L.push("Outstanding Gaps   : " + (stateAvailable ? String(outstanding.length) : "UNKNOWN — runtime-state unavailable"));
  for (const o of outstanding) {
    L.push("  - " + o.mission + " — " + o.reason + " " + (o.repairNominated ? "(repair nominated)" : ""));
  }
  L.push("======================================");
  return L;
}

// CM-4 honest decomposition. Phase-2A: capability-classify is compiled into runtime/dist/scripts, so the COMPILED
// dist status bin loads it from dist (fail-closed resolveRequiredPort: prefers the dist .js, falls back to the .ts
// source under tsx, else throws a clear rebuild error — never a silent drop). Returns the classified line string.
function classifiedLineFor(caps: any, capsAvailable: boolean): string {
  if (!capsAvailable) return "UNKNOWN — capability-registry unavailable";
  try {
    const classifyPort = resolveRequiredPort("runtime/dist/scripts/capability-classify.js", "scripts/capability-classify.ts", (p: string) => fs.existsSync(path.resolve(process.cwd(), p)));
    const { classify } = require(path.resolve(process.cwd(), classifyPort));
    const k = classify((caps.capabilities || []).map((c: any) => typeof c === "string" ? c : (c.id || c.name || c.capability || "")));
    return "business=" + k.businessCandidate + " · mission-derived=" + k.missionDerived + " · nl-generated=" + k.nlGenerated + (k.duplicates.length ? " · dup=" + k.duplicates.length : "") + (k.coherent ? " · coherent" : " · INCOHERENT");
  } catch (e: any) {
    // FAIL-VISIBLE: don't silently drop the CM-4 decomposition — say so honestly, never a fabricated pass.
    return "UNAVAILABLE — capability-classify not loadable in this build (" + ((e && (e.code || e.message)) || "error") + ")";
  }
}

function main(): void {
  const status = readOrNull("runtime/generated/runtime-status.json");
  const state = readOrNull("runtime/generated/runtime-state.json");
  const caps = readOrNull("runtime/generated/capability-registry.json");
  const ledger = readOrNull("runtime/generated/mission-ledger.json");
  const queue = readOrNull("runtime/generated/runtime-mission-queue.json");
  const available = {
    status: status !== null,
    state: state !== null,
    caps: caps !== null,
    ledger: ledger !== null,
    queue: queue !== null,
  };
  const classifiedLine = classifiedLineFor(caps || {}, available.caps);
  const lines = render({ status, state, caps, ledger, queue, available, classifiedLine });
  for (const l of lines) console.log(l);
}

module.exports = { render, classifiedLineFor, readOrNull };

if (require.main === module) { main(); }

export {};
