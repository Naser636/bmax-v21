#!/usr/bin/env node
/*
 * LOT expert-profile-assembler — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, READ-ONLY: build:runtime compiles runtime/core/expert-profile-assembler.ts →
 * runtime/dist/core/expert-profile-assembler.js (pure leaf, zero internal deps).
 *
 * THE PATH INVARIANT UNDER TEST: the historical .js derives REPO_ROOT from __dirname (⇒ repo root from
 * runtime/core, but WRONG from runtime/dist/core), which is why migrate-plan hazard-blocked it. The port
 * derives REPO_ROOT from process.cwd() — EQUAL to the __dirname-root in the verified launch context (cwd =
 * repo root, where stages/CLI are spawned and where this bench runs). This bench proves that in that
 * context js.REPO_ROOT === ts.REPO_ROOT and every pure/read-only function is BYTE-IDENTICAL, using REAL
 * committed repo files as deterministic fixtures. (From dist/core the .js would be WRONG and the .ts
 * CORRECT — that divergence is the whole point of the port and is out of scope for a same-cwd equality test.)
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/expert-profile-assembler-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "expert-profile-assembler.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "expert-profile-assembler.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT expert-profile-assembler — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/expert-profile-assembler.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/expert-profile-assembler.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["PROFILE_STATUS", "REPO_ROOT", "resolveComponent", "loadProfile", "verifyProfile", "boundAuthority", "compileInstance"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.PROFILE_STATUS, ts.PROFILE_STATUS) && Object.isFrozen(ts.PROFILE_STATUS), "PROFILE_STATUS byte-identical + frozen");

// PATH INVARIANT: in the verified launch context (cwd = repo root) the __dirname-root (.js) and the
// process.cwd()-root (.ts) are EQUAL — the production precondition that makes the port behaviour-identical.
check(js.REPO_ROOT === ts.REPO_ROOT && ts.REPO_ROOT === process.cwd(), "REPO_ROOT equal in verified launch context (js __dirname-root === ts process.cwd() === cwd)");

// Real committed fixtures (present in the candidate git-archive): a certified pair, an existing file whose
// declared test is absent (DEGRADED), and a missing file (BROKEN).
const CERT = { name: "gov", file: "runtime/core/governance-kernel.js", test: "runtime/core/governance-kernel.test.ts" };
const UNCERT = { name: "loader", file: "runtime/core/mission-loader.js", test: "runtime/core/__definitely_absent__.test.js" };
const BROKEN = { name: "ghost", file: "runtime/core/__definitely_absent__.js", test: "runtime/core/__also_absent__.test.js" };

// resolveComponent parity (read-only existence+certification against the real tree).
for (const c of [CERT, UNCERT, BROKEN]) {
  check(EQ(js.resolveComponent(c), ts.resolveComponent(c)), `resolveComponent(${c.name}) BYTE-IDENTICAL`);
}
check(js.resolveComponent(CERT).exists === true && js.resolveComponent(CERT).certified === true, "resolveComponent(certified) ⇒ exists+certified");
check(js.resolveComponent(UNCERT).exists === true && js.resolveComponent(UNCERT).certified === false, "resolveComponent(file w/o test) ⇒ exists, NOT certified");
check(js.resolveComponent(BROKEN).exists === false, "resolveComponent(missing file) ⇒ not exists");

// verifyProfile parity: CERTIFIED / DEGRADED / BROKEN precedence + flags order.
const pCert = { id: "P1", canon: "c", capabilities: [CERT], validators: [CERT] };
const pDeg = { id: "P2", canon: "c", capabilities: [CERT], validators: [UNCERT] };
const pBroke = { id: "P3", canon: "c", capabilities: [CERT, BROKEN], validators: [UNCERT] };
check(EQ(js.verifyProfile(pCert), ts.verifyProfile(pCert)) && js.verifyProfile(pCert).status === "CERTIFIED", "verifyProfile(all certified) ⇒ CERTIFIED BYTE-IDENTICAL");
check(EQ(js.verifyProfile(pDeg), ts.verifyProfile(pDeg)) && js.verifyProfile(pDeg).status === "DEGRADED", "verifyProfile(uncertified present) ⇒ DEGRADED BYTE-IDENTICAL");
check(EQ(js.verifyProfile(pBroke), ts.verifyProfile(pBroke)) && js.verifyProfile(pBroke).status === "BROKEN", "verifyProfile(missing file) ⇒ BROKEN (precedence) BYTE-IDENTICAL");
const pLim = { id: "P4", canon: "c", capabilities: [{ ...CERT, limitation: "offline-only" }] };
check(EQ(js.verifyProfile(pLim), ts.verifyProfile(pLim)) && js.verifyProfile(pLim).flags.some((f: string) => f.startsWith("LIMITATION:")), "verifyProfile(limitation) ⇒ LIMITATION flag BYTE-IDENTICAL");
check(EQ(js.verifyProfile({ id: "E", canon: "c" }), ts.verifyProfile({ id: "E", canon: "c" })), "verifyProfile(no components) BYTE-IDENTICAL");

// boundAuthority parity: intersection is always a SUBSET of mission (§307 — never a superset).
const cases: any[] = [
  [["a", "b", "c"], ["b", "c", "d"]],
  [["a"], ["x"]],
  [[], ["a"]],
  ["not-array", ["a"]],
  [["a", "b"], "not-array"],
];
for (const [m, p] of cases) {
  const r = js.boundAuthority(m, p);
  check(EQ(r, ts.boundAuthority(m, p)), `boundAuthority(${JSON.stringify(m)},${JSON.stringify(p)}) BYTE-IDENTICAL`);
  const mArr = Array.isArray(m) ? m : [];
  check(r.every((a: any) => mArr.includes(a)), "boundAuthority result is a SUBSET of mission (never superset)");
}

// compileInstance parity: §303 record; authority_scope subset; cannot_modify invariant; missing id throws.
const mission = { mission_id: "M1", objective_id: "O1", authority: ["read", "write", "deploy"], budget: null, expiration: "mission_end" };
const profile = { id: "ENG", canon: "c", capabilities: [CERT], validators: [CERT], permission_scope: { authority: ["read", "write"], data_scope: "mission" }, tools: ["grep"], constraints: ["no-network"] };
check(EQ(js.compileInstance(profile, mission), ts.compileInstance(profile, mission)), "compileInstance BYTE-IDENTICAL");
const inst = ts.compileInstance(profile, mission);
check(EQ(inst.authority_scope, ["read", "write"]) && !inst.authority_scope.includes("deploy"), "compileInstance authority_scope = mission ∩ profile (subset; 'deploy' NOT granted)");
check(EQ(inst.cannot_modify, ["constitution", "authority_model", "final_governance", "unrelated_missions"]), "compileInstance cannot_modify §303 invariant preserved");
let threwJ = false, threwT = false;
try { js.compileInstance(profile, {}); } catch { threwJ = true; }
try { ts.compileInstance(profile, {}); } catch { threwT = true; }
check(threwJ === true && threwT === true, "compileInstance(no mission_id) ⇒ throws (both)");

// loadProfile parity on the error paths (no repo writes): missing file throws; present-but-missing-key throws.
let eJ = false, eT = false;
try { js.loadProfile("runtime/core/__absent_profile__.json"); } catch { eJ = true; }
try { ts.loadProfile("runtime/core/__absent_profile__.json"); } catch { eT = true; }
check(eJ === true && eT === true, "loadProfile(missing file) ⇒ throws (both)");

console.log(failures === 0 ? "ALL PASS — LOT expert-profile-assembler EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
