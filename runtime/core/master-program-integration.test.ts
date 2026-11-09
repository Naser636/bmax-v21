#!/usr/bin/env node
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const M = require("./master-program-integration");
const manifest = require("../../docs/odg/master-technological-superiority-program.json");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("PHASE 0 — MASTER PROGRAM CANONICAL INTEGRATION");

// real existing runtime/core modules (the non-duplication check must resolve against reality).
const existingModules = fs.readdirSync(path.join(__dirname)).filter((f: string) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

// full validation against the REAL module set ⇒ INTEGRATED (every reuse pointer resolves).
{
  const r = M.validateProgram(manifest, { existingModules });
  if (!r.ok) console.log("    violations:", JSON.stringify(r.violations));
  check(r.ok === true && r.verdict === "INTEGRATED", "manifest integrates cleanly against the real module set");
  check(r.checks.reusePointersResolve === true, "every reuseMap pointer resolves to a real runtime/core module (non-duplication verified)");
  check(r.checks.preservationComplete && r.checks.ninePrimitives && r.checks.fifteenMetiers && r.checks.dec166Preserved, "preservation of acquis verified (9 primitives, 15 métiers, DEC-V60-166)");
  check(r.checks.directeurIsV124 === true, "V12.4 remains the référentiel directeur");
}

// anti-fabrication: a build-mission claiming VALIDATED without evidence ⇒ INTEGRATION_INVALID.
{
  const tampered = JSON.parse(JSON.stringify(manifest));
  tampered.missions.push({ id: "FAKE", title: "x", program: "A", domain: "CENTRAL_INTELLIGENCE", phase: "PHASE-1", status: "VALIDATED" });
  const r = M.validateProgram(tampered, { existingModules });
  check(r.ok === false && r.violations.some((v: any) => /fabrication/.test(v)), "a VALIDATED mission without evidence ⇒ rejected (anti-fabrication)");
}
// non-canonical status ⇒ rejected.
{
  const tampered = JSON.parse(JSON.stringify(manifest));
  tampered.missions[0].status = "DONE_TRUST_ME";
  check(M.validateProgram(tampered, { existingModules }).ok === false, "non-canonical mission status ⇒ rejected");
}
// unresolved reuse pointer ⇒ rejected (duplication guard).
{
  const tampered = JSON.parse(JSON.stringify(manifest));
  tampered.reuseMap.push({ component: "x", existingModule: "nonexistent-module.ts", status: "REUSE_EXISTING" });
  check(M.validateProgram(tampered, { existingModules }).ok === false, "reuse pointer to a nonexistent module ⇒ rejected");
}
// directeur tampered ⇒ rejected (V12.4 must remain directeur).
{
  const tampered = JSON.parse(JSON.stringify(manifest));
  tampered.directeur = "V99-ROGUE";
  check(M.validateProgram(tampered, { existingModules }).ok === false, "directeur != V12.4 ⇒ rejected (extension, not replacement)");
}
// summary is pilotable (counts visible to the planner).
{
  const s = M.summarize(manifest);
  check(s.programs === 4 && s.domains === 8 && s.phases === 11 && s.missions > 0, `summary: 4 programs / 8 domains / 11 phases / ${s.missions} missions`);
  // Every terminal mission (COMPLETED or VALIDATED) must carry non-empty evidence, and the validator stays INTEGRATED —
  // nothing is claimed without proof.
  const terminal = manifest.missions.filter((m: any) => m.status === "COMPLETED" || m.status === "VALIDATED");
  check(terminal.length >= 1 && terminal.every((m: any) => typeof m.evidence === "string" && m.evidence.length > 0) && M.validateProgram(manifest, { existingModules }).ok === true, "every COMPLETED/VALIDATED mission carries evidence (validator INTEGRATED)");
  // A mission reaches VALIDATED ONLY with independent-validation evidence recorded (re-derived core invariant, not self-report).
  // The continuous enforcement lives in runtime/core/mission-independent-validation.test.ts (28/28, in the gate).
  const validated = manifest.missions.filter((m: any) => m.status === "VALIDATED");
  check(validated.every((m: any) => /independent/i.test(String(m.evidence)) || /independent/i.test(String(m.independentValidation))), "no mission is VALIDATED without independent-validation evidence (no over-claim)");
}
check(M.MASTER_PROGRAM_INTEGRATION_CONTRACT.invariants.some((i: any) => /EXTENSION/.test(i)), "contract: V12.4 remains directeur, program is an extension");

console.log(failures === 0 ? "ALL PASS — PHASE 0 MASTER PROGRAM INTEGRATION" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
