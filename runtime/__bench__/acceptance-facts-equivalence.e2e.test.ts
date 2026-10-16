#!/usr/bin/env node
/*
 * LOT acceptance-facts — EQUIVALENCE (historical .js vs compiled .ts). Offline, READ-ONLY (no writes to the
 * repo / no network / no money). build:runtime compiles runtime/core/acceptance-facts.ts → dist (deps
 * mechanical-acceptance + economic-verification + price-resolution + economic-unit + state-transition
 * co-located/compiled). The gatherer reads cwd-relative runtime/missions + runtime/generated, so the bench
 * SEEDS a throwaway temp cwd and process.chdir() into it for the read-only calls (repo never touched); both
 * modules read the SAME seeded files ⇒ results compared BYTE-IDENTICAL.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/acceptance-facts-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "acceptance-facts.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "acceptance-facts.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT acceptance-facts — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["DEFAULT_REQUIRED_CHECKS", "ECONOMIC_ENFORCEMENT_CONTRACT", "loadContract", "controlDeclared", "gatherAcceptanceFacts", "evaluateMissionAcceptance", "economicEnforced", "evaluateMissionEconomics", "commitGateDecision"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.ECONOMIC_ENFORCEMENT_CONTRACT, ts.ECONOMIC_ENFORCEMENT_CONTRACT) && EQ(js.DEFAULT_REQUIRED_CHECKS, ts.DEFAULT_REQUIRED_CHECKS), "ECONOMIC_ENFORCEMENT_CONTRACT + DEFAULT_REQUIRED_CHECKS byte-identical");

// --- seed a throwaway cwd with mission contracts + generated artifacts (READ-ONLY reads; repo untouched) --
const cwd0 = process.cwd();
const d = fs.mkdtempSync(path.join(os.tmpdir(), "accf-"));
const mdir = path.join(d, "runtime", "missions"); const gdir = path.join(d, "runtime", "generated");
fs.mkdirSync(mdir, { recursive: true }); fs.mkdirSync(gdir, { recursive: true });
const evidenceFile = path.join(d, "runtime", "generated", "mctrl-evidence.json");
fs.writeFileSync(evidenceFile, JSON.stringify({ ok: true }));
// controlled + authorized engineering mission
fs.writeFileSync(path.join(mdir, "MCTRL.json"), JSON.stringify({ status: "AUTHORIZED", control: { required: true }, authorized_paths: ["runtime/core/"], evidence: ["runtime/generated/mctrl-evidence.json"] }));
// economic-enforced mission
fs.writeFileSync(path.join(mdir, "MECON.json"), JSON.stringify({ status: "AUTHORIZED", control: { economic: true } }));
// generated trusted facts
fs.writeFileSync(path.join(gdir, "runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
fs.writeFileSync(path.join(gdir, "pipeline-checkpoint.json"), JSON.stringify({ status: "COMPLETE", modifiedFiles: ["runtime/core/x.ts"], rollback: { head: "base1" } }));

function both(fn: (m: any) => string) {
  // call the named function on js and ts (same seeded cwd) and compare
  return fn;
}
try {
  process.chdir(d);
  // legacy mission (no contract) ⇒ NO-OP
  check(js.controlDeclared("LEGACY") === false && ts.controlDeclared("LEGACY") === false, "legacy (no contract) ⇒ controlDeclared false (both)");
  check(EQ(js.evaluateMissionAcceptance("LEGACY"), ts.evaluateMissionAcceptance("LEGACY")) && js.evaluateMissionAcceptance("LEGACY").controlled === false, "legacy ⇒ controlled:false NO-OP byte-identical");
  check(EQ(js.commitGateDecision("LEGACY"), ts.commitGateDecision("LEGACY")) && js.commitGateDecision("LEGACY").allowed === true, "legacy commitGateDecision ⇒ allowed:true (NO-OP) byte-identical");

  // controlled mission: gather facts + verdict + commit gate
  check(js.controlDeclared("MCTRL") === true && ts.controlDeclared("MCTRL") === true, "controlled mission ⇒ controlDeclared true (both)");
  check(EQ(js.gatherAcceptanceFacts("MCTRL"), ts.gatherAcceptanceFacts("MCTRL")), "gatherAcceptanceFacts byte-identical (facts assembled from seeded artifacts)");
  const accJ = js.evaluateMissionAcceptance("MCTRL"), accT = ts.evaluateMissionAcceptance("MCTRL");
  check(EQ(accJ, accT) && accJ.controlled === true && accJ.verdict === "ACCEPT", "evaluateMissionAcceptance ACCEPT (authorized + build/tsc true + evidence + write-set) byte-identical");
  check(EQ(js.commitGateDecision("MCTRL"), ts.commitGateDecision("MCTRL")) && js.commitGateDecision("MCTRL").allowed === true, "commitGateDecision allowed on ACCEPT byte-identical");

  // economic enforcement — deny-by-default across report states
  check(js.economicEnforced("MECON") === true && ts.economicEnforced("MECON") === true, "economicEnforced opt-in true (both)");
  // (a) missing report ⇒ UNKNOWN (blocked)
  check(EQ(js.evaluateMissionEconomics("MECON"), ts.evaluateMissionEconomics("MECON")) && js.evaluateMissionEconomics("MECON").verdict === "UNKNOWN" && js.evaluateMissionEconomics("MECON").allowed === false, "economics missing report ⇒ UNKNOWN blocked byte-identical");
  // (b) genuine VERIFIED ⇒ allowed
  fs.writeFileSync(path.join(gdir, "economic-verification-report.json"), JSON.stringify({ mission: "MECON", verdict: "VERIFIED", violations: [], gaps: [], proofs: ["LEDGER_CONSERVED"] }));
  check(EQ(js.evaluateMissionEconomics("MECON"), ts.evaluateMissionEconomics("MECON")) && js.evaluateMissionEconomics("MECON").allowed === true, "economics genuine VERIFIED ⇒ allowed byte-identical");
  // (c) forged VERIFIED (carries a violation ⇒ verdictConsistent false) ⇒ UNKNOWN blocked
  fs.writeFileSync(path.join(gdir, "economic-verification-report.json"), JSON.stringify({ mission: "MECON", verdict: "VERIFIED", violations: ["LEDGER_IMBALANCE"], gaps: [], proofs: [] }));
  check(EQ(js.evaluateMissionEconomics("MECON"), ts.evaluateMissionEconomics("MECON")) && js.evaluateMissionEconomics("MECON").verdict === "UNKNOWN", "economics forged VERIFIED (inconsistent) ⇒ UNKNOWN blocked byte-identical");
  // (d) wrong-mission report ⇒ UNKNOWN (identity enforced, no verdict borrowing)
  fs.writeFileSync(path.join(gdir, "economic-verification-report.json"), JSON.stringify({ mission: "OTHER", verdict: "VERIFIED", violations: [], gaps: [], proofs: ["X"] }));
  check(EQ(js.evaluateMissionEconomics("MECON"), ts.evaluateMissionEconomics("MECON")) && js.evaluateMissionEconomics("MECON").verdict === "UNKNOWN", "economics wrong-mission report ⇒ UNKNOWN blocked byte-identical");
} finally {
  process.chdir(cwd0);
  try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
}

console.log(failures === 0 ? "ALL PASS — LOT acceptance-facts EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
