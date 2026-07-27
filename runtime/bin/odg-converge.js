#!/usr/bin/env node
/*
 * `odg converge` — thin launcher for the Runtime Convergence Orchestrator.
 *
 * Runs the TypeScript entrypoint (src/runtime/converge-cli.ts) with tsx so the existing autonomy
 * core, adapter, Mission Contract Factory and migration registry are reused exactly as-is. Adds no
 * logic; forwards the exit code (PLAN_COMPLETE → 0, BLOCKED → 2, else → 1).
 */
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const entry = path.join(root, "src", "runtime", "converge-cli.ts");

const r = spawnSync(tsx, [entry], { cwd: root, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);
