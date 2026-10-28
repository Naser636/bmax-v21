#!/usr/bin/env node
// @ts-nocheck — runs under tsx. INTEGRATION proof that the fidelity verdict is a REAL Validation-Engine barrier
// (not a report line). It runs the actual COMPILED VE (runtime/dist/core/validation-engine.js) as a subprocess over
// a sandbox that WITHOUT a coding-resolution would validate=SUCCESS, then shows the CANONICAL decision flips to
// BLOCKED (validated=false, exit 1) when a negative coding-resolution.json is present — and stays SUCCESS for a
// positive/absent one. Malformed ⇒ fail-closed. Also unit-tests codingFidelityGate directly.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const MFV = require("./mission-fidelity-verdict.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "dist", "core", "validation-engine.js");
const sh = (dir, cmd, args) => spawnSync(cmd, args, { cwd: dir, encoding: "utf8" });

// A sandbox that validates SUCCESS (EXECUTED + non-empty evidence), mirroring the A3 guard's success fixture.
function successSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ve-fid-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  sh(dir, "git", ["init", "-q"]); sh(dir, "git", ["config", "user.email", "a@b.c"]); sh(dir, "git", ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, "runtime", "keep.js"), "module.exports={};\n");
  sh(dir, "git", ["add", "-A"]); sh(dir, "git", ["commit", "-q", "-m", "seed"]);
  const G = (n) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({ mission: "FID_GATE", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"], objectives: [{ id: "OBJ1", goal: "do", done_when: ["artifact produced"] }], definitionOfDone: ["Evidence generated"], status: "READY_FOR_EXECUTION" }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "FID_GATE", mode: "ENGINEERING", requiresEngineering: true, authorizedPaths: ["runtime/**"], patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }] }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  const ev = path.join("runtime", "generated", "ev.json"); fs.writeFileSync(path.join(dir, ev), JSON.stringify({ proof: true }));
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "FID_GATE", executed: [{ action: "OBJ1", objectiveId: "OBJ1", status: "EXECUTED", evidence: ev }] }));
  return dir;
}
function run(dir) {
  const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
  const rep = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "mission-report.json"), "utf8"));
  return { status: rep.status, validated: rep.validated, unmet: rep.unmet || [], exit: r.status ?? -1 };
}
function withCodingResolution(dir, obj, raw) {
  const p = path.join(dir, "runtime", "generated", "coding-resolution.json");
  fs.writeFileSync(p, raw !== undefined ? raw : JSON.stringify(obj));
}

// Baseline: NO coding-resolution ⇒ SUCCESS (proves the sandbox would otherwise pass — no regression).
{
  const dir = successSandbox();
  const out = run(dir);
  ok("baseline (no coding-resolution) ⇒ validated SUCCESS exit 0", out.validated === true && out.status === "SUCCESS" && out.exit === 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

// NEGATIVE verdict ⇒ the CANONICAL decision flips to BLOCKED (the real barrier).
for (const route of ["ROUTE_UNSUPPORTED", "ABSTAIN", "BLOCKED"]) {
  const dir = successSandbox();
  withCodingResolution(dir, { mission: "FID_GATE", codingMission: true, route, executed: false });
  const out = run(dir);
  ok(`coding route ${route} ⇒ VE REFUSES acceptance (validated=false, exit 1)`, out.validated === false && out.exit === 1 && out.unmet.some(u => /Objective fidelity gate/.test(u)));
  fs.rmSync(dir, { recursive: true, force: true });
}

// POSITIVE verdict ⇒ unaffected (EXECUTE still SUCCESS — gate only refuses, never over-blocks).
{
  const dir = successSandbox();
  withCodingResolution(dir, { mission: "FID_GATE", codingMission: true, route: "EXECUTE", executed: false });
  const out = run(dir);
  ok("coding route EXECUTE ⇒ still SUCCESS (no over-block)", out.validated === true && out.status === "SUCCESS" && out.exit === 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

// Non-coding resolution (codingMission:false) ⇒ unaffected.
{
  const dir = successSandbox();
  withCodingResolution(dir, { mission: "FID_GATE", codingMission: false, route: "NOT_A_CODING_MISSION" });
  const out = run(dir);
  ok("non-coding resolution ⇒ still SUCCESS", out.validated === true && out.exit === 0);
  fs.rmSync(dir, { recursive: true, force: true });
}

// MALFORMED artifact present ⇒ fail-closed (no false success).
{
  const dir = successSandbox();
  withCodingResolution(dir, null, "{ this is not valid json ");
  const out = run(dir);
  ok("malformed coding-resolution ⇒ fail-closed (validated=false, exit 1)", out.validated === false && out.exit === 1);
  fs.rmSync(dir, { recursive: true, force: true });
}

// Unit: codingFidelityGate pure logic.
ok("gate: absent ⇒ no block", MFV.codingFidelityGate(null, { fileExisted: false }).block === false);
ok("gate: malformed present ⇒ block (fail-closed)", MFV.codingFidelityGate("oops", { fileExisted: true }).block === true);
ok("gate: codingMission + ABSTAIN ⇒ block", MFV.codingFidelityGate({ codingMission: true, route: "ABSTAIN" }).block === true);
ok("gate: EXECUTE ⇒ no block", MFV.codingFidelityGate({ codingMission: true, route: "EXECUTE" }).block === false);

console.log(`\nVALIDATION-ENGINE FIDELITY-GATE suite — ${pass} assertions passed. (real compiled VE: negative coding-resolution FLIPS the canonical decision to BLOCKED; positive/absent unaffected; malformed fail-closed)`);
