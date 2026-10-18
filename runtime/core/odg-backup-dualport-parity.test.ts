#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * odg-backup DUAL-PORT PARITY (CTO Track B) — JS rollback (runtime/bin/odg-backup.js) vs compiled-TS
 * default (runtime/dist/bin/odg-backup.js). Pure functions compared directly; live subprocess parity on
 * the read-only `backup` path and the fail-closed `restore` refusals (no write to any real store).
 */
const assert = require("assert");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const js = require(path.join(REPO, "runtime", "bin", "odg-backup.js"));
const ts = require(path.join(REPO, "runtime", "dist", "bin", "odg-backup.js"));
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok("both ports export the same API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));

// parseFlags — positional, --flag value, boolean --flag, --force.
for (const argv of [["backup"], ["--out", "f.json"], ["restore", "--manifest", "m", "--target", "/tmp/x", "--force"], ["--bare"], []]) {
  ok(`parseFlags parity — ${JSON.stringify(argv)}`, eq(js.parseFlags(argv), ts.parseFlags(argv)));
}
// isProdTarget — prod store, inside prod, safe temp.
for (const tgt of ["/var/lib/odg/clients", "/var/lib/odg/clients/sub", "/tmp/safe-target", "./rel"]) {
  ok(`isProdTarget parity — ${tgt}`, js.isProdTarget(tgt) === ts.isProdTarget(tgt));
}

// LIVE subprocess parity (read-only + fail-closed paths; no write to any real store).
const run = (script, args) => cp.spawnSync(process.execPath, [script, ...args], { cwd: REPO, encoding: "utf8", timeout: 30000 });
const JS = path.join(REPO, "runtime", "bin", "odg-backup.js");
const TS = path.join(REPO, "runtime", "dist", "bin", "odg-backup.js");
{
  // backup (no --out) is READ-ONLY: both read the same live store → identical manifestHash/count.
  const rj = run(JS, ["backup"]), rt = run(TS, ["backup"]);
  ok("LIVE backup (read-only): same exit + identical stdout", rj.status === rt.status && (rj.stdout || "") === (rt.stdout || ""));
  // restore with no args → usage exit 2.
  const uj = run(JS, ["restore"]), ut = run(TS, ["restore"]);
  ok("LIVE restore no-args: same exit + identical stdout (TARGET/MANIFEST required)", uj.status === ut.status && (uj.stdout || "") === (ut.stdout || ""));
  // restore into the production store → fail-closed TARGET_FORBIDDEN_PRODUCTION (never writes).
  const pj = run(JS, ["restore", "--manifest", "x", "--target", "/var/lib/odg/clients"]);
  const pt = run(TS, ["restore", "--manifest", "x", "--target", "/var/lib/odg/clients"]);
  ok("LIVE restore→prod: same exit + identical fail-closed stdout", pj.status === pt.status && (pj.stdout || "") === (pt.stdout || ""));
  // bare (no subcommand) → usage exit 2.
  const bj = run(JS, []), bt = run(TS, []);
  ok("LIVE no-subcommand: same exit + identical usage", bj.status === bt.status && (bj.stdout || "") === (bt.stdout || ""));
}

console.log(`\nodg-backup dual-port parity — ${passed} assertions passed.`);
