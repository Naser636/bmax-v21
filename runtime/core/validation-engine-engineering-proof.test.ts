#!/usr/bin/env node
// @ts-nocheck — behavioural test (spawns the REAL compiled dist validation-engine); suppresses tsc typechecking only.

/*
 * Validation Engine — ENGINEERING-PROOF gate (fixes an audited false-success).
 *
 * The "Engineering performed" gate must enforce "a write-scope mission that produced NO in-scope deliverable this
 * run is NOT done". The former fallback keyed engineeringOk off trackedFilesInScope(authorizedPaths) = `git ls-files`
 * under the scope, which matched ANY pre-existing committed file authored by ANY prior mission — so for a broad scope
 * (e.g. runtime/**) it was UNCONDITIONALLY satisfied, stamping validated:true → SUCCESS on a pure no-op. The fix ties
 * the committed-deliverable fallback to THIS mission's OWN output (APPLIED files[].target / DUPLICATE reconciled.files),
 * intersected with the tracked set.
 *
 * Black-box over the REAL runtime/dist/core/validation-engine.js in throwaway git repos (hermetic, computed paths,
 * never the real tree). Proves: a broad-scope mission with NO own in-scope committed deliverable FAILS; a genuine
 * re-validation whose OWN files are committed still PASSES; a fresh in-scope change still PASSES; idempotent DUPLICATE
 * replay still PASSES.
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const VE = path.join(REPO, "runtime", "dist", "core", "validation-engine.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

// Build a throwaway git repo (seed file committed), write the 3 pipeline artifacts, run the REAL dist VE, return the
// mission-report. `extraSeed`/`dirty` let a case leave a fresh in-scope change. scope defaults to the narrow
// "runtime/app" so the VE's OWN runtime/generated writes are OUT of scope (they would otherwise inflate scopedChanges).
function run(executed, opts = {}) {
  const scope = opts.scope || "runtime/app";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ve-engproof-"));
  fs.mkdirSync(path.join(dir, "runtime", "app"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(path.join(dir, "runtime", "app", "x.ts"), "export const x: number = 1;\n");
  // Mirror the real repo: /runtime/generated/ is gitignored (the pipeline's own in-run artifacts — mission-plan,
  // patch-execution, mission-report — are never versioned), so they never count as in-scope `scopedChanges` even
  // under a broad 'runtime/**' scope. Without this the VE's own generated writes would masquerade as fresh work.
  fs.writeFileSync(path.join(dir, ".gitignore"), "/runtime/generated/\n");
  const git = (args) => spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd: dir, encoding: "utf8" });
  git(["init", "-q"]); git(["add", "-A"]); git(["commit", "-qm", "init"]);
  if (opts.dirty) fs.writeFileSync(path.join(dir, "runtime", "app", "x.ts"), "export const x: number = 2; // changed this run\n");
  const G = (n) => path.join(dir, "runtime", "generated", n);
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({ mission: "M1", authorizedPaths: [scope], requiresEngineering: true, objectives: [{ id: "o1", goal: "g" }] }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "M1", authorizedPaths: [scope], patches: [{ action: "a", objectiveId: "o1" }] }));
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "M1", executed }));
  // C#3: optionally stamp runtime-verify.json to exercise the stale-cross-mission build/TS evidence guard.
  if (opts.verify) fs.writeFileSync(G("runtime-verify.json"), JSON.stringify(opts.verify));
  spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
  let report = null;
  try { report = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8")); } catch { /* none */ }
  fs.rmSync(dir, { recursive: true, force: true });
  return report;
}
const engPerformed = (r) => !!(r && r.checks && r.checks.engineeringPerformed);

console.log("Validation Engine — engineering-proof gate");

// 1. FALSE-SUCCESS CLOSED: APPLIED action but NO in-scope files written, clean tree (committed scope file exists from a
//    PRIOR mission). Must NOT validate and must NOT report engineeringPerformed.
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", files: [] }]);
  ok("1 no own in-scope deliverable ⇒ engineeringPerformed false", !engPerformed(r));
  ok("1 no own in-scope deliverable ⇒ not validated", !(r && r.validated));
}

// 2. FALSE-SUCCESS CLOSED (audited repro shape): a hand-crafted top-level `target` on a pre-existing committed file is
//    NOT the real APPLIED shape (files:[{target}]) and must NOT satisfy the gate.
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", target: "runtime/app/x.ts" }]);
  ok("2 top-level target on a pre-existing committed file ⇒ engineeringPerformed false", !engPerformed(r));
  ok("2 top-level target on a pre-existing committed file ⇒ not validated", !(r && r.validated));
}

// 3. LEGIT re-validation: APPLIED files name the mission's OWN in-scope committed deliverable, clean tree ⇒ PASS.
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", files: [{ target: "runtime/app/x.ts", mode: "content" }] }]);
  ok("3 own committed deliverable ⇒ engineeringPerformed true", engPerformed(r));
  ok("3 own committed deliverable ⇒ validated", !!(r && r.validated));
}

// 4. LEGIT idempotent DUPLICATE replay: reconciled.files name the committed deliverable ⇒ PASS.
{
  const r = run([{ objectiveId: "o1", action: "a", status: "DUPLICATE", reconciled: { status: "APPLIED", files: [{ target: "runtime/app/x.ts" }] } }]);
  ok("4 DUPLICATE idempotent replay with committed files ⇒ engineeringPerformed true", engPerformed(r));
  ok("4 DUPLICATE idempotent replay ⇒ validated", !!(r && r.validated));
}

// 5. LEGIT fresh write: a real in-scope change this run (dirty tree) ⇒ PASS via scopedChanges (deliverable fallback
//    not needed). Uses APPLIED files naming the changed file.
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", files: [{ target: "runtime/app/x.ts", mode: "content" }] }], { dirty: true });
  ok("5 fresh in-scope change ⇒ engineeringPerformed true", engPerformed(r));
  ok("5 fresh in-scope change ⇒ validated", !!(r && r.validated));
}

// 6. BROAD scope ('runtime/**') with no own deliverable — the exact 'always-true' case the fix targets — still FAILS.
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", files: [] }], { scope: "runtime/**" });
  ok("6 broad scope + no own deliverable ⇒ engineeringPerformed false (not auto-passed by pre-existing files)", !engPerformed(r));
  ok("6 broad scope + no own deliverable ⇒ not validated", !(r && r.validated));
}

// 7. PRESERVED (EXECUTED capability re-validation): a file-writing capability executor (ODG Synthetic Deliverable /
//    Spec Author) records files:[{target,mode:"capability"}] for the in-scope file it wrote; re-validating its own
//    committed deliverable on a clean tree must satisfy engineeringOk (closes the audited EXECUTED re-validation gap).
{
  const r = run([{ objectiveId: "o1", action: "a", status: "EXECUTED", capability: "ODG Synthetic Deliverable", evidence: "runtime/generated/x.json", files: [{ target: "runtime/app/x.ts", mode: "capability" }] }]);
  ok("7 EXECUTED capability with own committed in-scope deliverable ⇒ engineeringPerformed true", engPerformed(r));
}

// 8. NO HOLE RE-OPENED: an EXECUTED action with NO in-scope file deliverable (clean tree) must NOT satisfy engineeringOk.
{
  const r = run([{ objectiveId: "o1", action: "a", status: "EXECUTED", capability: "Some Capability", evidence: "runtime/generated/x.json", files: [] }]);
  ok("8 EXECUTED with no own in-scope deliverable ⇒ engineeringPerformed false (no hole re-opened)", !engPerformed(r));
}

// 9. C#3 — STALE cross-mission build/TS evidence: a PRESENT runtime-verify.json stamped for a DIFFERENT mission
//    must NOT lend its verdict to this mission ⇒ BLOCK (verifyEvidenceOk false), even with a genuine committed
//    deliverable. The same setup with THIS mission's verify (or no verify) still validates (no over-block).
const applied = [{ objectiveId: "o1", action: "a", status: "APPLIED", files: [{ target: "runtime/app/x.ts", mode: "content" }] }];
{
  const rStale = run(applied, { verify: { build: true, typescript: true, mission: "OTHER_MISSION" } });
  ok("9 stale cross-mission runtime-verify (mission OTHER) ⇒ NOT validated (C#3 fail-closed)", !!(rStale && rStale.validated === false));
  ok("9 verifyEvidenceOk=false surfaced + unmet names STALE", !!(rStale && rStale.checks && rStale.checks.verifyEvidenceOk === false) && (rStale.unmet || []).some((u) => /STALE/.test(u)));
  const rOwn = run(applied, { verify: { build: true, typescript: true, mission: "M1" } });
  ok("9 this-mission runtime-verify (mission M1) ⇒ validated (no over-block)", !!(rOwn && rOwn.validated) && rOwn.checks.verifyEvidenceOk === true);
  const rNone = run(applied); // absent verify ⇒ part-2 deferred ⇒ unaffected (still validates)
  ok("9 absent runtime-verify ⇒ still validated (absent-verify closure deferred to p0c3-absent-verify-require)", !!(rNone && rNone.validated) && rNone.checks.verifyEvidenceOk === true);
}

console.log(`\nValidation Engine engineering-proof — ${passed} assertions passed.`);
