#!/usr/bin/env node

/*
 * Runtime Context Loader (TypeScript port; parity with runtime/core/runtime-context-loader.js).
 *
 * Loads runtime/generated/runtime-context.json (CWD-relative — NOT __dirname, compilation-safe),
 * generating it via project-context-engine.js on a cache miss, then validates the shape. Pure port:
 * the public export (loadRuntimeContext), the default mission ("BUILD_RUNTIME"), the cache-miss spawn
 * (node runtime/core/project-context-engine.js <mission>, stdio inherit, throw on non-zero), the
 * validation (throw "Invalid RuntimeContext." unless project.files & project.directories are numbers)
 * and the returned parsed context are preserved EXACTLY. The historical .js remains the reference.
 */

"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");

function loadRuntimeContext(mission: any = "BUILD_RUNTIME"): any {
  const file = "runtime/generated/runtime-context.json";

  if (!fs.existsSync(file)) {
    console.log("[RuntimeContext] Cache missing -> generating...");
    // L7-FIX-2: spawn the COMPILED dist project-context-engine when present (TS-only default); fall back
    // to the source .js (bare sandbox / ODG_RUNTIME=js). Mirrors the _odg_port / stage-base discipline.
    const pceDist = "runtime/dist/core/project-context-engine.js";
    const pce =
      process.env.ODG_RUNTIME !== "js" && fs.existsSync(pceDist) ? pceDist : "runtime/core/project-context-engine.js";
    const r = spawnSync("node", [pce, mission], { stdio: "inherit" });

    if (r.status !== 0) {
      throw new Error("Unable to generate RuntimeContext.");
    }
  }

  const context = JSON.parse(fs.readFileSync(file, "utf8"));

  if (!context.project || typeof context.project.files !== "number" || typeof context.project.directories !== "number") {
    throw new Error("Invalid RuntimeContext.");
  }

  return context;
}

module.exports = { loadRuntimeContext };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names are
// module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};
