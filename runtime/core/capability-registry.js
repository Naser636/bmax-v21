#!/usr/bin/env node
/**
 * Capability Registry — pipeline stage.
 *
 * PREVIOUS BEHAVIOUR (incoherent): this stage read the CURRENT mission's execution-plan.json and
 * wrote its objectives that were not one of five hard-coded capability names as
 * "missingCapabilities". So after any mission the Dashboard advertised that mission's own
 * objectives (e.g. "SELF_ENGINEERING_RUNTIME_KERNEL_1") as missing runtime capabilities — a
 * mission-scoped view masquerading as global state.
 *
 * NOW: the registry is the GLOBAL, coherent view derived from the single Runtime model
 * (runtime/core/runtime-model.js) — proven missions are the achieved capabilities, executable
 * not-yet-proven missions are the real forward gap. This is exactly what `odg state` writes, so the
 * pipeline run and the Dashboard agree byte-for-byte. Read-only over the ledger + missions dir;
 * deterministic apart from the isolated `generatedAt`.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { computeRuntimeModel } = require("./runtime-model");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT = path.join(ROOT, "runtime", "generated", "capability-registry.json");

const model = computeRuntimeModel(ROOT);
const registry = {
  generatedAt: new Date().toISOString(),
  status: model.runtime,
  capabilities: model.capabilities,
  missingCapabilities: model.missingCapabilities,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(registry, null, 2));

console.log("======================================");
console.log("CAPABILITY REGISTRY");
console.log("======================================");
console.log("Available :", registry.capabilities.length);
console.log("Missing   :", registry.missingCapabilities.length);
console.log("Output    :", "runtime/generated/capability-registry.json");
console.log("======================================");
