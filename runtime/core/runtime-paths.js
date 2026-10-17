#!/usr/bin/env node
"use strict";

/*
 * RUNTIME PATHS — a pure, dependency-free resolver for the ONE path problem shared by every runtime/core
 * module that references repo-relative resources: "where am I, and where is the canonical source tree?"
 *
 * A module under runtime/core resolves repo resources relative to its own __dirname. Once compiled to
 * runtime/dist/core the SAME `path.resolve(__dirname, "..", "..")` points at runtime/dist, not the repo —
 * and the sibling .js executors / runtime/config|policies DATA files it needs live ONLY in the SOURCE tree
 * (they are not emitted into dist). So a compiled (dist) consumer must map back to runtime/core / repo root.
 *
 * coreDir(dirname)  → the canonical runtime/core directory for the given module __dirname.
 * repoRoot(dirname) → the repository root (two levels above runtime/core).
 *
 * In SOURCE layout (runtime/core) both are identity-equivalent to the historical `path.resolve(__dirname…)`,
 * so production JS behaviour is byte-for-byte unchanged; only the COMPILED (dist) path is corrected. Pure:
 * no fs/clock/network/spawn; the `path` builtin only. Creates no store/primitive.
 */

const path = require("path");

const DIST_CORE = path.join("runtime", "dist", "core");

// The canonical runtime/core directory for a module running from `dirname`.
function coreDir(dirname) {
  if (typeof dirname === "string" && dirname.endsWith(DIST_CORE)) {
    // runtime/dist/core → repo → runtime/core
    return path.resolve(dirname, "..", "..", "..", "runtime", "core");
  }
  return dirname;
}

// The repository root (two levels above runtime/core), correct from source OR dist.
function repoRoot(dirname) {
  return path.resolve(coreDir(dirname), "..", "..");
}

module.exports = { coreDir, repoRoot };
