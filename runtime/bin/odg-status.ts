#!/usr/bin/env node
/*
 * odg status — READ-ONLY Foundation dashboard (TS port → runtime/dist/bin/odg-status.js, the DEFAULT;
 * runtime/bin/odg-status.js is the ODG_RUNTIME=js rollback). Reads runtime/generated artifacts
 * (cwd-relative, repo root) + the capability classifier; prints the status block. No writes/spawn/network.
 * cwd-relative paths are robust from any dist depth (lesson from the odg-cockpit dist path-depth fix).
 */
const fs = require("fs");
const path = require("path");

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
// CM-4 honest decomposition. cwd-relative require so it resolves from BOTH runtime/bin and
// runtime/dist/bin (the __dirname-relative "../../scripts" path breaks from the deeper dist dir).
try {
  const { classify } = require(path.resolve(process.cwd(), "scripts", "capability-classify.js"));
  const k = classify((caps.capabilities || []).map((c: any) => typeof c === "string" ? c : (c.id || c.name || c.capability || "")));
  console.log("  classified       :", "business=" + k.businessCandidate, "· mission-derived=" + k.missionDerived, "· nl-generated=" + k.nlGenerated + (k.duplicates.length ? " · dup=" + k.duplicates.length : "") + (k.coherent ? " · coherent" : " · INCOHERENT"));
} catch { /* classifier optional — never break status */ }
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
