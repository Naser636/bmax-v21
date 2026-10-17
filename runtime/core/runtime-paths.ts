#!/usr/bin/env node
"use strict";

/*
 * RUNTIME PATHS — TypeScript port; parity with runtime/core/runtime-paths.js.
 *
 * A pure, dependency-free resolver for the ONE path problem shared by every runtime/core module that
 * references repo-relative resources: "where am I, and where is the canonical source tree?" A module under
 * runtime/core resolves repo resources relative to its own __dirname; once compiled to runtime/dist/core the
 * SAME resolution points at runtime/dist, not the repo — and the sibling .js executors / runtime/config|
 * policies DATA files it needs live ONLY in the SOURCE tree. So a compiled (dist) consumer must map back.
 *
 * coreDir(dirname)  → the canonical runtime/core directory for the given module __dirname.
 * repoRoot(dirname) → the repository root (two levels above runtime/core).
 *
 * Pure: no fs/clock/network/spawn; the `path` builtin only. Source behaviour byte-for-byte unchanged.
 */

import path from "node:path";

const DIST_CORE = path.join("runtime", "dist", "core");

// The canonical runtime/core directory for a module running from `dirname`.
function coreDir(dirname: string): string {
  if (typeof dirname === "string" && dirname.endsWith(DIST_CORE)) {
    // runtime/dist/core → repo → runtime/core
    return path.resolve(dirname, "..", "..", "..", "runtime", "core");
  }
  return dirname;
}

// The repository root (two levels above runtime/core), correct from source OR dist.
function repoRoot(dirname: string): string {
  return path.resolve(coreDir(dirname), "..", "..");
}

export { coreDir, repoRoot };
module.exports = { coreDir, repoRoot };
