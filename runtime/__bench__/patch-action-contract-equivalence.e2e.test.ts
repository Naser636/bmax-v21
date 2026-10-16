#!/usr/bin/env node
/*
 * LOT patch-action-contract — EQUIVALENCE (historical .js vs compiled .ts). Offline, PURE (reads only an
 * injected env arg; no disk/clock/network/money). build:runtime compiles runtime/core/patch-action-contract.ts
 * → dist and build-dist-closure CO-LOCATES the sensitive dependency runtime/core/action-gate.js into dist
 * UNMODIFIED, so the compiled module's require("./action-gate") resolves the SAME admission logic — the
 * security module is never touched. Both modules are driven with IDENTICAL inputs and compared BYTE-IDENTICAL.
 *
 * Coverage anchors the AUTHZ/§6C invariant the port must preserve: DENY-BY-DEFAULT (a legacy patch declaring
 * no authority is DENIED, never silently granted), OBSERVE-vs-ENFORCE opt-in, and the resumable-vs-hard
 * refusal classification (authority-absent ⇒ resumable; ESCALATE / cross-mission reuse ⇒ hard, fail-closed).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/patch-action-contract-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "patch-action-contract.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "patch-action-contract.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT patch-action-contract — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "action-gate.js")), "sensitive dep action-gate.js co-located UNMODIFIED into dist (build-dist-closure)");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["compileActionContract", "hasExplicitActionContract", "admitPatchEdit", "classifyRefusal"]) check(typeof js[x] === "function" && typeof ts[x] === "function", `both export ${x}`);

// Compare both modules under identical inputs.
const admit = (p: any, e: any, pl: any, env: any) => EQ(js.admitPatchEdit(p, e, pl, env), ts.admitPatchEdit(p, e, pl, env));
const edit = { target: "runtime/core/x.ts" };
const plan = { authorizedPaths: ["runtime/core/"], mission: "CUR" };
const validTransition = {
  state_before: { s: "A" }, action: "WRITE", observed_effect: "wrote file", state_after: { s: "B" },
  state_version_before: 1, state_version_after: 2, difference: { changed: true },
  evidence_refs: ["ev1"], verification_status: "RECORDED",
};

// (1) compileActionContract derivations: scope===authorizedPaths (SCOPE not authority), defaults, no authority grant
const cJ = js.compileActionContract({}, edit, plan), cT = ts.compileActionContract({}, edit, plan);
check(EQ(cJ, cT), "compileActionContract byte-identical (legacy patch)");
check(cJ.principal === "odg-runtime" && cJ.verb === "WRITE" && cJ.actionClass === "WRITE" && cJ.reversibility === "R1" && cJ.target === "runtime/core/x.ts", "defaults: principal/verb/WRITE/R1/target");
check(EQ(cJ.scope, plan.authorizedPaths) && cJ.authority === undefined && cJ.contract === undefined && cJ.policy === undefined, "authorized_paths is SCOPE; authority/contract/policy undefined for a legacy patch (never derived from scope)");

// (2) hasExplicitActionContract
check(js.hasExplicitActionContract({}) === false && ts.hasExplicitActionContract({}) === false, "hasExplicitActionContract: legacy ⇒ false (both)");
check(js.hasExplicitActionContract({ authority: { id: "A" } }) === true && ts.hasExplicitActionContract({ authority: { id: "A" } }) === true, "hasExplicitActionContract: explicit authority ⇒ true (both)");
check(js.hasExplicitActionContract({ actionContract: {} }) === true && ts.hasExplicitActionContract({ actionContract: {} }) === true, "hasExplicitActionContract: actionContract object ⇒ true (both)");

// (3) DENY-BY-DEFAULT: legacy patch (no authority/contract/policy/state) ⇒ DENY, OBSERVED (enforced:false),
// and a HARD refusal (multiple dimensions failed — NOT merely authority-absent, so not rescued to resumable)
const legacy = js.admitPatchEdit({}, edit, plan, {});
check(admit({}, edit, plan, {}), "legacy admit byte-identical");
check(legacy.decision === "DENY" && legacy.enforced === false, "legacy ⇒ DENY + enforced:false (OBSERVE, deny-by-default, no silent grant)");
check(legacy.refusal.refused === true && legacy.refusal.resumable === false, "legacy DENY (state+contract+policy+authority all absent) ⇒ hard refusal (not resumable)");

// (3b) RESUMABLE: everything satisfied EXCEPT authority ⇒ DENY whose sole deficiency is authority-absence ⇒
// refusal resumable (authorization simply not granted YET). Enforced (explicit actionContract object present).
const resumablePatch = { actionContract: { contract: { id: "C-0" }, policy: { id: "P-0" }, expectedTransition: validTransition, actionClass: "WRITE", reversibility: "R1" } };
check(admit(resumablePatch, edit, plan, {}), "authority-only-absent admit byte-identical");
const resRes = js.admitPatchEdit(resumablePatch, edit, plan, {});
check(resRes.decision === "DENY" && resRes.refusal.refused === true && resRes.refusal.resumable === true, "state+contract+policy OK, authority absent ⇒ DENY + resumable (not yet granted)");

// (4) ENFORCE opt-in — via env ODG_ENFORCE_ACTION_GATE=1 and via plan.enforceActionGate (env injected, process.env untouched)
check(admit({}, edit, plan, { ODG_ENFORCE_ACTION_GATE: "1" }), "env-enforced legacy admit byte-identical");
check(js.admitPatchEdit({}, edit, plan, { ODG_ENFORCE_ACTION_GATE: "1" }).enforced === true, "env ODG_ENFORCE_ACTION_GATE=1 ⇒ enforced:true on a legacy patch");
check(admit({}, edit, { ...plan, enforceActionGate: true }, {}), "plan-enforced admit byte-identical");
check(js.admitPatchEdit({}, edit, { ...plan, enforceActionGate: true }, {}).enforced === true, "plan.enforceActionGate=true ⇒ enforced:true");

// (5) FULL AUTHORITY ⇒ ALLOW under enforcement (explicit action-contract)
const allowPatch = { actionContract: { authority: { id: "AUTH-1", human: true }, contract: { id: "C-1" }, policy: { id: "P-1" }, expectedTransition: validTransition, actionClass: "WRITE", reversibility: "R1" } };
check(admit(allowPatch, edit, plan, {}), "full-authority admit byte-identical");
const allowRes = js.admitPatchEdit(allowPatch, edit, plan, {});
check(allowRes.decision === "ALLOW" && allowRes.enforced === true && allowRes.refusal.refused === false, "full explicit contract (authority+contract+policy+valid transition, R1 WRITE) ⇒ ALLOW + enforced + not refused");

// (6) ESCALATE (irreversible R4, no human authority) ⇒ hard refusal (fail-closed, not resumable)
const escPatch = { actionContract: { authority: { id: "AUTH-2" }, contract: { id: "C-2" }, policy: { id: "P-2" }, expectedTransition: validTransition, actionClass: "WRITE", reversibility: "R4" } };
check(admit(escPatch, edit, plan, {}), "escalate admit byte-identical");
const escRes = js.admitPatchEdit(escPatch, edit, plan, {});
check(escRes.decision === "ESCALATE" && escRes.refusal.refused === true && escRes.refusal.resumable === false, "R4 irreversible, no human authority ⇒ ESCALATE + hard refusal (fail-closed)");

// (7) HARD DENY: cross-mission authority reuse ⇒ DENY but NOT resumable (least-privilege preserved)
const xmPatch = { actionContract: { authority: { id: "AUTH-3", mission: "OTHER" }, contract: { id: "C-3" }, policy: { id: "P-3" }, expectedTransition: validTransition, actionClass: "WRITE", reversibility: "R1" } };
check(admit(xmPatch, edit, plan, {}), "cross-mission admit byte-identical");
const xmRes = js.admitPatchEdit(xmPatch, edit, plan, {});
check(xmRes.decision === "DENY" && xmRes.refusal.refused === true && xmRes.refusal.resumable === false, "cross-mission authority reuse ⇒ DENY + hard refusal (never rescued to resumable)");

// (8) classifyRefusal directly: ALLOW ⇒ not refused
check(EQ(js.classifyRefusal({ decision: "ALLOW" }), ts.classifyRefusal({ decision: "ALLOW" })) && js.classifyRefusal({ decision: "ALLOW" }).refused === false, "classifyRefusal(ALLOW) ⇒ not refused byte-identical");

console.log(failures === 0 ? "ALL PASS — LOT patch-action-contract EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
