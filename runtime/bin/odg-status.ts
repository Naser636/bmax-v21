#!/usr/bin/env node
/*
 * odg status — READ-ONLY Foundation dashboard (TS port → runtime/dist/bin/odg-status.js, the DEFAULT;
 * runtime/bin/odg-status.js is the ODG_RUNTIME=js rollback). Reads runtime/generated artifacts
 * (cwd-relative, repo root) + the capability classifier; prints the status block. No writes/spawn/network.
 * cwd-relative paths are robust from any dist depth (lesson from the odg-cockpit dist path-depth fix).
 */
const fs = require("fs");
const path = require("path");
// "../core/prefer-dist-bin.js" resolves from BOTH runtime/bin (tsx) and runtime/dist/bin (compiled) — same as odg-health.
const { resolveRequiredPort } = require("../core/prefer-dist-bin.js");

function read(file: string, fallback: any = {}): any {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return fallback; }
}

const status = read("runtime/generated/runtime-status.json");
const state = read("runtime/generated/runtime-state.json");
const caps = read("runtime/generated/capability-registry.json");
const ledger = read("runtime/generated/mission-ledger.json", { entries: [] });
const queue = read("runtime/generated/runtime-mission-queue.json", { queue: [] });

const lastMission = (ledger.entries || []).at(-1)?.mission || "N/A";
const next = queue.queue.find((m: any) => m.status === "PENDING");
const outstanding = Array.isArray(state.outstanding) ? state.outstanding : [];
const converged = state.converged === true;

console.log("======================================");
console.log("ODG FOUNDATION DASHBOARD");
console.log("======================================");
console.log("Runtime            :", status.runtime ?? "UNKNOWN");
console.log("Foundation         :", status.foundation ?? "UNKNOWN");
console.log("Converged          :", converged ? "YES" : "NO");
console.log("Capabilities       :", (caps.capabilities || []).length);
// CM-4 honest decomposition. Phase-2A: capability-classify is now compiled into runtime/dist/scripts, so the
// COMPILED dist status bin loads it from dist (fail-closed resolveRequiredPort: prefers the dist .js, falls back to
// the .ts source under tsx, else throws a clear rebuild error — never a silent drop).
try {
  const classifyPort = resolveRequiredPort("runtime/dist/scripts/capability-classify.js", "scripts/capability-classify.ts", (p: string) => fs.existsSync(path.resolve(process.cwd(), p)));
  const { classify } = require(path.resolve(process.cwd(), classifyPort));
  const k = classify((caps.capabilities || []).map((c: any) => typeof c === "string" ? c : (c.id || c.name || c.capability || "")));
  console.log("  classified       :", "business=" + k.businessCandidate, "· mission-derived=" + k.missionDerived, "· nl-generated=" + k.nlGenerated + (k.duplicates.length ? " · dup=" + k.duplicates.length : "") + (k.coherent ? " · coherent" : " · INCOHERENT"));
} catch (e: any) {
  // FAIL-VISIBLE: don't silently drop the CM-4 decomposition. If the dist port is somehow missing (dist not built),
  // say so honestly rather than dropping the line — never a fabricated pass.
  console.log("  classified       : UNAVAILABLE — capability-classify not loadable in this build (" + ((e && (e.code || e.message)) || "error") + ")");
}
console.log("Missing            :", (caps.missingCapabilities || []).length);
console.log("Last Mission       :", lastMission);
console.log("Next Mission       :", next?.mission ?? state.nextMission ?? "SYSTEM_READY");
console.log("Objective          :", next?.objective ?? "-");
console.log("Goal               :", next?.goal ?? "-");
console.log("Queue Remaining    :", queue.queue.filter((m: any) => m.status === "PENDING").length);
console.log("Outstanding Gaps   :", outstanding.length);
for (const o of outstanding) {
  console.log("  -", o.mission, "—", o.reason, o.repairNominated ? "(repair nominated)" : "");
}
console.log("======================================");

export {};
