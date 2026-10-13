// @ts-nocheck
/*
 * LOT η3-B69 — MISSION-LIFECYCLE EQUIVALENCE: the historical runtime/core/mission-lifecycle.js vs the
 * compiled runtime/dist/core/mission-lifecycle.js (TypeScript port) must be behaviourally identical.
 * Offline, deterministic. =============================================================================
 *
 * WHY: η3-B68 (read-only audit) selected mission-lifecycle as the 3rd §M-2 stage. Its transitive ./require
 * closure is EXACTLY 3 modules: mission-lifecycle + governance-kernel + state-transition (both leaves, 0
 * further local requires). The two direct deps stay .js and are loaded with require(); only mission-lifecycle
 * is ported. This harness proves parity BEFORE any .js retirement is contemplated; .js stays the production
 * default (ODG_STAGE_BASE=runtime/core).
 *
 * KEY PARITY PROPERTY (from the B68 audit): the emitted runtime/generated/mission-lifecycle.json has NO
 * volatile fields (no timestamp / pid / absolute path — every field is a deterministic function of the seeded
 * evidence artifacts + the state-machine). So this bench asserts BYTE-IDENTICAL JS≡compiled JSON with ZERO
 * normalisation (stronger than fleet-stage/project-context-engine, which had enumerated volatiles). If any
 * field ever diverges the exact-equality check FAILS loudly — nothing is normalised away.
 *
 * SANDBOXING: every run executes with cwd = a fresh temp sandbox into which the governance SUPPORT dirs
 * (runtime/constitution, runtime/policies, runtime/governance — read cwd-relative by governance-kernel +
 * loadStateMachine) are copied verbatim from the repo (NOT fabricated), plus the per-case seeded evidence
 * artifacts (runtime/generated/*.json) and mission contract (runtime/missions/<mission>.json). The real repo
 * is never written. mission-lifecycle.json is read back from each sandbox and compared.
 *
 * PROOFS:
 *  A. ACHIEVED-STATE MATRIX — 8 evidence combinations walk the chain CREATED→…→RELEASED; mission-lifecycle.json
 *     is BYTE-IDENTICAL JS≡compiled AND `achieved` equals the hand-derived expected state (so "both equally
 *     wrong" cannot pass).
 *  B. C03 records — through the REAL validator: every confirmed advance is a VALID VERIFIED record carrying
 *     ≥1 evidence_ref (invariant I5), strictly-increasing version ordinals (I2); a blocked attempt is UNVERIFIED.
 *  C. S4 commit-gate (REAL git sandboxes) — uncommitted in-scope deliverable ⇒ cap VERIFIED; committed ⇒
 *     RELEASED; git-absent ⇒ back-compat RELEASED. markArchived RELEASED→ARCHIVED + idempotence.
 *  D. ERROR/EXIT — missing state-machine ⇒ both engines throw identically (same non-zero exit); CLI banner.
 *
 * NOTE (honest, derived from code): governance-kernel.authorizeMission returns authorized = (the current
 * state has an outgoing edge) and nextStates = state-machine.transitions[current]. computeLifecycle's walk
 * takes next = transitions[current][0], so `gov.nextStates.includes(next)` is ALWAYS true for a consistent
 * state-machine — the literal "governance did not authorize" branch is structurally unreachable without a
 * self-contradictory machine. The governance GATE's parity is therefore proven via the throw path (Part D:
 * missing governance file ⇒ both engines fail identically) and via the evidence-blocked transitions (Part A),
 * not by fabricating an impossible refusal. This is stated rather than faked.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/mission-lifecycle-equivalence.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const CORE = path.join(REPO, "runtime", "core");
const DIST_CORE = path.join(REPO, "runtime", "dist", "core");
const JS_ENGINE = path.join(CORE, "mission-lifecycle.js");

const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

// --- reuse of the dist-closure-relocation technique (fleet-stage B65): BFS the transitive ./require closure,
//     then co-locate each member in a self-contained dir (compiled output where build:runtime emitted it,
//     historical .js otherwise) so the compiled mission-lifecycle can be LOADED and RUN from that dir. -------
function computeClosure(seeds: string[]): { closure: string[]; missing: string[] } {
  const visited = new Set<string>();
  const closure = new Set<string>();
  const missing: string[] = [];
  const stack = [...seeds];
  while (stack.length) {
    const name = stack.pop()!;
    if (visited.has(name)) continue;
    visited.add(name);
    const file = path.join(CORE, name + ".js");
    if (!fs.existsSync(file)) { missing.push(name); continue; }
    closure.add(name);
    const re = /\brequire\(\s*["'`](\.\/[A-Za-z0-9_-]+)["'`]\s*\)/g;
    let m: RegExpExecArray | null;
    const src = fs.readFileSync(file, "utf8");
    while ((m = re.exec(src)) !== null) stack.push(m[1].replace(/^\.\//, ""));
  }
  return { closure: [...closure].sort(), missing };
}
function placeInDistCore(dir: string, name: string): "compiled" | "historical" {
  const compiled = path.join(DIST_CORE, name + ".js");
  const dest = path.join(dir, name + ".js");
  if (fs.existsSync(compiled)) { fs.cpSync(compiled, dest); return "compiled"; }
  fs.cpSync(path.join(CORE, name + ".js"), dest); return "historical";
}

function writeJson(p: string, obj: any): void {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function baseEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.ODG_VERBOSE; delete env.NODE_PATH;
  return env;
}

// Governance support dirs read cwd-relative by governance-kernel.authorizeMission (constitution, policies)
// and by loadStateMachine (governance/state-machine.json). Copied verbatim — NOT fabricated.
const SUPPORT_DIRS = ["constitution", "policies", "governance"];
function copySupport(sb: string, skip: string[] = []): void {
  for (const d of SUPPORT_DIRS) {
    if (skip.includes(d)) continue;
    const src = path.join(REPO, "runtime", d);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(sb, "runtime", d), { recursive: true });
  }
}

let COMPILED_ENGINE = "";
let composition = { compiled: 0, historical: 0 };
function buildCompiledEngineDir(): void {
  const { closure, missing } = computeClosure(["mission-lifecycle"]);
  check(missing.length === 0, `closure resolves every require target on disk (missing: ${missing.join(",") || "none"})`);
  check(closure.length === 3, `transitive closure is the expected 3-module set (size=${closure.length}: ${closure.join(",")})`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ml-dist-"));
  sandboxes.push(dir);
  for (const n of closure) { const prov = placeInDistCore(dir, n); composition[prov]++; }
  check(fs.existsSync(path.join(dir, "mission-lifecycle.js")), "compiled mission-lifecycle.js co-located in dist closure dir");
  check(fs.readFileSync(path.join(DIST_CORE, "mission-lifecycle.js"), "utf8") === fs.readFileSync(path.join(dir, "mission-lifecycle.js"), "utf8"), "the co-located mission-lifecycle.js IS the compiled build output");
  COMPILED_ENGINE = path.join(dir, "mission-lifecycle.js");
}

// A driver written to a FILE (so argv indices are unambiguous) that requires an engine and calls
// computeLifecycle | markArchived, printing the returned lifecycle's achieved/archived + the exact file.
let DRIVER_FILE = "";
function makeDriver(): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ml-drv-"));
  sandboxes.push(dir);
  DRIVER_FILE = path.join(dir, "ml-driver.js");
  fs.writeFileSync(DRIVER_FILE,
    "const e=require(process.argv[2]);const fn=process.argv[3];const m=process.argv[4];" +
    "const r=e[fn](m);process.stdout.write(JSON.stringify({achieved:r.achieved,archived:r.archived}));");
}

// Seed one sandbox with the governance support + the per-case evidence artifacts + mission contract.
function seedCase(sb: string, mission: string, opts: {
  contract?: any; skipSupport?: string[];
  plan?: any; decision?: any; patch?: any; execution?: any; report?: any; noContract?: boolean;
}): void {
  copySupport(sb, opts.skipSupport || []);
  if (!opts.noContract) {
    const spec: any = { mission, version: "1.0", status: "AUTHORIZED" };
    if (opts.contract) Object.assign(spec, opts.contract);
    writeJson(path.join(sb, "runtime", "missions", mission + ".json"), spec);
  }
  const G = path.join(sb, "runtime", "generated");
  fs.mkdirSync(G, { recursive: true });
  if (opts.plan !== undefined) writeJson(path.join(G, "mission-plan.json"), opts.plan);
  if (opts.decision !== undefined) writeJson(path.join(G, "decision.json"), opts.decision);
  if (opts.patch !== undefined) writeJson(path.join(G, "patch-plan.json"), opts.patch);
  if (opts.execution !== undefined) writeJson(path.join(G, "patch-execution.json"), opts.execution);
  if (opts.report !== undefined) writeJson(path.join(G, "mission-report.json"), opts.report);
}
function newSandbox(tag: string): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ml-" + tag + "-"));
  sandboxes.push(sb);
  return sb;
}
function runMain(enginePath: string, mission: string, sb: string): { status: number | null; out: string } {
  const r = spawnSync("node", [enginePath, mission], { cwd: sb, encoding: "utf8", env: baseEnv() });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function runDriver(enginePath: string, fn: string, mission: string, sb: string): { status: number | null; out: string } {
  const r = spawnSync("node", [DRIVER_FILE, enginePath, fn, mission], { cwd: sb, encoding: "utf8", env: baseEnv() });
  return { status: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function lifecycleJson(sb: string): string | null {
  const f = path.join(sb, "runtime", "generated", "mission-lifecycle.json");
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}

// Full evidence set that drives the chain all the way to the RELEASED predicate.
const FULL = (mission: string) => ({
  contract: { authorized_paths: [] }, // empty scope ⇒ uncommittedPathsInScope returns [] early ⇒ RELEASED
  plan: { objectives: [{ id: "o1" }] },
  decision: { chosen: "x" },
  patch: { status: "READY", patches: [{ file: "a" }] },
  execution: { executed: [{ status: "OK" }] },
  report: { mission, validated: true },
});

console.log("LOT η3-B69 — MISSION-LIFECYCLE EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(JS_ENGINE), "prerequisite: historical runtime/core/mission-lifecycle.js present (untouched)");
  check(fs.existsSync(path.join(DIST_CORE, "mission-lifecycle.js")), "prerequisite: compiled runtime/dist/core/mission-lifecycle.js emitted by build:runtime");
  buildCompiledEngineDir();
  console.log(`  dist closure composition: ${composition.compiled} compiled + ${composition.historical} historical`);
  makeDriver();

  // ---- PART A: achieved-state matrix (byte-identical JSON, exact equality, NO normalisation) ----
  console.log("  --- Part A: achieved-state matrix (exact JSON equality) ---");
  const MATRIX = [
    { name: "no contract → CREATED (QUALIFIED blocked)", m: "A1", seed: { noContract: true }, expect: "CREATED" },
    { name: "contract only → QUALIFIED (ANALYZED blocked)", m: "A2", seed: {}, expect: "QUALIFIED" },
    { name: "+plan objectives → ANALYZED (PLANNED blocked)", m: "A3", seed: { plan: { objectives: [{ id: "o1" }] } }, expect: "ANALYZED" },
    { name: "+decision+patch(not READY) → PLANNED (PREPARED blocked)", m: "A4", seed: { plan: { objectives: [{ id: "o1" }] }, decision: { chosen: "x" }, patch: { status: "DRAFT", patches: [{ file: "a" }] } }, expect: "PLANNED" },
    { name: "+patch READY → PREPARED (VALIDATED blocked)", m: "A5", seed: { plan: { objectives: [{ id: "o1" }] }, decision: { chosen: "x" }, patch: { status: "READY", patches: [{ file: "a" }] } }, expect: "PREPARED" },
    { name: "+report validated → VALIDATED (EXECUTED blocked)", m: "A6", seed: { plan: { objectives: [{ id: "o1" }] }, decision: { chosen: "x" }, patch: { status: "READY", patches: [{ file: "a" }] }, report: { mission: "A6", validated: true } }, expect: "VALIDATED" },
    { name: "full chain, empty scope → RELEASED", m: "A7", seed: FULL("A7"), expect: "RELEASED" },
    { name: "full chain but FAILED execution → VALIDATED (EXECUTED blocked)", m: "A8", seed: { ...FULL("A8"), execution: { executed: [{ status: "FAILED" }] }, report: { mission: "A8", validated: true } }, expect: "VALIDATED" },
  ];
  for (const c of MATRIX) {
    const sbJ = newSandbox("A"); seedCase(sbJ, c.m, c.seed); const rJ = runMain(JS_ENGINE, c.m, sbJ);
    const sbT = newSandbox("A"); seedCase(sbT, c.m, c.seed); const rT = runMain(COMPILED_ENGINE, c.m, sbT);
    const jJson = lifecycleJson(sbJ), tJson = lifecycleJson(sbT);
    check(rJ.status === 0 && rT.status === 0, `A ${c.m}: both exit 0 (js=${rJ.status} ts=${rT.status})`);
    check(jJson !== null && jJson === tJson, `A ${c.m}: mission-lifecycle.json BYTE-IDENTICAL JS≡compiled — ${c.name}`);
    const achieved = jJson ? JSON.parse(jJson).achieved : "<none>";
    check(achieved === c.expect, `A ${c.m}: achieved=${achieved} (expected ${c.expect})`);
  }

  // ---- PART B: C03 records through the REAL validator ----
  console.log("  --- Part B: C03 records + invariants (real validator) ---");
  {
    const sbJ = newSandbox("B"); seedCase(sbJ, "B1", FULL("B1")); runMain(JS_ENGINE, "B1", sbJ);
    const sbT = newSandbox("B"); seedCase(sbT, "B1", FULL("B1")); runMain(COMPILED_ENGINE, "B1", sbT);
    const jJson = lifecycleJson(sbJ), tJson = lifecycleJson(sbT);
    check(jJson === tJson, "B: full-chain mission-lifecycle.json (incl. c03Transitions) BYTE-IDENTICAL JS≡compiled");
    const lc = JSON.parse(jJson);
    const confirmed = lc.c03Transitions.filter((r: any) => r.record && r.record.verification_status === "VERIFIED");
    check(confirmed.length > 0, `B: at least one VERIFIED C03 record on the full chain (${confirmed.length})`);
    check(lc.c03Transitions.every((r: any) => r.ok === true), "B: every C03 record on the confirmed chain is VALID (validator ok)");
    check(confirmed.every((r: any) => Array.isArray(r.record.evidence_refs) && r.record.evidence_refs.length >= 1),
      "B: invariant I5 — every VERIFIED record carries ≥1 evidence_ref");
    check(lc.c03Transitions.every((r: any) => r.record.state_version_after > r.record.state_version_before),
      "B: invariant I2 — state_version_after strictly > before on every record");
  }
  {
    // A blocked attempt is UNVERIFIED (never a fabricated proof).
    const sb = newSandbox("B"); seedCase(sb, "B2", {}); runMain(JS_ENGINE, "B2", sb);
    const lc = JSON.parse(lifecycleJson(sb));
    const blocked = lc.c03Transitions.find((r: any) => r.record && r.record.verification_status === "UNVERIFIED");
    check(!!blocked, "B: a blocked transition is recorded UNVERIFIED (ANALYZED attempt, evidence absent)");
    check(!!blocked && /no mission-plan objectives/.test(JSON.stringify(blocked.record.evidence_refs)),
      "B: the blocked record's evidence_ref is the honest reason (not a fake proof)");
  }

  // ---- PART C: S4 commit-gate (REAL git) + markArchived idempotence ----
  console.log("  --- Part C: S4 commit-gate (real git) + markArchived ---");
  function gitInit(sb: string): void {
    const g = (args: string[]) => execFileSync("git", args, { cwd: sb, stdio: "ignore" });
    g(["init", "-q"]); g(["config", "user.email", "t@t.t"]); g(["config", "user.name", "t"]);
    g(["config", "commit.gpgsign", "false"]);
  }
  function gitCommitAll(sb: string, msg: string): void {
    execFileSync("git", ["add", "-A"], { cwd: sb, stdio: "ignore" });
    execFileSync("git", ["commit", "-q", "-m", msg], { cwd: sb, stdio: "ignore" });
  }
  // Scoped deliverable lives under runtime/deliverable/; contract authorizes that path.
  function s4Seed(sb: string, mission: string): void {
    seedCase(sb, mission, { ...FULL(mission), contract: { authorized_paths: ["runtime/deliverable/"] }, report: { mission, validated: true } });
    fs.mkdirSync(path.join(sb, "runtime", "deliverable"), { recursive: true });
    fs.writeFileSync(path.join(sb, "runtime", "deliverable", "out.txt"), "hello");
  }
  // C-uncommitted: git repo with an UNCOMMITTED in-scope file ⇒ cap VERIFIED (not RELEASED).
  for (const [eng, tag] of [[JS_ENGINE, "js"], [COMPILED_ENGINE, "ts"]] as const) {
    const sb = newSandbox("Cun"); gitInit(sb); s4Seed(sb, "C_UNC"); // out.txt present but NOT committed
    const r = runMain(eng, "C_UNC", sb);
    const ach = JSON.parse(lifecycleJson(sb)).achieved;
    check(r.status === 0 && ach === "VERIFIED", `C [${tag}]: uncommitted in-scope deliverable ⇒ achieved=VERIFIED (got ${ach})`);
  }
  // C-committed: same, but the in-scope file is COMMITTED ⇒ RELEASED.
  for (const [eng, tag] of [[JS_ENGINE, "js"], [COMPILED_ENGINE, "ts"]] as const) {
    const sb = newSandbox("Ccm"); gitInit(sb); s4Seed(sb, "C_CMT"); gitCommitAll(sb, "deliverable");
    const r = runMain(eng, "C_CMT", sb);
    const ach = JSON.parse(lifecycleJson(sb)).achieved;
    check(r.status === 0 && ach === "RELEASED", `C [${tag}]: committed in-scope deliverable ⇒ achieved=RELEASED (got ${ach})`);
  }
  // C-nogit: NOT a git repo, contract has a scope ⇒ git fails ⇒ uncommittedPathsInScope=[] ⇒ RELEASED (back-compat).
  {
    const sbJ = newSandbox("Cng"); s4Seed(sbJ, "C_NG"); const rJ = runMain(JS_ENGINE, "C_NG", sbJ);
    const sbT = newSandbox("Cng"); s4Seed(sbT, "C_NG"); const rT = runMain(COMPILED_ENGINE, "C_NG", sbT);
    const aJ = JSON.parse(lifecycleJson(sbJ)).achieved, aT = JSON.parse(lifecycleJson(sbT)).achieved;
    check(aJ === "RELEASED" && aT === "RELEASED", `C nogit: git unavailable ⇒ back-compat RELEASED on both (js=${aJ} ts=${aT})`);
    check(lifecycleJson(sbJ) === lifecycleJson(sbT), "C nogit: mission-lifecycle.json BYTE-IDENTICAL JS≡compiled");
  }
  // markArchived: on a RELEASED lifecycle (git-clean committed scope) → ARCHIVED; second call idempotent.
  for (const [eng, tag] of [[JS_ENGINE, "js"], [COMPILED_ENGINE, "ts"]] as const) {
    const sb = newSandbox("arch"); gitInit(sb); s4Seed(sb, "C_ARCH"); gitCommitAll(sb, "deliverable");
    runMain(eng, "C_ARCH", sb); // compute → RELEASED, writes file
    const d1 = runDriver(eng, "markArchived", "C_ARCH", sb);
    const lc1 = JSON.parse(lifecycleJson(sb));
    check(d1.status === 0 && lc1.achieved === "ARCHIVED" && lc1.archived === true, `C markArchived [${tag}]: RELEASED→ARCHIVED (got ${lc1.achieved})`);
    const nArch1 = lc1.transitions.filter((t: any) => t.to === "ARCHIVED").length;
    const json1 = lifecycleJson(sb);
    runDriver(eng, "markArchived", "C_ARCH", sb); // second call
    const json2 = lifecycleJson(sb);
    const nArch2 = JSON.parse(json2).transitions.filter((t: any) => t.to === "ARCHIVED").length;
    check(nArch1 === 1 && nArch2 === 1 && json1 === json2, `C markArchived [${tag}]: idempotent (no duplicate ARCHIVED transition; file stable)`);
  }
  // markArchived JS≡compiled byte-identical final state.
  {
    const sbJ = newSandbox("archEq"); gitInit(sbJ); s4Seed(sbJ, "C_AEQ"); gitCommitAll(sbJ, "d"); runMain(JS_ENGINE, "C_AEQ", sbJ); runDriver(JS_ENGINE, "markArchived", "C_AEQ", sbJ);
    const sbT = newSandbox("archEq"); gitInit(sbT); s4Seed(sbT, "C_AEQ"); gitCommitAll(sbT, "d"); runMain(COMPILED_ENGINE, "C_AEQ", sbT); runDriver(COMPILED_ENGINE, "markArchived", "C_AEQ", sbT);
    check(lifecycleJson(sbJ) === lifecycleJson(sbT), "C markArchived: archived mission-lifecycle.json BYTE-IDENTICAL JS≡compiled");
  }

  // ---- PART D: error / exit parity (governance gate via throw path) + CLI banner ----
  console.log("  --- Part D: error/exit parity + CLI banner ---");
  {
    // Missing governance/ ⇒ loadStateMachine throws ⇒ both engines exit non-zero identically.
    const sbJ = newSandbox("Derr"); seedCase(sbJ, "D1", { ...FULL("D1"), skipSupport: ["governance"] }); const rJ = runMain(JS_ENGINE, "D1", sbJ);
    const sbT = newSandbox("Derr"); seedCase(sbT, "D1", { ...FULL("D1"), skipSupport: ["governance"] }); const rT = runMain(COMPILED_ENGINE, "D1", sbT);
    check(rJ.status !== 0 && rT.status !== 0 && rJ.status === rT.status, `D: missing state-machine ⇒ both exit non-zero identically (js=${rJ.status} ts=${rT.status})`);
    check(/state machine unreadable/.test(rJ.out) && /state machine unreadable/.test(rT.out), "D: both surface the same 'state machine unreadable' error");
    check(lifecycleJson(sbJ) === null && lifecycleJson(sbT) === null, "D: neither engine wrote mission-lifecycle.json on the error path");
  }
  {
    // CLI banner parity (run-as-main).
    const sbJ = newSandbox("Dcli"); seedCase(sbJ, "D2", FULL("D2")); const rJ = runMain(JS_ENGINE, "D2", sbJ);
    const sbT = newSandbox("Dcli"); seedCase(sbT, "D2", FULL("D2")); const rT = runMain(COMPILED_ENGINE, "D2", sbT);
    const strip = (s: string) => s.replace(/\r/g, "");
    check(strip(rJ.out) === strip(rT.out), "D: CLI banner BYTE-IDENTICAL JS≡compiled");
    check(/MISSION LIFECYCLE \(governance-driven\)/.test(rJ.out) && /Achieved : RELEASED/.test(rJ.out), "D: banner shows governance-driven header + Achieved : RELEASED");
  }

  // ---- PART E: governance CONSISTENCY invariant (η3-B73 clarification) ----
  console.log("  --- Part E: governance consistency invariant (B73) ---");
  // E1: the kernel returns authorized:false ONLY for an edgeless/unknown state — existing contract,
  //     authorityEnforced:false (NO allowlist / authority source invented). Proven against the REAL kernel.
  {
    const sb = newSandbox("Ek"); copySupport(sb);
    const drv = path.join(sb, "k.js");
    fs.writeFileSync(drv, "const g=require(process.argv[2]);const o={};for(const s of ['CREATED','RELEASED','ARCHIVED','BOGUS']){const r=g.authorizeMission('P',s);o[s]=[r.authorized,r.authorityEnforced,r.nextStates.length]}process.stdout.write(JSON.stringify(o));");
    const kernelPath = path.join(path.dirname(COMPILED_ENGINE), "governance-kernel.js"); // the real historical kernel co-located
    const r = spawnSync("node", [drv, kernelPath], { cwd: sb, encoding: "utf8", env: baseEnv() });
    const o = JSON.parse(r.stdout);
    check(o.CREATED[0] === true && o.RELEASED[0] === true, "E1: kernel authorized:true for states WITH an outgoing edge (CREATED, RELEASED)");
    check(o.ARCHIVED[0] === false && o.BOGUS[0] === false, "E1: kernel authorized:false ONLY for edgeless/unknown states (ARCHIVED, BOGUS)");
    check(o.CREATED[1] === false && o.ARCHIVED[1] === false, "E1: authorityEnforced:false preserved on both (no authority source invented)");
  }
  // E2: a CONSISTENT walk NEVER records a governance-refusal and NEVER throws the invariant (both engines).
  {
    for (const [eng, tag] of [[JS_ENGINE, "js"], [COMPILED_ENGINE, "ts"]] as const) {
      const sb = newSandbox("Ec"); seedCase(sb, "E2", FULL("E2")); const r = runMain(eng, "E2", sb);
      const lc = JSON.parse(lifecycleJson(sb));
      const refusal = lc.transitions.some((t: any) => /governance did not authorize|state-machine inconsistency/.test(t.evidence || ""));
      check(r.status === 0 && !refusal, `E2 [${tag}]: consistent walk exits 0 and records NO governance-refusal/inconsistency transition`);
    }
  }
  // E3: a CONTROLLED structural inconsistency (kernel STUBBED to violate the nextStates⊇next contract) is
  //     surfaced as an EXPLICIT, verifiable error — NOT a fake "governance did not authorize" refusal.
  //     HONEST LIMITATION (per mission honesty clause): this divergence is ARTIFICIAL — no real runtime input
  //     produces it, because governance-kernel and the walk read the SAME state-machine.json in the SAME tick.
  //     The stub validates the GUARD's RESPONSE to a violated contract, it does NOT reproduce a real incident.
  {
    const STUB = "module.exports={authorizeMission:(m,s)=>({mission:m,currentState:s,authorized:true,authorityEnforced:false,nextStates:['__INCONSISTENT__']})};";
    function stubbedEngineDir(engineSrc: string): string {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ml-stub-"));
      sandboxes.push(dir);
      fs.cpSync(engineSrc, path.join(dir, "mission-lifecycle.js"));
      fs.cpSync(path.join(CORE, "state-transition.js"), path.join(dir, "state-transition.js"));
      fs.writeFileSync(path.join(dir, "governance-kernel.js"), STUB); // artificial: breaks nextStates⊇next
      return path.join(dir, "mission-lifecycle.js");
    }
    for (const [src, tag] of [[JS_ENGINE, "js"], [COMPILED_ENGINE, "ts"]] as const) {
      const engine = stubbedEngineDir(src);
      const sb = newSandbox("Ei"); seedCase(sb, "E3", FULL("E3")); const r = runMain(engine, "E3", sb);
      check(r.status !== 0, `E3 [${tag}]: controlled structural inconsistency ⇒ non-zero exit (got ${r.status})`);
      check(/state-machine inconsistency/.test(r.out), `E3 [${tag}]: surfaced as EXPLICIT 'state-machine inconsistency' error`);
      check(!/governance did not authorize/.test(r.out), `E3 [${tag}]: the misleading 'governance did not authorize' wording is GONE`);
      check(lifecycleJson(sb) === null, `E3 [${tag}]: no mission-lifecycle.json written on the inconsistency error path`);
    }
  }
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT η3-B69 MISSION-LIFECYCLE EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
