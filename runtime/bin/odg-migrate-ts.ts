#!/usr/bin/env node
/*
 * `odg migrate-ts [lot]` — thin launcher for the single-command TypeScript migration campaign (η3-B78).
 *
 * Runs the TypeScript entrypoint (src/runtime/migrate-ts-cli.ts) with tsx so the existing build:runtime
 * toolchain, strict gate and equivalence-bench recipe are reused exactly as-is. Adds no logic; forwards
 * argv (the lot name, default "validation-engine") and the exit code (0 all gates PASS, 1 a gate FAILed,
 * 2 BLOCKED — lot not authorised or Truth Lock refused). Never writes the repo; never touches the .js.
 */
/* TS port → runtime/dist/bin/odg-migrate-ts.js (DEFAULT); runtime/bin/odg-migrate-ts.js = ODG_RUNTIME=js rollback. */
const path = require("path");
const { spawnSync } = require("child_process");

const root = process.cwd(); // repo root (wrapper cwd) — robust from any dist depth; __dirname breaks under dist/bin
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const entry = path.join(root, "src", "runtime", "migrate-ts-cli.ts");

const r = spawnSync(tsx, [entry, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);

export {};
