#!/usr/bin/env node
/*
 * `odg autonomy` — thin launcher for the Runtime Autonomy CLI.
 *
 * Runs the TypeScript entrypoint (src/runtime/autonomy-cli.ts) with tsx so the existing
 * capability core + adapter are reused exactly as-is. Adds no logic; forwards the exit code.
 */
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..", "..");
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const entry = path.join(root, "src", "runtime", "autonomy-cli.ts");

const r = spawnSync(tsx, [entry], { cwd: root, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);
