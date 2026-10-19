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

// Regenerate a cache older than this on load. 24h (CTO-authorized) — compatible with existing usages: the
// pipeline-entry load already regenerates on cache MISS, this only extends it to a STALE cache; the repo
// already uses a 1h freshness convention (odg-cockpit staleMs) so a conservative 24h TTL introduces no new
// policy class. Overridable via opts.maxAgeMs (so the window is a parameter, not a hardcoded fiat).
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// PURE staleness predicate (injected clock → deterministic). A cache is STALE only when it carries a
// PARSEABLE string generatedAt older than maxAgeMs. An ABSENT/invalid date, or a non-positive policy, is
// treated as NOT stale (age indeterminate ⇒ keep the cache — preserves prior behaviour and avoids surprise
// regeneration); a non-object context ⇒ stale (unusable). Never throws.
function isStale(context: any, nowMs: any, maxAgeMs: any): boolean {
  if (!context || typeof context !== "object") return true;
  const ts = context.generatedAt;
  if (typeof ts !== "string") return false;
  const gen = Date.parse(ts);
  if (Number.isNaN(gen)) return false;
  if (typeof nowMs !== "number" || typeof maxAgeMs !== "number" || maxAgeMs <= 0) return false;
  return nowMs - gen > maxAgeMs;
}

function loadRuntimeContext(mission: any = "BUILD_RUNTIME", opts: any = {}): any {
  const file = "runtime/generated/runtime-context.json";
  const spawn = typeof opts.spawn === "function" ? opts.spawn : spawnSync;
  const nowMs = typeof opts.now === "number" ? opts.now : Date.now();
  const maxAgeMs = typeof opts.maxAgeMs === "number" ? opts.maxAgeMs : DEFAULT_MAX_AGE_MS;

  // Regenerate on cache MISS, STALE (old generatedAt), or CORRUPT (unparseable) — root-cause fix for a
  // cache that was frozen because only the MISS case regenerated. The staleness peek reads the file only
  // when it exists; the final read+validate below is unchanged (byte-identical parity with the .js twin).
  let regenerate = !fs.existsSync(file);
  let reason = regenerate ? "missing" : "";
  if (!regenerate) {
    try {
      if (isStale(JSON.parse(fs.readFileSync(file, "utf8")), nowMs, maxAgeMs)) { regenerate = true; reason = "stale"; }
    } catch {
      regenerate = true;
      reason = "corrupt";
    }
  }

  if (regenerate) {
    console.log(`[RuntimeContext] Cache ${reason} -> generating...`);
    // L7-FIX-2: spawn the COMPILED dist project-context-engine when present (TS-only default); fall back
    // to the source .js (bare sandbox / ODG_RUNTIME=js). Mirrors the _odg_port / stage-base discipline.
    const pceDist = "runtime/dist/core/project-context-engine.js";
    const pce =
      process.env.ODG_RUNTIME !== "js" && fs.existsSync(pceDist) ? pceDist : "runtime/core/project-context-engine.js";
    const r = spawn("node", [pce, mission], { stdio: "inherit" });

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

module.exports = { loadRuntimeContext, isStale };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names are
// module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};
