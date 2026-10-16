#!/usr/bin/env node
/*
 * LOT action-gate — EQUIVALENCE (historical .js vs compiled .ts). Offline, PURE (no clock/randomness/I/O/
 * network/money). build:runtime compiles runtime/core/action-gate.ts → dist; its sole dep state-transition
 * is already dual-ported (compiled sibling in dist). Both modules are driven with IDENTICAL (action, context)
 * inputs across the FULL admission matrix and compared BYTE-IDENTICAL — proving the DENY-BY-DEFAULT admission
 * gate (STATE→CONTRACT→POLICY→AUTHORITY, ALLOW/DENY/ESCALATE, least-privilege) is preserved exactly.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/action-gate-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "action-gate.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "action-gate.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT action-gate — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["ACTION_CLASSES", "CONSEQUENTIAL_CLASSES", "HUMAN_REQUIRED_CLASSES", "REVERSIBILITY", "DECISION", "ACTION_CONTRACT", "evaluateAction"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.ACTION_CONTRACT, ts.ACTION_CONTRACT) && EQ(js.ACTION_CLASSES, ts.ACTION_CLASSES) && EQ(js.DECISION, ts.DECISION) && EQ(js.REVERSIBILITY, ts.REVERSIBILITY) && EQ(js.CONSEQUENTIAL_CLASSES, ts.CONSEQUENTIAL_CLASSES) && EQ(js.HUMAN_REQUIRED_CLASSES, ts.HUMAN_REQUIRED_CLASSES), "frozen vocabulary + ACTION_CONTRACT descriptor byte-identical");

const validTransition = {
  state_before: { s: "A" }, action: "WRITE", observed_effect: "wrote", state_after: { s: "B" },
  state_version_before: 1, state_version_after: 2, difference: { changed: true },
  evidence_refs: ["ev1"], verification_status: "RECORDED",
};
const ev = (a: any, c?: any) => EQ(js.evaluateAction(a, c), ts.evaluateAction(a, c));
const dec = (a: any, c?: any) => js.evaluateAction(a, c).decision;
const ident = { principal: "odg", verb: "WRITE", target: "runtime/core/x.ts" };
const fullAuth = { ...ident, actionClass: "WRITE", reversibility: "R1", expectedTransition: validTransition, contract: { id: "C" }, policy: { id: "P" }, authority: { id: "A" } };

// (1) malformed action ⇒ DENY
check(ev(null) && dec(null) === "DENY", "malformed (null) ⇒ DENY byte-identical");
check(ev(42) && dec(42) === "DENY", "malformed (non-object) ⇒ DENY byte-identical");

// (2) observational classes ⇒ ALLOW ungated (no authority/contract/policy required)
for (const cls of ["READ", "ANALYZE", "GENERATE"]) {
  const a = { ...ident, verb: cls, actionClass: cls };
  check(ev(a) && dec(a) === "ALLOW", `observational ${cls} (well-formed) ⇒ ALLOW byte-identical`);
}

// (3) DENY-BY-DEFAULT: consequential WRITE with NOTHING supplied ⇒ DENY (state+contract+policy+authority all fail)
const bare = { ...ident, actionClass: "WRITE" };
check(ev(bare) && dec(bare) === "DENY", "consequential WRITE, no state/contract/policy/authority ⇒ DENY (deny-by-default)");
check(EQ(js.evaluateAction(bare).violations, ts.evaluateAction(bare).violations) && js.evaluateAction(bare).violations.length === 4, "4 ordered admission violations byte-identical (STATE/CONTRACT/POLICY/AUTHORITY)");

// (4) each single missing dimension still ⇒ DENY (fail-closed per dimension)
check(ev({ ...fullAuth, expectedTransition: undefined }) && dec({ ...fullAuth, expectedTransition: undefined }) === "DENY", "missing state transition ⇒ DENY byte-identical");
check(ev({ ...fullAuth, contract: undefined }) && dec({ ...fullAuth, contract: undefined }) === "DENY", "missing contract ⇒ DENY byte-identical");
check(ev({ ...fullAuth, policy: undefined }) && dec({ ...fullAuth, policy: undefined }) === "DENY", "missing policy ⇒ DENY byte-identical");
check(ev({ ...fullAuth, authority: undefined }) && dec({ ...fullAuth, authority: undefined }) === "DENY", "missing authority ⇒ DENY byte-identical");

// (5) fully satisfied consequential ⇒ ALLOW
check(ev(fullAuth) && dec(fullAuth) === "ALLOW", "full STATE+CONTRACT+POLICY+AUTHORITY (R1 WRITE) ⇒ ALLOW byte-identical");

// (6) policy compatibility against ctx.allowedPolicies
check(ev(fullAuth, { allowedPolicies: ["P"] }) && dec(fullAuth, { allowedPolicies: ["P"] }) === "ALLOW", "policy in allowedPolicies ⇒ ALLOW byte-identical");
check(ev(fullAuth, { allowedPolicies: ["Q"] }) && dec(fullAuth, { allowedPolicies: ["Q"] }) === "DENY", "policy not in allowedPolicies ⇒ DENY byte-identical");

// (7) ESCALATE triggers (unless explicit human authority), for fully-authorized actions
check(ev({ ...fullAuth, reversibility: "R4" }) && dec({ ...fullAuth, reversibility: "R4" }) === "ESCALATE", "R4 irreversible ⇒ ESCALATE byte-identical");
const del = { ...fullAuth, actionClass: "DELETE" };
check(ev(del) && dec(del) === "ESCALATE", "DELETE class ⇒ ESCALATE byte-identical");
check(ev({ ...fullAuth, risk: "HIGH" }) && dec({ ...fullAuth, risk: "HIGH" }) === "ESCALATE", "HIGH risk ⇒ ESCALATE byte-identical");
check(ev({ ...fullAuth, criticality: "CRITICAL" }) && dec({ ...fullAuth, criticality: "CRITICAL" }) === "ESCALATE", "CRITICAL criticality ⇒ ESCALATE byte-identical");
// explicit human authority suppresses escalation
const humanR4 = { ...fullAuth, reversibility: "R4", authority: { id: "A", human: true } };
check(ev(humanR4) && dec(humanR4) === "ALLOW", "R4 + explicit human authority ⇒ ALLOW byte-identical");
// DENY precedence over ESCALATE (R4 but also missing contract)
const escButDeny = { ...fullAuth, reversibility: "R4", contract: undefined };
check(ev(escButDeny) && dec(escButDeny) === "DENY", "R4 escalate-trigger BUT missing contract ⇒ DENY (precedence) byte-identical");

// (8) least-privilege authority checks via context
const xm = { ...fullAuth, authority: { id: "A", mission: "OTHER" } };
check(ev(xm, { missionId: "CUR" }) && dec(xm, { missionId: "CUR" }) === "DENY", "cross-mission authority reuse ⇒ DENY byte-identical");
const exp = { ...fullAuth, authority: { id: "A", expiresAt: 100 } };
check(ev(exp, { now: 200 }) && dec(exp, { now: 200 }) === "DENY", "expired authority (now>expiresAt) ⇒ DENY byte-identical");
check(ev(exp, { now: 50 }) && dec(exp, { now: 50 }) === "ALLOW", "unexpired authority (now<expiresAt) ⇒ ALLOW byte-identical");
check(ev(fullAuth, { revokedAuthorities: ["A"] }) && dec(fullAuth, { revokedAuthorities: ["A"] }) === "DENY", "revoked authority ⇒ DENY byte-identical");

// (9) full record parity incl. frozen evidence sub-object
check(EQ(js.evaluateAction(fullAuth, { allowedPolicies: ["P"] }), ts.evaluateAction(fullAuth, { allowedPolicies: ["P"] })), "full decision record (checks+violations+escalation+evidence) byte-identical");

console.log(failures === 0 ? "ALL PASS — LOT action-gate EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
