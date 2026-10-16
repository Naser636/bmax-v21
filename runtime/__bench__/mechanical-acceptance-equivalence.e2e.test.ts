#!/usr/bin/env node
/*
 * LOT mechanical-acceptance — EQUIVALENCE (historical .js vs compiled .ts). Offline, pure, deterministic
 * (no clock/I/O). build:runtime compiles runtime/core/mechanical-acceptance.ts → dist (deps state-transition
 * + economic-verification + price-resolution + economic-unit co-located/compiled). Every verdict bucket and
 * gate is compared BYTE-IDENTICAL over synthetic trusted facts.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/mechanical-acceptance-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "mechanical-acceptance.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "mechanical-acceptance.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT mechanical-acceptance — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["VERDICT", "PRECEDENCE", "KNOWN_CHECKS", "ACCEPTANCE_CONTRACT", "isControlled", "evaluateAcceptance", "commitAllowed", "pushAllowed", "economicCommitAllowed", "economicPushAllowed"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.ACCEPTANCE_CONTRACT, ts.ACCEPTANCE_CONTRACT) && EQ(js.VERDICT, ts.VERDICT) && EQ(js.KNOWN_CHECKS, ts.KNOWN_CHECKS), "CONTRACT + VERDICT + KNOWN_CHECKS byte-identical");

const V = (f: any) => [js.evaluateAcceptance(f), ts.evaluateAcceptance(f)];
// UNKNOWN: no mission id ; deny-by-default
{ const [a, b] = V({}); check(EQ(a, b) && a.verdict === "UNKNOWN", "no mission.id ⇒ UNKNOWN byte-identical"); }
{ const [a, b] = V({ mission: { id: "M", authorized: true } }); check(EQ(a, b) && a.verdict === "UNKNOWN", "authorized but no proof ⇒ deny-by-default UNKNOWN byte-identical"); }
// BLOCKED: not authorized
{ const [a, b] = V({ mission: { id: "M", authorized: false } }); check(EQ(a, b) && a.verdict === "BLOCKED", "not AUTHORIZED ⇒ BLOCKED byte-identical"); }
// ACCEPT: authorized + required check passed (positive proof)
{ const [a, b] = V({ mission: { id: "M", authorized: true, required_checks: ["build"] }, verify: { build: true } }); check(EQ(a, b) && a.verdict === "ACCEPT" && a.proofs.includes("required check build passed"), "authorized + required build true ⇒ ACCEPT byte-identical"); }
// REJECT: a check proven false (dominates)
{ const [a, b] = V({ mission: { id: "M", authorized: true, required_checks: ["build"] }, verify: { build: false } }); check(EQ(a, b) && a.verdict === "REJECT", "build false ⇒ REJECT byte-identical"); }
// REJECT: write-set violation
{ const [a, b] = V({ mission: { id: "M", authorized: true, write_set: ["runtime/core/"] }, git: { changed_files: ["runtime/core/x.ts", "src/secret.ts"] } }); check(EQ(a, b) && a.verdict === "REJECT" && a.rejections.some((r: string) => /write_set/.test(r)), "out-of-write-set change ⇒ REJECT byte-identical"); }
// REJECT: forbidden path
{ const [a, b] = V({ mission: { id: "M", authorized: true, write_set: ["runtime/"], forbidden_paths: ["runtime/governance/"] }, git: { changed_files: ["runtime/governance/ROADMAP.json"] } }); check(EQ(a, b) && a.verdict === "REJECT", "forbidden path ⇒ REJECT byte-identical"); }
// BLOCKED: idempotency DUPLICATE (and authorized)
{ const [a, b] = V({ mission: { id: "M", authorized: true, required_checks: ["build"] }, verify: { build: true }, idempotency: { decision: "DUPLICATE" } }); check(EQ(a, b) && a.verdict === "BLOCKED", "idempotent DUPLICATE ⇒ BLOCKED byte-identical"); }
// REJECT: report proven-false is never an ACCEPT, report identity mismatch
{ const [a, b] = V({ mission: { id: "M", authorized: true }, report: { mission: "M", validated: false } }); check(EQ(a, b) && a.verdict === "REJECT", "report validated:false ⇒ REJECT byte-identical"); }
{ const [a, b] = V({ mission: { id: "M", authorized: true, required_checks: ["build"] }, verify: { build: true }, report: { mission: "OTHER" } }); check(EQ(a, b) && a.verdict === "REJECT", "report identity mismatch ⇒ REJECT (claim never raises ACCEPT) byte-identical"); }
// UNKNOWN: RUNNING checkpoint
{ const [a, b] = V({ mission: { id: "M", authorized: true }, checkpoint: { status: "RUNNING" } }); check(EQ(a, b) && a.verdict === "UNKNOWN", "RUNNING checkpoint ⇒ UNKNOWN byte-identical"); }

// isControlled opt-in
check(js.isControlled({ control: { required: true } }) === true && ts.isControlled({ control: { required: true } }) === true && js.isControlled({}) === false && ts.isControlled({}) === false, "isControlled opt-in parity");

// commit / push gates
check(EQ(js.commitAllowed("ACCEPT"), ts.commitAllowed("ACCEPT")) && js.commitAllowed("ACCEPT").allowed === true && js.commitAllowed("UNKNOWN").allowed === false, "commitAllowed gate parity (ACCEPT only)");
check(EQ(js.pushAllowed("ACCEPT", { commitVerified: true }), ts.pushAllowed("ACCEPT", { commitVerified: true })) && js.pushAllowed("ACCEPT", { commitVerified: false }).allowed === false, "pushAllowed gate parity (ACCEPT + commitVerified)");

// economic gates (OPT-IN, deny-by-default when enforced)
check(EQ(js.economicCommitAllowed({ enforced: false }), ts.economicCommitAllowed({ enforced: false })) && js.economicCommitAllowed({ enforced: false }).allowed === true, "economicCommitAllowed NO-OP when not enforced (legacy byte-for-byte)");
check(EQ(js.economicCommitAllowed({ enforced: true, verdict: "VERIFIED" }), ts.economicCommitAllowed({ enforced: true, verdict: "VERIFIED" })) && js.economicCommitAllowed({ enforced: true, verdict: "VERIFIED" }).allowed === true, "economicCommitAllowed enforced+VERIFIED ⇒ allowed parity");
check(EQ(js.economicCommitAllowed({ enforced: true, verdict: "INCOMPLETE" }), ts.economicCommitAllowed({ enforced: true, verdict: "INCOMPLETE" })) && js.economicCommitAllowed({ enforced: true, verdict: "INCOMPLETE" }).allowed === false, "economicCommitAllowed enforced+non-VERIFIED ⇒ refused parity");
check(EQ(js.economicPushAllowed({ enforced: true, verdict: "VERIFIED" }, { commitVerified: true }), ts.economicPushAllowed({ enforced: true, verdict: "VERIFIED" }, { commitVerified: true })), "economicPushAllowed parity");

console.log(failures === 0 ? "ALL PASS — LOT mechanical-acceptance EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
