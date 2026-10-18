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

// ── EXECUTE SEAM: probe → plan → (rebuild) → spawn; NEVER a false success ────────────────────────────
// Injectable `spawn`/`probe`/`env` make the action→entry→exit mapping unit-testable with no real build or
// child process. CRITICAL fail-closed invariant: a recovery action is only ever reported "successful" after
// the recovery entry was ACTUALLY spawned — a failed rebuild that falls back to FALLBACK_SOURCE_JS must RUN
// the committed JS, not exit 0 having spawned nothing (the previous CLI did the latter: a silent false pass).
export type SpawnResult = { status: number | null };
export type SpawnFn = (cmd: string, args: string[], opts: any) => SpawnResult;
export type ExecuteDeps = {
  spawn: SpawnFn;
  probe?: RecoveryProbe;
  mission?: string;
  env?: any;
  out?: (s: string) => void;
};
export type ExecuteResult = { exitCode: number; action: RecoveryAction; spawned: string | null; env: any };

export function executeRecovery(root: string, deps: ExecuteDeps): ExecuteResult {
  const spawn = deps.spawn;
  const out = typeof deps.out === "function" ? deps.out : () => {};
  const baseEnv = deps.env || {};
  const mission = deps.mission || "RUNTIME_SELF_AUDIT";
  const probe: RecoveryProbe = deps.probe || probeEnvironment(root);
  let plan = planRecovery(probe);
  out(`[odg-recover] action=${plan.action} tsOrigin=${plan.tsOrigin} :: ${plan.reason}`);

  if (plan.action === "FAIL_CLOSED") {
    out(`[odg-recover] MINIMAL PREREQUISITE: ${plan.prerequisite}`);
    return { exitCode: 2, action: plan.action, spawned: null, env: baseEnv };
  }

  if (plan.action === "REBUILD_THEN_USE") {
    const b = spawn("npm", ["run", "build:runtime"], { cwd: root, stdio: "inherit" });
    if (b.status !== 0) {
      // Rebuild failed ⇒ toolchain is effectively unusable; re-plan WITHOUT it and FALL THROUGH to actually
      // run whatever recovery remains (committed JS) — never exit 0 having spawned nothing.
      plan = planRecovery({ ...probe, toolchainPresent: false });
      out(`[odg-recover] rebuild FAILED — re-planned ${plan.action}: ${plan.reason}`);
      if (plan.action === "FAIL_CLOSED") {
        out(`[odg-recover] MINIMAL PREREQUISITE: ${plan.prerequisite}`);
        return { exitCode: 2, action: plan.action, spawned: null, env: baseEnv };
      }
      // else plan is now FALLBACK_SOURCE_JS (committed JS present) → continue to the spawn below.
    }
  }

  const entry = plan.action === "FALLBACK_SOURCE_JS" ? "runtime/bin/odg-run.js" : "runtime/dist/bin/odg-run.js";
  const env = plan.action === "FALLBACK_SOURCE_JS" ? { ...baseEnv, ODG_RUNTIME: "js" } : baseEnv;
  const r = spawn("node", [entry, mission], { cwd: root, stdio: "inherit", env });
  return { exitCode: r.status == null ? 1 : r.status, action: plan.action, spawned: entry, env };
}

// ── CLI: thin wrapper over executeRecovery with the real spawnSync + process.env ─────────────────────
declare const require: any;
declare const module: any;
declare const process: any;
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  const { spawnSync } = require("node:child_process");
  const res = executeRecovery(process.cwd(), {
    spawn: (cmd: string, args: string[], opts: any) => spawnSync(cmd, args, opts),
    mission: process.argv[2] || "RUNTIME_SELF_AUDIT",
    env: process.env,
    out: (s: string) => process.stdout.write(s + "\n"),
  });
  process.exit(res.exitCode);
}
