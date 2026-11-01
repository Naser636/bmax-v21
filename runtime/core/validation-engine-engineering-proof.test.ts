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
  // p0c3-stage-scope-readonly integration: opts.requiresEngineering/opts.authorizedPaths let a case drive the
  // VE as a NON-engineering (read-only/AUDIT) mission (requiresEngineering:false OR empty authorizedPaths), which
  // is exactly the class the Build/TS Evidence stage SKIPS. Defaults reproduce the engineering mission unchanged.
  const requiresEngineering = opts.requiresEngineering === undefined ? true : opts.requiresEngineering;
  const planAuthorizedPaths = opts.authorizedPaths === undefined ? [scope] : opts.authorizedPaths;
  const planExtra = opts.mode ? { mode: opts.mode } : {};
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({ mission: "M1", authorizedPaths: planAuthorizedPaths, requiresEngineering, objectives: [{ id: "o1", goal: "g" }], ...planExtra }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "M1", authorizedPaths: planAuthorizedPaths, patches: [{ action: "a", objectiveId: "o1" }] }));
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "M1", executed }));
  // C#3 part 2: the Build/TS Evidence pipeline stage now ALWAYS produces a this-mission runtime-verify.json before
  // the Validation Engine, so an engineering mission legitimately always carries one. The direct-VE harness mirrors
  // that reality by DEFAULT-stamping a green this-mission verify; opts.verify overrides (stale/other-mission cases),
  // opts.noVerify omits it (to exercise the absent-verify BLOCK).
  if (opts.verify) fs.writeFileSync(G("runtime-verify.json"), JSON.stringify(opts.verify));
  else if (!opts.noVerify) fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, mission: "M1" }));
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
  // C#3 part 2: an engineering mission with NO this-run verify ⇒ BLOCK (the former fail-open is closed; the
  // Build/TS Evidence stage is responsible for producing it in the real pipeline).
  const rNone = run(applied, { noVerify: true });
  ok("9 part2: absent runtime-verify on an engineering mission ⇒ NOT validated (fail-open closed)", !!(rNone && rNone.validated === false) && rNone.checks.verifyEvidenceOk === false && (rNone.unmet || []).some((u) => /NO this-run build\/TypeScript evidence/.test(u)));
  // NOTE: a PRESENT-but-red build verdict is governed by the EXISTING Build-Recovery path (validation-engine.ts:187),
  // not by this absent-verify change — so it is intentionally NOT asserted here (out of C#3 part-2 scope).
}
// 10 — legitimate committed-deliverable re-validation (the case the naive absent-verify BLOCK would have broken):
//      WITH the default this-mission green verify the run proceeds (proof part 2 does not reject legit re-validation).
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", files: [{ target: "runtime/app/x.ts", mode: "content" }] }]);
  ok("10 committed-deliverable re-validation + this-mission green verify ⇒ validated (part-2 does NOT reject legit re-validation)", !!(r && r.validated) && r.checks.verifyEvidenceOk === true);
}

// 11 — p0c3-stage-scope-readonly INTEGRATION: the Build/TS Evidence stage SKIPS build/tsc for a non-engineering
//      (read-only/AUDIT) mission and writes the mission-stamped RC-1 verify with build:true/typescript:true (gate
//      N/A) + skipped:true/buildExecuted:false. The VE must (a) validate the mission, (b) NOT apply the engineering
//      gate, and (c) NOT trigger build-recovery (buildOk true ⇒ :187 skipped). This is the EXACT artifact the stage
//      emits (see stage-build-ts-evidence.ts non-engineering branch).
const RO_STAGE_VERIFY = { build: true, typescript: true, buildExecuted: false, skipped: true, skipReason: "non-engineering (read-only/AUDIT) mission — build/TS not run; gate N/A (satisfied by non-applicability)", mission: "M1", producedBy: "stage-build-ts-evidence" };
// GENUINE read-only under the WRITE-SET-DERIVED (OR) predicate = flag false AND NO write-set (authorizedPaths empty).
{
  const r = run([{ objectiveId: "o1", action: "a", status: "RECORDED" }], { requiresEngineering: false, authorizedPaths: [], mode: "AUDIT", verify: RO_STAGE_VERIFY });
  ok("11 genuine read-only (flag false + NO write-set) ⇒ validated (not blocked)", !!(r && r.validated));
  ok("11 genuine read-only ⇒ engineering gate NOT applied (engineering:false in report)", !!(r && r.checks && r.checks.engineering === false));
  ok("11 genuine read-only ⇒ build/TS gates green (gate N/A, no recovery)", !!(r && r.checks && r.checks.buildGate === true && r.checks.typescriptGate === true));
}
// 12 — WRITE-SET-DERIVED tightening: a plan with a WRITE-SET but requiresEngineering OMITTED is now ENGINEERING (OR),
//      so with NO this-run verify it must BLOCK (the recon fail-open the AND predicate left open — a mutating mission
//      could be stamped SUCCESS with no build/TS/scope proof). Proven against the REAL dist VE.
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", files: [{ target: "runtime/app/x.ts", mode: "content" }] }], { requiresEngineering: false, noVerify: true });
  ok("12 write-set + flag OMITTED + no verify ⇒ isEngineering(OR) ⇒ BLOCKED (fail-open closed)", !!(r && r.validated === false) && r.checks.engineering === true && r.checks.verifyEvidenceOk === false);
}
// 12b — same write-set+flag-omitted plan WITH a this-mission green verify ⇒ validates (engineering gate satisfied, not over-blocked).
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", files: [{ target: "runtime/app/x.ts", mode: "content" }] }], { requiresEngineering: false, verify: { build: true, typescript: true, mission: "M1" } });
  ok("12b write-set + flag omitted + this-mission green verify ⇒ validated (engineering, not over-blocked)", !!(r && r.validated) && r.checks.engineering === true && r.checks.verifyEvidenceOk === true);
}

// 13 — REALITY HONESTY: the additive realityProof is DERIVED from the verdict (not independently observed), so it is
//      explicitly tagged synthetic:true and MUST NOT be mistaken for a real reality-gate observation. (Mission 4.)
{
  const r = run([{ objectiveId: "o1", action: "a", status: "APPLIED", files: [{ target: "runtime/app/x.ts", mode: "content" }] }], { requiresEngineering: true, verify: { build: true, typescript: true, mission: "M1" } });
  ok("13 realityProof present + tagged synthetic:true (cannot be read as independent reality evidence)", !!(r && r.realityProof) && r.realityProof.synthetic === true);
  ok("13 realityProof.basis honestly states it is DERIVED from the verdict (not independent observation)", !!(r && r.realityProof && typeof r.realityProof.basis === "string") && /DERIVED/.test(r.realityProof.basis) && /NOT independent/i.test(r.realityProof.basis));
  // the governed verdict remains `validated` + the gates — never the synthetic projection.
  ok("13 governed verdict is `validated` (the synthetic realityProof is additive, non-authoritative)", !!(r && typeof r.validated === "boolean"));
}

console.log(`\nValidation Engine engineering-proof — ${passed} assertions passed.`);
