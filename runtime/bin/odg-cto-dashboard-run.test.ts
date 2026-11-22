#!/usr/bin/env node
"use strict";
/* V15.0 — the CTO dashboard entry RUNS on the real repo, loads its downstream chain (incl. odg-metier-improvement-index),
 * returns the canonical sections and writes nothing to the repository. */
const cp = require("child_process"); const path = require("path");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ROOT = path.resolve(__dirname, "../..");
const before = cp.spawnSync("git", ["status", "--porcelain=v1"], { cwd: ROOT, encoding: "utf8" }).stdout;
const r = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), path.join(ROOT, "runtime/bin/odg-cto-dashboard-run.ts"), "--summary"], { cwd: ROOT, encoding: "utf8", timeout: 240000 });
let o: any = {}; try { o = JSON.parse(r.stdout); } catch {}
check("entry exits 0", r.status === 0);
check("returns the canonical dashboard sections (missions, primitives, improvements, productionGates)", Array.isArray(o.sectionNames) && ["missions", "primitives", "improvements", "productionGates"].every((k) => o.sectionNames.includes(k)));
const full = cp.spawnSync(process.execPath, [path.join(ROOT, "node_modules/.bin/tsx"), "-e", "const D=require('./runtime/core/odg-cto-dashboard.js');const r=D.build();process.stdout.write(String(!!(r.improvements)))"], { cwd: ROOT, encoding: "utf8", timeout: 240000 });
check("the improvement chain (odg-metier-improvement-index) is exercised through the dashboard", full.stdout === "true");
check("writes nothing to the repository", cp.spawnSync("git", ["status", "--porcelain=v1"], { cwd: ROOT, encoding: "utf8" }).stdout === before);
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-cto-dashboard-run (V15.0)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
