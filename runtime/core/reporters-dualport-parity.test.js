#!/usr/bin/env node
"use strict";
/*
 * REPORTER CLIs DUAL-PORT PARITY (CTO Track B) — odg-status, odg-diagnose, odg-health.
 * Proves the JS rollback ports (runtime/bin/odg-X.js) and the compiled-TS default ports
 * (runtime/dist/bin/odg-X.js) are observationally identical.
 *
 * Method per reporter:
 *   - LIVE end-to-end: run each port as a real `node <script>` subprocess from the repo cwd (reading the
 *     SAME live runtime/generated state) and compare exit code + stdout. This catches path-RESOLUTION
 *     bugs an injected-fixture test cannot (e.g. a dist port computing the wrong repo root → UNKNOWN).
 *   - odg-diagnose has a SIDE EFFECT (diag.audit() mutates the self-diagnostic incident ledger/report),
 *     so it is NOT purely read-only: we SNAPSHOT the mutated artifacts, run each port from an identical
 *     starting state, and RESTORE — so the two runs are compared fairly and the test leaves no residue.
 *   - odg-health exports a PURE render(artifacts): also assert render() byte-identical on a fixture.
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
const run = (script) => cp.spawnSync(process.execPath, [script], { cwd: REPO, encoding: "utf8", timeout: 60000 });

// Snapshot/restore the artifacts odg-diagnose's audit may mutate, so both ports start identically.
const MUT = [
  path.join(REPO, "runtime", "generated", "self-diagnostic-report.json"),
  path.join(REPO, "runtime", "generated", "autonomy", "self-diagnostic-incidents.json"),
];
function snapshot() { return MUT.map((f) => ({ f, exists: fs.existsSync(f), data: fs.existsSync(f) ? fs.readFileSync(f) : null })); }
function restore(snap) { for (const s of snap) { try { if (s.exists) fs.writeFileSync(s.f, s.data); else if (fs.existsSync(s.f)) fs.unlinkSync(s.f); } catch { /* best effort */ } } }

// --- odg-status (pure read-only, deterministic) ---------------------------------------------------
{
  const rj = run(JS("odg-status")), rt = run(TS("odg-status"));
  ok("odg-status: both exit 0", rj.status === 0 && rt.status === 0);
  ok("odg-status: dist(TS) stdout IDENTICAL to js (incl. the CM-4 classified line → classifier resolves from dist)", (rj.stdout || "") === (rt.stdout || ""));
}

// --- odg-health (pure read-only + pure render) ----------------------------------------------------
{
  const rj = run(JS("odg-health")), rt = run(TS("odg-health"));
  ok("odg-health: both exit 0", rj.status === 0 && rt.status === 0);
  ok("odg-health: dist(TS) stdout IDENTICAL to js", (rj.stdout || "") === (rt.stdout || ""));
  const hj = require(JS("odg-health")), ht = require(TS("odg-health"));
  const fixture = {
    state: { pipeline: "READY", brain: "READY", status: "READY", lastRun: { mission: "M", status: "SUCCESS", validated: true } },
    status: { runtime: "READY", foundation: "READY", nextMission: "NX" },
    caps: { capabilities: ["a", "b"], missingCapabilities: [{ id: "x" }] },
    ledger: { count: 3, entries: [{ mission: "E1", state: "RELEASED" }] },
    constitution: { principles: ["P1", "P2"] },
    queue: { queue: [{ mission: "Q1", objective: "O1", status: "PENDING" }] },
  };
  ok("odg-health: render() byte-identical JS↔TS on a fixture", hj.render(fixture) === ht.render(fixture));
}

// --- odg-diagnose (has a side effect — snapshot/restore for a fair comparison) --------------------
{
  const snap = snapshot();
  const rj = run(JS("odg-diagnose"));
  restore(snap);
  const rt = run(TS("odg-diagnose"));
  restore(snap);
  ok("odg-diagnose: same exit code (0=no divergence / 1=incident) from an identical starting state", rj.status === rt.status);
  ok("odg-diagnose: dist(TS) stdout IDENTICAL to js (from the restored identical state)", (rj.stdout || "") === (rt.stdout || ""));
}

console.log(`\nreporter CLIs dual-port parity — ${passed} assertions passed.`);
