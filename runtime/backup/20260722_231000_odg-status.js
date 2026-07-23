#!/usr/bin/env node
const fs = require("fs");

function read(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

const state  = read("runtime/generated/runtime-state.json");
const status = read("runtime/generated/runtime-status.json");
const caps   = read("runtime/generated/capability-registry.json");
const ledger = read("runtime/generated/mission-ledger.json", { entries: [] });

const lastMission =
  (ledger.entries && ledger.entries.length)
    ? ledger.entries[ledger.entries.length - 1].mission
    : "N/A";

console.log("======================================");
console.log("ODG FOUNDATION DASHBOARD");
console.log("======================================");
console.log("Runtime            :", status.runtime ?? "UNKNOWN");
console.log("Foundation         :", status.foundation ?? "UNKNOWN");
console.log("Capabilities       :", (caps.capabilities || []).length);
console.log("Missing            :", (caps.missingCapabilities || []).length);
console.log("Last Mission       :", lastMission);
console.log("Next Mission       :", status.nextMission ?? "N/A");
console.log("Recommended Action :",
  (caps.missingCapabilities || []).length
    ? caps.missingCapabilities[0].id
    : "SYSTEM_READY");
console.log("======================================");
