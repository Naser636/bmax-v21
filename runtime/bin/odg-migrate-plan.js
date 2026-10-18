#!/usr/bin/env node
/*
 * `odg migrate-plan [--record] [--json] [--head <sha>]` — thin launcher for the Migration Campaign
 * Planner (V20 Gate B = EXTEND). Mirrors odg-migrate-ts.js exactly: runs the TypeScript entrypoint
 * (src/runtime/migration-campaign.ts) with tsx so no parallel mechanism is invented. Adds no logic;
 * forwards argv and the exit code (0 a plan was produced — PASS/BLOCKED/SKIPPED/NONE are all valid
 * plans; 2 operational failure, e.g. not a repo / missing core dir). READ-ONLY by default: it scans
 * and RECOMMENDS the next lot that `odg migrate-ts <lot>` then executes under its own authorisation
 * gate. `--record` persists a resumable campaign checkpoint into the gitignored generated/ dir only.
 * Never writes source, never runs a migration, never commits.
 */
const path = require("path");
const { spawnSync } = require("child_process");
const root = process.cwd(); // repo root (wrapper cwd) — identical to the TS port (launcher-family consistency)
const tsx = path.join(root, "node_modules", ".bin", "tsx");
const entry = path.join(root, "src", "runtime", "migration-campaign.ts");
const r = spawnSync(tsx, [entry, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" });
process.exit(r.status == null ? 1 : r.status);
