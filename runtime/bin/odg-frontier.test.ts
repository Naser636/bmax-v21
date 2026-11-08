#!/usr/bin/env node
// @ts-nocheck — runs under tsx. INTEGRATION test of the REAL entry point (odg-frontier) as a SPAWNED PROCESS: it
// drives the whole canonical chain RADAR→ODG→POLICY→selection→LAB+EVOLUTION(real bwrap sandbox)→EVIDENCE→DECISION
// through the actual binary (not direct internal calls), proving the integration end-to-end and the authorization gate.
"use strict";
const assert = require("assert");
const path = require("path");
const cp = require("child_process");
let failures = 0;
function check(c, label) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-FR-06 — odg-frontier ENTRYPOINT (spawned real process)");

const REPO = path.resolve(__dirname, "..", "..");
const CLI = path.join(REPO, "runtime", "bin", "odg-frontier.ts");
function runCli(env) {
  const r = cp.spawnSync("npx", ["tsx", CLI], { cwd: REPO, encoding: "utf8", env: { ...process.env, ...(env || {}) }, timeout: 120000 });
  let json = null; try { json = JSON.parse(String(r.stdout || "").trim()); } catch { json = null; }
  return { r, json };
}

// (A) authorized chain through the REAL entrypoint ⇒ full traversal with the real bubblewrap sandbox.
{
  const { r, json } = runCli({});
  check(r.status === 0 && json, "entrypoint runs (exit 0, structured JSON)");
  if (json) {
    check(json.chainTraversed === true, "REAL entrypoint: full canonical chain traversed (RADAR→…→DECISION)");
    check(json.admissions[0] && json.admissions[0].policy === "ALLOW" && json.admissions[0].admitted === true, "REAL entrypoint: POLICY ALLOW + external authorization ⇒ admitted (DEFERRED→READY)");
    check(json.selected && json.outcome === "PROMOTION_REVIEW", "REAL entrypoint: campaign-controller selected the lot ⇒ PROMOTION_REVIEW (external)");
    check(json.promoted === false && json.evidencePresent === true, "REAL entrypoint: no self-promotion; canonical evidence present");
    check(Array.isArray(json.stages) && json.stages.length === 7 && json.stages[0] === "RADAR" && json.stages[6] === "DECISION", "REAL entrypoint: 7 canonical stages traversed through the binary");
  }
}

// (B) no authorization ⇒ the Radar proposal stays DEFERRED and the chain is NOT traversed (authorization gate).
{
  const { r, json } = runCli({ ODG_FRONTIER_NOAUTH: "1" });
  check(r.status === 0 && json, "entrypoint (no-auth) runs (exit 0)");
  if (json) {
    check(json.chainTraversed === false && json.admissions[0].admitted === false && json.selected === null, "REAL entrypoint (no-auth): proposal stays DEFERRED, not selected — the Radar cannot self-authorize");
  }
}

console.log(failures === 0 ? "ALL PASS — WI-FR-06 odg-frontier ENTRYPOINT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
