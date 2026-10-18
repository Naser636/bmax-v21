#!/usr/bin/env node
"use strict";
/*
 * SPAWN-LAUNCHER + FREEZE DUAL-PORT PARITY (CTO large-lot batch) — odg-freeze, odg-migrate-plan,
 * odg-migrate-ts. Each: JS rollback (runtime/bin/odg-X.js) vs compiled-TS default (runtime/dist/bin/
 * odg-X.js). The spawn-launchers (migrate-plan/migrate-ts) resolve `root` cwd-relative (was __dirname —
 * the dist-depth bug) and spawn `tsx src/runtime/<entry>.ts`; proving root resolution + exit forwarding
 * via a READ-ONLY (migrate-plan --json) and a fast BLOCKED (migrate-ts <bogus-lot>) path — no migration
 * runs, no source written. odg-freeze writes runtime-freeze.json (snapshot/restored; timestamp normalized).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const JS = (b) => path.join(REPO, "runtime", "bin", b + ".js");
const TS = (b) => path.join(REPO, "runtime", "dist", "bin", b + ".js");
const run = (script, args) => cp.spawnSync(process.execPath, [script, ...(args || [])], { cwd: REPO, encoding: "utf8", timeout: 120000 });
const normTs = (s) => String(s || "").replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, "<TS>");

// --- odg-freeze (writes runtime/generated/runtime-freeze.json → snapshot/restore) -----------------
{
  const F = path.join(REPO, "runtime", "generated", "runtime-freeze.json");
  const snap = { exists: fs.existsSync(F), data: fs.existsSync(F) ? fs.readFileSync(F) : null };
  const restore = () => { try { if (snap.exists) fs.writeFileSync(F, snap.data); else if (fs.existsSync(F)) fs.unlinkSync(F); } catch { /**/ } };
  const rj = run(JS("odg-freeze")); const outJ = fs.existsSync(F) ? fs.readFileSync(F, "utf8") : ""; restore();
  const rt = run(TS("odg-freeze")); const outT = fs.existsSync(F) ? fs.readFileSync(F, "utf8") : ""; restore();
  ok("odg-freeze: same exit + identical stdout", rj.status === rt.status && (rj.stdout || "") === (rt.stdout || ""));
  ok("odg-freeze: written runtime-freeze.json identical (generatedAt normalized)", normTs(outJ) === normTs(outT) && /FROZEN/.test(outJ));
}

// --- odg-migrate-plan --json (READ-ONLY planner; deterministic) -----------------------------------
{
  const rj = run(JS("odg-migrate-plan"), ["--json"]);
  const rt = run(TS("odg-migrate-plan"), ["--json"]);
  ok("odg-migrate-plan --json: same exit code", rj.status === rt.status);
  ok("odg-migrate-plan --json: dist(TS) stdout IDENTICAL to js (root resolved + tsx entry spawned correctly)", normTs(rj.stdout || "") === normTs(rt.stdout || ""));
  ok("odg-migrate-plan --json: non-vacuous (planner actually ran)", (rj.stdout || "").length > 0);
}

// --- odg-migrate-ts <bogus-lot> (fast BLOCKED; no migration, no write) ----------------------------
{
  const rj = run(JS("odg-migrate-ts"), ["__no_such_lot__"]);
  const rt = run(TS("odg-migrate-ts"), ["__no_such_lot__"]);
  ok("odg-migrate-ts bogus-lot: same exit code (BLOCKED/refused)", rj.status === rt.status);
  ok("odg-migrate-ts bogus-lot: dist(TS) stdout IDENTICAL to js", normTs(rj.stdout || "") === normTs(rt.stdout || ""));
}

console.log(`\nspawn-launcher + freeze dual-port parity — ${passed} assertions passed.`);
