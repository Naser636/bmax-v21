#!/usr/bin/env node

/* Patch Executor — PROTECTED-GOVERNANCE BOUNDARY (defense-in-depth) behavioural test.
 *
 * Proves the REAL boundary (not a label): a broad write scope ("runtime/**", the factory default)
 * structurally subsumes runtime/governance/**, so authorized_paths ALONE would let a mission / provider
 * proposal overwrite the ROADMAP (a human-approval-only governance artifact). scope ≠ authority — the
 * Patch Executor now REFUSES a governance write with a resumable per-action BLOCKED (zero mutation)
 * unless an EXPLICIT elevated authorization is present, while leaving every ordinary in-scope write and
 * any explicitly-authorized governance edit untouched.
 *
 * Fully isolated: each case runs the real runtime/core/patch-executor.js in a throwaway cwd; the real
 * repo and its generated artifacts are never touched. Network-independent.
 *
 * Run: node_modules/.bin/tsx runtime/core/patch-executor-governance-guard.test.js
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

const EXECUTOR = path.resolve(__dirname, "patch-executor.js");
const ROADMAP_REL = "runtime/governance/ROADMAP.json";
const ORIGINAL = '{"missions":[{"id":"REAL"}],"authoredBy":"human"}\n';

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

/** Run the real patch-executor against a crafted plan in a throwaway cwd; return execution + file state. */
function runExecutor(plan, seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pe-gov-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  for (const [rel, content] of Object.entries(seed || {})) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  fs.writeFileSync(path.join(dir, "runtime", "generated", "patch-plan.json"), JSON.stringify(plan, null, 2));
  const r = spawnSync("node", [EXECUTOR], { cwd: dir, encoding: "utf8" });
  let report = null;
  try { report = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8")); } catch { report = null; }
  const read = (rel) => { try { return fs.readFileSync(path.join(dir, rel), "utf8"); } catch { return null; } };
  return { exit: r.status, executed: (report && report.executed) || [], read, dir };
}

const governancePatch = (extra) => ({
  mission: "GOV_TEST",
  authorizedPaths: ["runtime/**"],
  patches: [{ action: "O1", objectiveId: "O1", edits: [{ target: ROADMAP_REL, content: '{"HIJACKED":true}\n' }] }],
  ...(extra || {}),
});

console.log("PATCH EXECUTOR — PROTECTED-GOVERNANCE BOUNDARY");

// 1. Broad runtime/** scope, NO elevated authority ⇒ BLOCKED, ROADMAP NOT overwritten (zero mutation).
{
  const r = runExecutor(governancePatch(), { [ROADMAP_REL]: ORIGINAL });
  const e = r.executed.find((x) => x.objectiveId === "O1");
  ok("governance write under runtime/** without authority ⇒ BLOCKED", !!e && e.status === "BLOCKED");
  ok("BLOCKED decision is a resumable ESCALATE with the governance reason", !!e && e.decision === "ESCALATE" && /protected governance/.test(String(e.needs)));
  ok("ROADMAP is NOT overwritten (zero mutation)", r.read(ROADMAP_REL) === ORIGINAL);
  ok("no APPLIED entry for the governance edit", !r.executed.some((x) => x.status === "APPLIED"));
}

// 2. Explicit ODG-level elevated authority (plan.allowProtectedGovernance) ⇒ APPLIED (legitimate edit).
{
  const r = runExecutor(governancePatch({ allowProtectedGovernance: true }), { [ROADMAP_REL]: ORIGINAL });
  const e = r.executed.find((x) => x.objectiveId === "O1");
  ok("governance write WITH plan.allowProtectedGovernance ⇒ APPLIED", !!e && e.status === "APPLIED");
  ok("ROADMAP is updated when explicitly authorized", r.read(ROADMAP_REL) === '{"HIJACKED":true}\n');
}

// 3. A patch-level/self-asserted authority (actionContract.allow_protected on the worker-authored patch)
//    must NOT authorize a governance write — only the ODG-level plan can. The worker cannot self-authorize;
//    the ROADMAP stays intact regardless of how the attempt is refused.
{
  const plan = governancePatch();
  plan.patches[0].actionContract = { allow_protected: true };
  const r = runExecutor(plan, { [ROADMAP_REL]: ORIGINAL });
  ok("patch-level allow_protected does NOT authorize (worker cannot self-authorize)", !r.executed.some((x) => x.objectiveId === "O1" && x.status === "APPLIED"));
  ok("ROADMAP stays intact under a self-asserted patch authority", r.read(ROADMAP_REL) === ORIGINAL);
}

// 4. Ordinary in-scope write under runtime/** ⇒ still APPLIED (guard does not over-block).
{
  const plan = {
    mission: "ENG", authorizedPaths: ["runtime/**"],
    patches: [{ action: "O1", objectiveId: "O1", edits: [{ target: "runtime/core/scratch-demo.js", content: "module.exports={};\n" }] }],
  };
  const r = runExecutor(plan, {});
  const e = r.executed.find((x) => x.objectiveId === "O1");
  ok("ordinary runtime/core write ⇒ APPLIED (not over-blocked)", !!e && e.status === "APPLIED");
  ok("the ordinary file was written", r.read("runtime/core/scratch-demo.js") === "module.exports={};\n");
}

// 5. Multi-edit patch mixing a governance edit with an ordinary one, NO authority ⇒ BLOCKED, NEITHER written.
{
  const plan = {
    mission: "MIX", authorizedPaths: ["runtime/**"],
    patches: [{ action: "O1", objectiveId: "O1", edits: [
      { target: "runtime/core/scratch-mix.js", content: "module.exports={};\n" },
      { target: ROADMAP_REL, content: '{"HIJACKED":true}\n' },
    ] }],
  };
  const r = runExecutor(plan, { [ROADMAP_REL]: ORIGINAL });
  const e = r.executed.find((x) => x.objectiveId === "O1");
  ok("mixed patch touching governance ⇒ BLOCKED (atomic)", !!e && e.status === "BLOCKED");
  ok("the ordinary sibling edit is NOT written (atomic zero mutation)", r.read("runtime/core/scratch-mix.js") === null);
  ok("the governance target is NOT overwritten", r.read(ROADMAP_REL) === ORIGINAL);
}

console.log(`\nPATCH EXECUTOR GOVERNANCE GUARD — ${passed} assertions passed.`);
