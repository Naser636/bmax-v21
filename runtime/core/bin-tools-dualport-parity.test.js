#!/usr/bin/env node
"use strict";
/*
 * BIN TOOLS DUAL-PORT PARITY (CTO Track B) — odg-generate-contracts + odg-reconcile.
 * LIVE subprocess parity: the JS rollback (runtime/bin/odg-X.js) and the compiled-TS default
 * (runtime/dist/bin/odg-X.js) must be observationally identical (exit code + stdout).
 *   - odg-generate-contracts: run with --dry-run (no write) → side-effect-free, deterministic.
 *   - odg-reconcile: records into runtime/generated/present-state-reconciliation.json (side effect),
 *     so SNAPSHOT/RESTORE around each run — both ports start identical and the test leaves no residue.
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
const run = (script, args) => cp.spawnSync(process.execPath, [script, ...args], { cwd: REPO, encoding: "utf8", timeout: 60000 });

// --- odg-generate-contracts --dry-run (no write) --------------------------------------------------
{
  const rj = run(JS("odg-generate-contracts"), ["--dry-run"]);
  const rt = run(TS("odg-generate-contracts"), ["--dry-run"]);
  ok("generate-contracts --dry-run: same exit code", rj.status === rt.status);
  ok("generate-contracts --dry-run: dist(TS) stdout IDENTICAL to js", (rj.stdout || "") === (rt.stdout || ""));
}

// --- odg-reconcile (side effect → snapshot/restore) -----------------------------------------------
{
  const RECON = path.join(REPO, "runtime", "generated", "present-state-reconciliation.json");
  const snap = { exists: fs.existsSync(RECON), data: fs.existsSync(RECON) ? fs.readFileSync(RECON) : null };
  const restore = () => { try { if (snap.exists) fs.writeFileSync(RECON, snap.data); else if (fs.existsSync(RECON)) fs.unlinkSync(RECON); } catch { /* best effort */ } };
  // Any mission name works for PARITY (both ports produce the SAME verdict for the same name + tree,
  // whether PROVEN or NOT_RECONCILABLE); we assert js==ts, not a particular verdict.
  const M = "PROVE_COMPLETED_VIA_PRESENT_STATE";
  const rj = run(JS("odg-reconcile"), [M]); restore();
  const rt = run(TS("odg-reconcile"), [M]); restore();
  ok("reconcile: same exit code from identical starting state", rj.status === rt.status);
  ok("reconcile: dist(TS) stdout IDENTICAL to js", (rj.stdout || "") === (rt.stdout || ""));
  // usage/exit-2 parity (no mission arg)
  const uj = run(JS("odg-reconcile"), []); const ut = run(TS("odg-reconcile"), []);
  ok("reconcile: no-arg usage exit 2 + identical stderr", uj.status === ut.status && uj.status === 2 && (uj.stderr || "") === (ut.stderr || ""));
}

console.log(`\nbin tools dual-port parity — ${passed} assertions passed.`);
