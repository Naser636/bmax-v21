#!/usr/bin/env node
/*
 * LOT capability-authorization — EQUIVALENCE (historical .js vs compiled .ts). Offline, PURE (no clock/
 * randomness/I/O/network/money; `now` is injected). build:runtime compiles the .ts → dist; its sole dep
 * action-gate is already dual-ported (compiled sibling in dist). Both modules are driven with IDENTICAL
 * (request, grant, ctx) inputs across the FULL fail-closed human-authorization matrix and compared
 * BYTE-IDENTICAL — proving the governed human-grant transport (explicit capability/mission/scope/expiry/
 * execute/human-issued, revocation, deny-by-default, no self-authorization) is preserved exactly.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/capability-authorization-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "capability-authorization.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "capability-authorization.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT capability-authorization — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["authorizeCapability", "isConsequentialCapability", "requiresHumanGrant", "safeModeDryRunExemption", "defaultScopeSatisfied", "buildExecutorSpec", "buildSourceEditBinding", "requestedScopeOf", "CONSEQUENTIAL_CAPABILITIES", "SPEC_ADAPTERS"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.CONSEQUENTIAL_CAPABILITIES, ts.CONSEQUENTIAL_CAPABILITIES), "CONSEQUENTIAL_CAPABILITIES registry byte-identical");
check(EQ(Object.keys(js.SPEC_ADAPTERS), Object.keys(ts.SPEC_ADAPTERS)), "SPEC_ADAPTERS keys byte-identical");

const CAP = "Governed Bash/Linux Command";
const authz = (r: any, g: any, c: any) => EQ(js.authorizeCapability(r, g, c), ts.authorizeCapability(r, g, c));
const code = (r: any, g: any, c: any) => js.authorizeCapability(r, g, c).code;
const req = { capability: CAP, mission: "M1", requestedScope: { command: "ls" } };
const grant = { capability: CAP, mission: "M1", scope: { command: "ls" }, expiresAt: 1000, execute: true, human: true, issuer: "alice", id: "G1" };
const ctx = { now: 500 };

// (1) valid human grant ⇒ ALLOW (human authority suppresses HIGH-risk escalation; all admission dims ok)
check(authz(req, grant, ctx), "valid grant admit byte-identical");
const ok = js.authorizeCapability(req, grant, ctx);
check(ok.decision === "ALLOW" && ok.code === "AUTHORIZED" && ok.probe === "bash-command-governed", "valid grant ⇒ ALLOW AUTHORIZED with capability probe");
check(ok.evidence && ok.evidence.human === true && ok.evidence.grantId === "G1" && ok.evidence.usedAt === 500, "ALLOW evidence records EXACTLY the authorization used");

// (2) fail-closed matrix — each deficiency ⇒ its deterministic DENY code (byte-identical)
const cases: Array<[string, any, any, any, string]> = [
  ["malformed request", {}, grant, ctx, "MALFORMED_REQUEST"],
  ["non-consequential capability", { capability: "Some Read Thing", mission: "M1" }, grant, ctx, "NOT_CONSEQUENTIAL"],
  ["no clock", req, grant, {}, "NO_CLOCK"],
  ["no grant", req, null, ctx, "NO_AUTHORIZATION"],
  ["not human-issued (self-authorize)", req, { ...grant, human: false }, ctx, "NOT_HUMAN_ISSUED"],
  ["capability mismatch", req, { ...grant, capability: "External Research Acquisition" }, ctx, "CAPABILITY_MISMATCH"],
  ["mission mismatch (no transfer)", req, { ...grant, mission: "M2" }, ctx, "MISSION_MISMATCH"],
  ["execute not permitted", req, { ...grant, execute: false }, ctx, "EXECUTE_NOT_PERMITTED"],
  ["no expiry (never permanent)", req, { ...grant, expiresAt: undefined }, ctx, "NO_EXPIRY"],
  ["expired", req, { ...grant, expiresAt: 100 }, { now: 500 }, "EXPIRED"],
  ["revoked by id", req, grant, { now: 500, revokedGrants: ["G1"] }, "REVOKED"],
  ["no scope (never unbounded)", req, { ...grant, scope: {} }, ctx, "NO_SCOPE"],
  ["scope exceeded", { ...req, requestedScope: { command: "rm -rf /" } }, grant, ctx, "SCOPE_EXCEEDED"],
];
for (const [label, r, g, c, want] of cases) {
  check(authz(r, g, c), `${label}: admit byte-identical`);
  check(code(r, g, c) === want, `${label} ⇒ DENY ${want}`);
}

// (3) Governed Source Edit (LOW/R1) with a valid grant ⇒ ALLOW (no human escalation for a local edit)
const seReq = { capability: "Governed Source Edit", mission: "M1", requestedScope: {} };
const seGrant = { capability: "Governed Source Edit", mission: "M1", scope: { authorized_paths: ["runtime/core/"] }, expiresAt: 1000, execute: true, human: true, id: "G2" };
check(authz(seReq, seGrant, ctx), "source-edit admit byte-identical");
check(js.authorizeCapability(seReq, seGrant, ctx).decision === "ALLOW", "Governed Source Edit (LOW/R1) valid grant ⇒ ALLOW");

// (4) helper parity
check(js.isConsequentialCapability(CAP) === true && js.isConsequentialCapability("nope") === false && ts.isConsequentialCapability("nope") === false, "isConsequentialCapability parity");
check(js.requiresHumanGrant(CAP) === true && js.requiresHumanGrant("Governed Source Edit") === false && ts.requiresHumanGrant("Governed Source Edit") === false, "requiresHumanGrant parity (bash yes, source-edit no)");
check(js.defaultScopeSatisfied({ a: [1, 2, 3] }, { a: [1, 2] }) === true && js.defaultScopeSatisfied({ a: [1] }, { a: [1, 2] }) === false, "defaultScopeSatisfied: array containment");
check(js.defaultScopeSatisfied({ n: 10 }, { n: 5 }) === true && js.defaultScopeSatisfied({ n: 10 }, { n: 20 }) === false, "defaultScopeSatisfied: numeric limit");
check(EQ(js.defaultScopeSatisfied({ a: [1] }, { a: [1, 2] }), ts.defaultScopeSatisfied({ a: [1] }, { a: [1, 2] })), "defaultScopeSatisfied byte-identical");

// safeModeDryRunExemption — External Research zero-network dry-run exempt; live/spec intents fail closed
const ER = "External Research Acquisition";
check(EQ(js.safeModeDryRunExemption(ER, { verifyEvidence: "external-research-dry-run-planned" }), ts.safeModeDryRunExemption(ER, { verifyEvidence: "external-research-dry-run-planned" })), "safeModeDryRunExemption (dry-run) byte-identical");
check(js.safeModeDryRunExemption(ER, { verifyEvidence: "external-research-dry-run-planned" }).exempt === true, "ER bare dry-run (matching safeProbe) ⇒ exempt");
check(js.safeModeDryRunExemption(ER, { verifyEvidence: "external-research-dry-run-planned", executeRequested: true }).exempt === false, "ER dry-run + execute=true ⇒ NOT exempt (LIVE)");
check(js.safeModeDryRunExemption(CAP, {}).exempt === false && js.safeModeDryRunExemption(CAP, {}).code === "NO_SAFE_PROBE", "bash has no safeProbe ⇒ never exempt");

// buildExecutorSpec / requestedScopeOf (exercise SPEC_ADAPTERS functions)
check(EQ(js.buildExecutorSpec(CAP, { command: "ls", live: false }), ts.buildExecutorSpec(CAP, { command: "ls", live: false })), "buildExecutorSpec (bash, dry) byte-identical");
check(js.buildExecutorSpec(CAP, { command: "ls" }).value.execute === false, "buildExecutorSpec defaults execute OFF (live not armed)");
check(EQ(js.requestedScopeOf(CAP, { command: "ls" }), ts.requestedScopeOf(CAP, { command: "ls" })), "requestedScopeOf byte-identical");
check(EQ(js.buildExecutorSpec(ER, { live: true, fetcher: "f", planned_sources: ["s"], objective: "o" }), ts.buildExecutorSpec(ER, { live: true, fetcher: "f", planned_sources: ["s"], objective: "o" })), "buildExecutorSpec (ER live) byte-identical");

// buildSourceEditBinding — valid scope builds a binding; malformed ⇒ null (fail-closed)
const authority = { id: "G2", mission: "M1", human: true };
check(EQ(js.buildSourceEditBinding({ authorized_paths: ["runtime/core/"], edits: [{ target: "runtime/core/x.ts", content: "x" }] }, authority), ts.buildSourceEditBinding({ authorized_paths: ["runtime/core/"], edits: [{ target: "runtime/core/x.ts", content: "x" }] }, authority)), "buildSourceEditBinding (valid) byte-identical");
check(js.buildSourceEditBinding({ authorized_paths: [], edits: [] }, authority) === null && ts.buildSourceEditBinding({ authorized_paths: [], edits: [] }, authority) === null, "buildSourceEditBinding (empty) ⇒ null fail-closed (both)");

console.log(failures === 0 ? "ALL PASS — LOT capability-authorization EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
