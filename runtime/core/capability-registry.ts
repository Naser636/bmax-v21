/*
 * Capability Registry — pipeline stage. TypeScript canonical (Lot η3-B1 migration; strict-typed under
 * tsconfig.runtime-leaves-strict.json — NO ts-nocheck, NO unjustified any).
 *
 * BEHAVIOUR (byte-identical to the historical runtime/core/capability-registry.js EXCEPT the intrinsically
 * volatile `generatedAt` wall-clock field, present in the historical output too; the equivalence test
 * normalises it): derive the GLOBAL, coherent registry view from the single Runtime model
 * (runtime/core/runtime-model.js) — proven missions are the achieved capabilities, executable not-yet-proven
 * missions are the real forward gap — and write it to runtime/generated/capability-registry.json, then print
 * the four summary lines. This is exactly what `odg state` writes, so the pipeline run and the Dashboard agree.
 *
 * PATH INVARIANT (the reason this lot exists): the historical script derived its root from
 * `path.resolve(__dirname, "..", "..")`. From runtime/core that is the project root, but a copy relocated to
 * runtime/dist/core would resolve to runtime/dist and write the artifact to the WRONG tree
 * (runtime/dist/generated/capability-registry.json). This port fixes the one path concern and nothing else:
 * the project root is process.cwd() in the verified launch context (the pipeline always spawns each stage with
 * cwd = repo root), which is EQUAL to the historical __dirname-derived root when run from runtime/core, and
 * STILL correct when the compiled module runs from runtime/dist/core. No other business behaviour changes.
 *
 * The legacy .js is untouched and remains the production default; this compiled module is reached ONLY via the
 * ODG_STAGE_BASE opt-in. runtime-model.js is historical JS (no .d.ts, deliberately outside the TS project —
 * allowJs is off), so it is require()'d across the JS boundary behind an explicit typed contract.
 */
import * as fs from "fs";
import * as path from "path";

/** The subset of the Runtime model this stage consumes. Narrow, explicit types at the dynamic JS boundary. */
interface RuntimeModel {
  runtime: string;
  capabilities: unknown[];
  missingCapabilities: unknown[];
}

const { computeRuntimeModel } = require("./runtime-model") as {
  computeRuntimeModel: (root?: string) => RuntimeModel;
};

const ROOT: string = process.cwd();
const OUT: string = path.join(ROOT, "runtime", "generated", "capability-registry.json");

const model: RuntimeModel = computeRuntimeModel(ROOT);
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
