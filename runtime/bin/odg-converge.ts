#!/usr/bin/env node
/*
 * `odg converge` — thin launcher for the Runtime Convergence Orchestrator.
 *
 * Runs the TypeScript entrypoint (src/runtime/converge-cli.ts) with tsx so the existing autonomy
 * core, adapter, Mission Contract Factory and migration registry are reused exactly as-is. Adds no
 * logic; forwards the exit code (PLAN_COMPLETE → 0, BLOCKED → 2, else → 1).
 */
/* TS port → runtime/dist/bin/odg-converge.js (DEFAULT); runtime/bin/odg-converge.js = ODG_RUNTIME=js rollback. */
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd(); // repo root (wrapper cwd) — robust from any dist depth; __dirname breaks under dist/bin
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const entry = path.join(root, "src", "runtime", "converge-cli.ts");

// V16.1 — forward argv verbatim (odg-delegate passes --mission=<ID> [--delegated-path=<p>...] for a MISSION-SCOPED
// converge). No argument ⇒ argv is [entry] exactly as before ⇒ the unchanged campaign-wide converge.
const r = spawnSync(tsx, [entry, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);

export {};
