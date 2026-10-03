/*
 * Provider-route capability-proof propagation (semantic-truth frontier).
 *
 * BEFORE: writeProviderValidationEvidence wrote a mission-plan with NO `verify` block, so a provider-
 * executed mission's DECLARED (and intent-implied) capability proofs were silently dropped — it could
 * reach SUCCESS with none of its independent proofs checked (reproduced end-to-end: a declared REQUIRED
 * proof whose probe fails is skipped by the current provider plan yet SUCCESS). The LOCAL route's
 * Mission Loader already propagates these (mission-loader.js:133-178); the provider route did not.
 *
 * FIX: resolveProviderPlanVerify resolves the plan's `verify` exactly as the LOCAL route does —
 * declared spec.verify (normalized) MERGED with intent-implied proofs via the SHARED resolveVerifyProbes
 * resolver, deduped by evidence. The Validation Engine's existing required-proof gate then independently
 * checks each proof. This is independent of the provider's self-reported objectivesAddressed.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/provider-verify-propagation.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resolveProviderPlanVerify } from "./autonomy-runtime-adapter";

const REPO = process.cwd();
const VE = path.join(REPO, "runtime", "core", "validation-engine.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
// Injected implied-proof resolver (deterministic; no dependency on the real factory vocabulary).
const noImplied = () => [];
const impliesNet = () => [{ capability: "net", evidence: "internet-reachable" }];

console.log("PROVIDER-ROUTE VERIFY PROPAGATION");

// ---- Unit: resolveProviderPlanVerify -----------------------------------------------------------
// 1 — declared proofs are propagated + normalized (required:false carried verbatim).
{
  const spec = { verify: [{ capability: "c1", evidence: "p1" }, { evidence: "p2", required: false }] } as never;
  const v = resolveProviderPlanVerify(spec, { id: "M" }, noImplied);
  check(v.length === 2 && v[0].evidence === "p1" && v[0].capability === "c1", "declared proof propagated");
  check(v[1].evidence === "p2" && v[1].capability === "p2" && v[1].required === false, "required:false carried; capability defaults to evidence");
}
// 2 — intent-implied proofs merged, de-duplicated by evidence.
{
  const spec = { verify: [{ capability: "net", evidence: "internet-reachable" }] } as never;
  const v = resolveProviderPlanVerify(spec, { id: "M", goal: "reach the internet" }, impliesNet);
  check(v.length === 1 && v[0].evidence === "internet-reachable", "implied proof de-duplicated against declared");
}
// 3 — implied adds when not declared.
{
  const v = resolveProviderPlanVerify({ } as never, { id: "M", goal: "online" }, impliesNet);
  check(v.length === 1 && v[0].evidence === "internet-reachable", "intent-implied proof added when contract omits it");
}
// 4 — legacy: no declared, no implied ⇒ empty (no extra gate; backward compatible).
{
  const v = resolveProviderPlanVerify({ } as never, { id: "M" }, noImplied);
  check(v.length === 0, "no declared + no implied ⇒ no verify (backward compatible)");
}

// ---- End-to-end: resolved verify flows through the REAL validation-engine -----------------------
function validate(planVerify: unknown): { status?: string; validated?: boolean; exit: number } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prov-verify-"));
  try {
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    spawnSync("git", ["init", "-q"], { cwd: dir });
    spawnSync("git", ["config", "user.email", "a@b.c"], { cwd: dir });
    spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
    fs.mkdirSync(path.join(dir, "runtime", "work"), { recursive: true });
    fs.writeFileSync(path.join(dir, "runtime", "work", "d.js"), "module.exports={};\n");
    spawnSync("git", ["add", "-A"], { cwd: dir });
    spawnSync("git", ["commit", "-q", "-m", "seed"], { cwd: dir });
    const G = (n: string) => path.join(dir, "runtime", "generated", n);
    const plan: Record<string, unknown> = {
      mission: "PROV", mode: "IMPLEMENT", requiresEngineering: true, authorizedPaths: ["runtime/work/**"],
      objectives: [{ id: "OBJ1", goal: "do it", done_when: ["done"] }], definitionOfDone: ["x"], status: "READY_FOR_EXECUTION",
    };
    if (planVerify) plan.verify = planVerify;
    fs.writeFileSync(G("mission-plan.json"), JSON.stringify(plan));
    fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "PROV", patches: [{ objective: "OBJ1", objectiveId: "OBJ1", files: ["runtime/work/d.js"] }] }));
    fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "PROV", executed: [{ action: "OBJ1", objectiveId: "OBJ1", status: "APPLIED" }] }));
    fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
    const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
    const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
    return { status: rep.status, validated: rep.validated, exit: r.status ?? -1 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
// 5 — a declared REQUIRED proof that fails (fleet-request-validated, no fleet dir) ⇒ BLOCKED once propagated.
{
  const v = resolveProviderPlanVerify({ verify: [{ capability: "c", evidence: "fleet-request-validated" }] } as never, { id: "PROV" }, noImplied);
  const out = validate(v);
  check(out.status === "BLOCKED" && out.exit === 1, "propagated required proof that fails ⇒ validation BLOCKED");
}
// 6 — reproduce the OLD drop: same mission with NO verify in the plan ⇒ SUCCESS (proof skipped).
{
  const out = validate(null);
  check(out.status === "SUCCESS", "OLD provider plan WITHOUT verify ⇒ SUCCESS (reproduces the dropped-proof defect)");
}
// 7 — backward compatible: a proof-less mission still SUCCEEDS.
{
  const out = validate([]);
  check(out.status === "SUCCESS" && out.exit === 0, "no declared proofs ⇒ SUCCESS (backward compatible)");
}

console.log(failures === 0 ? "ALL PASS — PROVIDER-ROUTE VERIFY PROPAGATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
