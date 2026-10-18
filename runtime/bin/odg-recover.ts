#!/usr/bin/env node
/*
 * ODG Recovery Planner (TS_RECOVERY_PATH) — an EXPLICIT, HONEST boot/recovery decision that makes the
 * runtime's fallback chain testable and fail-closed, as a step toward reducing the ODG_RUNTIME=js reliance.
 *
 * FEASIBILITY (documented, not assumed): `node` executes JavaScript, NOT TypeScript. The compiled dist
 * (runtime/dist, plain CommonJS, builtins-only closure) IS a TS-ORIGIN artifact runnable by bare `node`
 * with no tsx and no node_modules — it is the primary TS recovery substrate. The IRREDUCIBLE limit: when
 * BOTH the compiled dist is absent/invalid AND the toolchain (tsc/tsx/node_modules) is absent, there is NO
 * way to execute or rebuild TypeScript — a committed plain-node (JS) artifact is the ONLY possible
 * recovery. This planner names that minimal prerequisite instead of pretending to have removed it.
 *
 * Pure `planRecovery(probe)` (no I/O) is unit-tested across the 5 required scenarios; `probeEnvironment`
 * and the CLI do the real I/O and NEVER report a false success.
 */

"use strict";

import * as fs from "fs";
import * as path from "path";

export type RecoveryProbe = {
  distPresent: boolean;      // runtime/dist compiled entry + closure manifest exist
  distValid: boolean;        // dist integrity holds (manifest present + entry loads)
  toolchainPresent: boolean; // tsc/tsx (node_modules) available to REBUILD dist from .ts
  committedJsPresent: boolean; // a committed plain-node (source .js) artifact exists as last-resort recovery
};
export type RecoveryAction = "USE_DIST" | "REBUILD_THEN_USE" | "FALLBACK_SOURCE_JS" | "FAIL_CLOSED";
export type RecoveryPlan = { action: RecoveryAction; reason: string; prerequisite?: string; tsOrigin: boolean };

// PURE decision. Deterministic; no I/O. Honest fail-closed: when nothing can run, it REFUSES and names the
// minimal prerequisite — it never returns a "success" action it cannot substantiate.
export function planRecovery(probe: RecoveryProbe): RecoveryPlan {
  const p = probe || ({} as RecoveryProbe);
  if (p.distPresent && p.distValid) {
    return { action: "USE_DIST", reason: "compiled dist present + valid — run the TS-origin runtime on bare node", tsOrigin: true };
  }
  if (p.toolchainPresent) {
    return { action: "REBUILD_THEN_USE", reason: "dist absent/invalid but toolchain present — rebuild dist from .ts (build:runtime) then run the TS-origin runtime", tsOrigin: true };
  }
  if (p.committedJsPresent) {
    return { action: "FALLBACK_SOURCE_JS", reason: "dist absent/invalid AND toolchain absent — no way to execute/rebuild TypeScript; use the committed source .js rollback (ODG_RUNTIME=js). This is the irreducible no-toolchain recovery.", tsOrigin: false };
  }
  return {
    action: "FAIL_CLOSED",
    reason: "no runnable artifact: dist absent/invalid, toolchain absent, and NO committed plain-node artifact — TypeScript cannot be executed or rebuilt. Refusing (no false success).",
    prerequisite: "a committed bare-node artifact (compiled runtime/dist OR the source .js rollback) — OR the toolchain (node_modules + tsc) to rebuild dist from .ts",
    tsOrigin: false,
  };
}

// Real environment probe. distValid reuses the dist-closure manifest as the integrity signal.
export function probeEnvironment(root: string, io: any = fs): RecoveryProbe {
  const ex = (rel: string) => { try { return (io.existsSync || fs.existsSync)(path.join(root, rel)); } catch { return false; } };
  const distEntry = ex("runtime/dist/bin/odg-run.js");
  const distManifest = ex("runtime/dist/dist-closure-manifest.json");
  return {
    distPresent: distEntry && distManifest,
    distValid: distEntry && distManifest, // manifest present ⇒ a completed build (build-dist-closure writes it only on success)
    toolchainPresent: ex("node_modules/.bin/tsc") || ex("node_modules/.bin/tsx"),
    committedJsPresent: ex("runtime/bin/odg-run.js"),
  };
}

// Module-scope marker (adds NO runtime export): forces TypeScript MODULE scope (no global-script collisions).
export {};

// ── CLI: probe → plan → execute; NEVER a false success ─────────────────────────────────────────────
declare const require: any;
declare const module: any;
declare const process: any;
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const { spawnSync } = require("node:child_process");
  const root: string = process.cwd();
  const plan = planRecovery(probeEnvironment(root));
  process.stdout.write(`[odg-recover] action=${plan.action} tsOrigin=${plan.tsOrigin} :: ${plan.reason}\n`);
  const mission = process.argv[2] || "RUNTIME_SELF_AUDIT";
  if (plan.action === "FAIL_CLOSED") {
    process.stderr.write(`[odg-recover] MINIMAL PREREQUISITE: ${plan.prerequisite}\n`);
    process.exit(2);
  }
  if (plan.action === "REBUILD_THEN_USE") {
    const b = spawnSync("npm", ["run", "build:runtime"], { cwd: root, stdio: "inherit" });
    if (b.status !== 0) {
      process.stderr.write("[odg-recover] rebuild FAILED — re-planning fail-closed (no false success)\n");
      const re = planRecovery({ ...probeEnvironment(root), toolchainPresent: false });
      process.stderr.write(`[odg-recover] ${re.action}: ${re.reason}${re.prerequisite ? " :: prerequisite: " + re.prerequisite : ""}\n`);
      process.exit(re.action === "FALLBACK_SOURCE_JS" ? 0 : 2);
    }
  }
  const entry = plan.action === "FALLBACK_SOURCE_JS" ? "runtime/bin/odg-run.js" : "runtime/dist/bin/odg-run.js";
  const env = plan.action === "FALLBACK_SOURCE_JS" ? { ...process.env, ODG_RUNTIME: "js" } : process.env;
  const r = spawnSync("node", [entry, mission], { cwd: root, stdio: "inherit", env });
  process.exit(r.status == null ? 1 : r.status);
}
