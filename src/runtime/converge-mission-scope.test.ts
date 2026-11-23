/*
 * V16.1 — MISSION-SCOPED converge for the odg-delegate path (offline, hermetic).
 *
 *   A. parseConvergeScope — no scope flag ⇒ null (the UNCHANGED campaign converge, whatever else argv holds);
 *      malformed / unsafe / ambiguous scoped input ⇒ { error } (never silently widened to the campaign).
 *   B. Other callers unchanged — convergeMain([]) and convergeMain(["x"]) produce BYTE-IDENTICAL writes, logs and
 *      exit codes to runConverge(seams) for every terminal status; the report carries no `scope` key.
 *   C. Scoped converge on the REAL RuntimeAutonomy loop + REAL Release Manager over fake inner ports:
 *      exactly the target mission runs (the adapter's campaign readPlanState is never called), RELEASE ⇒ exit 0 +
 *      archive once; a diverged tree at pre-flight ⇒ exit 2 with NO pipeline; a new dirty path at evidence time ⇒
 *      NO_RELEASE ⇒ exit 2 and NO archive; without --delegated-path the inner (default) gitClean is used unchanged.
 *   D. The DEFAULT delegated verdict (odg-verify's own delegatedGitClean over a real temp git repo): proven patch ⇒
 *      clean; an extra untracked file / a tracked edit outside the set ⇒ not clean, residual named.
 *   E. Bin wiring — odg-delegate passes converge EXACTLY `--mission=<M>` + the SAME proven --delegated-path set it
 *      passed verify; a failing converge ⇒ delegate exits non-zero and never archives; odg-converge forwards argv
 *      verbatim (no argument ⇒ [entry] only, as before).
 *
 * Run: node_modules/.bin/tsx src/runtime/converge-mission-scope.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  convergeMain,
  parseConvergeScope,
  runConverge,
  runScopedConverge,
  type ConvergeSeams,
  type DelegatedVerdict,
} from "./converge-cli";
import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import {
  AUTONOMY_CONTRACT_VERSION,
  type AutonomyRunResult,
  type AutonomyRuntimePorts,
  type AutonomyStatus,
  type MissionContract,
  type ReleaseEvidence,
} from "@/contracts/runtime-autonomy";
import type { DocumentationProof } from "@/contracts/documentation";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const REPO = process.cwd();

// ---------------------------------------------------------------- A. argv parsing
console.log("A. parseConvergeScope");
{
  check(parseConvergeScope([]) === null, "A1. no argv ⇒ null (campaign converge)");
  check(parseConvergeScope(["whatever", "--verbose"]) === null, "A2. argv without a scope flag ⇒ null (prior behaviour: argv ignored)");
  const s = parseConvergeScope(["--mission=M_1", "--delegated-path=docs/b.md", "--delegated-path=docs/a.md", "--delegated-path=docs/a.md"]);
  check(!!s && !("error" in s) && s.mission === "M_1" && JSON.stringify(s.delegatedPaths) === JSON.stringify(["docs/a.md", "docs/b.md"]), "A3. scope parsed, paths deduped + sorted");
  const m = parseConvergeScope(["--mission=M_1"]);
  check(!!m && !("error" in m) && m.delegatedPaths.length === 0, "A4. --mission alone ⇒ scoped, default gitClean gate");
  const err = (a: string[]) => { const r = parseConvergeScope(a); return !!r && "error" in r; };
  check(err(["--delegated-path=docs/a.md"]), "A5. --delegated-path without --mission ⇒ error");
  check(err(["--mission=A", "--mission=B"]), "A6. two missions ⇒ error");
  check(err(["--mission=../x"]) && err(["--mission="]) && err(["--mission=a b"]), "A7. unsafe/empty mission id ⇒ error");
  check(err(["--mission=M", "--delegated-path=../etc/passwd"]) && err(["--mission=M", "--delegated-path=/abs"]) && err(["--mission=M", "--delegated-path="]) && err(["--mission=M", "--delegated-path=a b"]), "A8. unsafe delegated path ⇒ error");
  check(err(["--mission=M", "extra"]), "A9. unknown argument alongside a scope ⇒ error (no silent widening)");
  const logs: string[] = [];
  const code = convergeMain(["--delegated-path=x.md"], { log: (...a) => void logs.push(a.join(" ")) });
  check(code === 2 && /converge scope refused/.test(logs.join("\n")), "A10. convergeMain on a malformed scope ⇒ exit 2, refused, nothing run");
}

// ---------------------------------------------------------------- B. other callers byte-identical
console.log("B. campaign converge unchanged for every other caller");
function campaignResult(status: AutonomyStatus, released: string[]): AutonomyRunResult {
  return {
    autonomyContractVersion: AUTONOMY_CONTRACT_VERSION, status, planComplete: status === "PLAN_COMPLETE", cycles: released.length,
    completed: released.map((mission) => ({ mission, record: {} as never })),
    halt: status === "PLAN_COMPLETE" ? null : { mission: "MX", reason: status, message: `halt ${status}` },
  };
}
function campaignSeams(status: AutonomyStatus, released: string[], writes: [string, string][], logs: string[], counters: { contracts: number; run: number }): ConvergeSeams {
  return {
    autonomy: { initialize: () => ({ ready: true }), run: () => { counters.run++; return campaignResult(status, released); } },
    ports: {} as never,
    generateContracts: () => { counters.contracts++; return { ok: true, detail: "stub" }; },
    migrationReport: () => "MIGRATION",
    readJson: (rel) => (rel === "mission-ledger.json" ? { entries: [{ proven: true }] } : null),
    writeFile: (abs, c) => void writes.push([abs, c]),
    now: () => "2026-11-23T00:00:00.000Z",
    log: (...a) => void logs.push(a.map(String).join(" ")),
  };
}
for (const [status, released] of [["PLAN_COMPLETE", ["A", "B"]], ["BLOCKED", []], ["VALIDATED_PENDING_COMMIT", []], ["EXECUTION_FAILED", []]] as [AutonomyStatus, string[]][]) {
  for (const argv of [[], ["unrelated-arg"]]) {
    const w1: [string, string][] = [], l1: string[] = [], c1 = { contracts: 0, run: 0 };
    const w2: [string, string][] = [], l2: string[] = [], c2 = { contracts: 0, run: 0 };
    const e1 = runConverge(campaignSeams(status, released, w1, l1, c1));
    const e2 = convergeMain(argv, campaignSeams(status, released, w2, l2, c2));
    check(e1 === e2 && JSON.stringify(w1) === JSON.stringify(w2) && JSON.stringify(l1) === JSON.stringify(l2) && JSON.stringify(c1) === JSON.stringify(c2),
      `B. ${status} argv=${JSON.stringify(argv)} ⇒ exit/writes/logs/calls byte-identical to runConverge (exit ${e1})`);
    const rep = JSON.parse((w2.find(([p]) => p.endsWith("convergence-report.json")) || ["", "{}"])[1]);
    check(!("scope" in rep) && c2.contracts === 1, `B. ${status} argv=${JSON.stringify(argv)} ⇒ campaign report (no scope key), contract factory ran once`);
  }
}

// ---------------------------------------------------------------- C. scoped converge on the real loop
console.log("C. mission-scoped converge — real RuntimeAutonomy + Release Manager over fake inner ports");
const PROOF: DocumentationProof = {
  artifactContractVersion: "1.0.0", requestId: "X", artifactCount: 1,
  artifacts: [{ kind: "report", id: "X", version: "1.0.0", hash: "abcd0000abcd0000" }], inputsHash: "0123456789abcdef",
};
function contractOf(m: string): MissionContract {
  return { mission: m, priority: "NORMAL", mode: "SEQUENTIAL", objectives: [{ id: m, goal: "g", done_when: ["d"] }], definition_of_done: ["d"], completion: ["RELEASE"] };
}
function innerPorts(innerGitClean: boolean, log: string[]): AutonomyRuntimePorts {
  return {
    readPlanState: () => { log.push("campaign-readPlanState"); return { masterPlanObjectives: ["OTHER_A", "T", "OTHER_B"], missingCapabilities: ["OTHER_A", "T", "OTHER_B"], completedMissions: [] }; },
    generateContract: (m) => { log.push(`contract:${m}`); return contractOf(m); },
    runPipeline: (m) => { log.push(`pipeline:${m}`); return { pipelineOk: true }; },
    gatherEvidence: (m): ReleaseEvidence => {
      log.push(`evidence:${m}`);
      return {
        validation: { build: true, typescript: true, gitClean: innerGitClean, missionPipeline: true },
        source: { commit: "abc123", branch: "main" }, documentationProof: { ...PROOF, requestId: m },
        artifacts: [{ kind: "certificate", id: m, version: "1.0.0" }], previousReleaseRef: null,
      };
    },
    archive: (m) => { log.push(`archive:${m}`); },
  };
}
function scoped(delegatedPaths: string[], innerGitClean: boolean, verdicts: DelegatedVerdict[]) {
  const log: string[] = [], writes: [string, string][] = [];
  let vi = 0;
  const seen: string[][] = [];
  const code = runScopedConverge({ mission: "T", delegatedPaths }, {
    autonomy: new RuntimeAutonomy(),
    ports: innerPorts(innerGitClean, log),
    migrationReport: () => "MIGRATION",
    readJson: () => null,
    writeFile: (abs, c) => void writes.push([abs, c]),
    now: () => "2026-11-23T00:00:00.000Z",
    log: () => {},
    delegatedVerdict: (p) => { seen.push(p.slice()); return verdicts[Math.min(vi++, verdicts.length - 1)]; },
  });
  const rep = JSON.parse((writes.find(([p]) => p.endsWith("convergence-report.json")) || ["", "{}"])[1]);
  return { code, log, rep, seen };
}
const CLEAN: DelegatedVerdict = { gitClean: true, residual: [] };
const DIRTY: DelegatedVerdict = { gitClean: false, residual: ["docs/stray.md"] };
{
  // Persisted gitClean is FALSE in delegated mode (#922) — the scoped converge must use the fresh delegated verdict.
  const r = scoped(["docs/a.md"], false, [CLEAN, CLEAN]);
  check(r.code === 3, "C1. proven patch unchanged ⇒ PROVEN, PENDING HUMAN COMMIT ⇒ exit 3 (never a RELEASE)");
  check(!r.log.includes("campaign-readPlanState"), "C2. the adapter's campaign readPlanState is NEVER called (no roadmap walk)");
  check(JSON.stringify(r.log) === JSON.stringify(["contract:T", "pipeline:T", "evidence:T"]), "C3. exactly the target mission ran and NOTHING was archived (no ledger/checkpoint write)");
  check(r.seen.length === 2 && r.seen.every((p) => JSON.stringify(p) === JSON.stringify(["docs/a.md"])), "C4. verdict computed twice (pre-flight + evidence) on the SAME proven set");
  check(r.rep.converged === false && r.rep.status === "VALIDATED_PENDING_COMMIT" && r.rep.scope?.mission === "T" && r.rep.scope?.released === false
    && r.rep.scope?.gitCleanBasis === "DELEGATED_PATCH" && r.rep.scope?.delegatedPatchClean === true && r.rep.scope?.pendingHumanCommit === true,
    "C5. report: VALIDATED_PENDING_COMMIT, not released, delegatedPatchClean exposed SEPARATELY, pendingHumanCommit");
  check(r.rep.halt?.mission === "T" && r.rep.halt?.reason === "VALIDATED_PENDING_COMMIT", "C5b. the Release Manager saw gitClean=false (tree state) ⇒ NO_RELEASE ⇒ honest pending-commit halt");
  check(process.env.ODG_DELEGATED_PATCH_PENDING_COMMIT === undefined, "C5c. refuse-only ledger marker is restored after the scoped run");
}
{
  // Even if the inner evidence claims gitClean=true, delegated mode FORCES the tree state false ⇒ no RELEASE/archive.
  const r = scoped(["docs/a.md"], true, [CLEAN, CLEAN]);
  check(r.code === 3 && !r.log.some((l) => l.startsWith("archive:")), "C5d. delegated mode never RELEASEs/archives, even if inner gitClean claims true");
}
{
  // The pipeline (inside runPipeline) sees the refuse-only ledger marker in delegated mode only.
  let seen: string | undefined = "unset";
  const ports = innerPorts(false, []);
  const wrapped: AutonomyRuntimePorts = { ...ports, runPipeline: (m) => { seen = process.env.ODG_DELEGATED_PATCH_PENDING_COMMIT; return ports.runPipeline(m); } };
  runScopedConverge({ mission: "T", delegatedPaths: ["docs/a.md"] }, { autonomy: new RuntimeAutonomy(), ports: wrapped, migrationReport: () => "M", readJson: () => null, writeFile: () => {}, now: () => "2026-11-23T00:00:00.000Z", log: () => {}, delegatedVerdict: () => CLEAN });
  check(seen === "1", "C5e. delegated mode: pipeline children inherit ODG_DELEGATED_PATCH_PENDING_COMMIT=1 (ledger stage refuses)");
  seen = "unset";
  runScopedConverge({ mission: "T", delegatedPaths: [] }, { autonomy: new RuntimeAutonomy(), ports: { ...innerPorts(true, []), runPipeline: () => { seen = process.env.ODG_DELEGATED_PATCH_PENDING_COMMIT; return { pipelineOk: true }; } }, migrationReport: () => "M", readJson: () => null, writeFile: () => {}, now: () => "2026-11-23T00:00:00.000Z", log: () => {} });
  check(seen === undefined, "C5f. default (post-commit) mode: no marker ⇒ ledger records normally");
}
{
  const r = scoped(["docs/a.md"], false, [DIRTY]);
  check(r.code === 2 && r.log.length === 0, "C6. tree diverged before converge ⇒ exit 2, NO pipeline/evidence/archive");
  check(r.rep.converged === false && r.rep.scope?.preflightStop === "PREFLIGHT_DIVERGED", "C7. report records PREFLIGHT_DIVERGED");
}
{
  const r = scoped(["docs/a.md"], false, [CLEAN, DIRTY]);
  check(r.code === 2, "C8. new dirty path at evidence time ⇒ NO_RELEASE ⇒ exit 2");
  check(!r.log.some((l) => l.startsWith("archive:")), "C9. … and NOTHING archived");
  check(r.rep.converged === false && r.rep.scope?.released === false, "C10. report: not converged, not released");
}
{
  const r = scoped([], false, [CLEAN]);
  check(r.code === 2 && r.seen.length === 0 && !r.log.some((l) => l.startsWith("archive:")), "C11. no --delegated-path ⇒ default gitClean gate used as-is (dirty ⇒ exit 2, no verdict override)");
  const g = scoped([], true, [DIRTY]);
  check(g.code === 0 && g.seen.length === 0, "C12. no --delegated-path + genuinely clean tree ⇒ RELEASE (verdict never consulted)");
}

// ---------------------------------------------------------------- D. default verdict on a real git repo
console.log("D. default delegated verdict (odg-verify delegatedGitClean) over a real temp git repo");
function gitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v161-conv-"));
  const g = (a: string[]) => spawnSync("git", a, { cwd: dir, stdio: "ignore" });
  g(["init", "-q"]); g(["config", "user.email", "t@t.t"]); g(["config", "user.name", "t"]);
  fs.mkdirSync(path.join(dir, "runtime", "dist", "bin"), { recursive: true });
  fs.copyFileSync(path.join(REPO, "runtime", "dist", "bin", "odg-verify.js"), path.join(dir, "runtime", "dist", "bin", "odg-verify.js"));
  fs.writeFileSync(path.join(dir, ".gitignore"), "runtime/\n");
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n");
  g(["add", "-A"]); g(["-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed"]);
  fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs", "a.md"), "patch\n");
  return dir;
}
function realScoped(dir: string): { code: number; rep: { scope?: { delegatedVerdicts?: DelegatedVerdict[] } }; log: string[] } {
  const prev = process.cwd();
  const log: string[] = [], writes: [string, string][] = [];
  process.chdir(dir);
  try {
    const code = runScopedConverge({ mission: "T", delegatedPaths: ["docs/a.md"] }, {
      autonomy: new RuntimeAutonomy(), ports: innerPorts(false, log), migrationReport: () => "M", readJson: () => null,
      writeFile: (abs, c) => void writes.push([abs, c]), now: () => "2026-11-23T00:00:00.000Z", log: () => {},
    });
    return { code, rep: JSON.parse((writes.find(([p]) => p.endsWith("convergence-report.json")) || ["", "{}"])[1]), log };
  } finally { process.chdir(prev); }
}
if (!fs.existsSync(path.join(REPO, "runtime", "dist", "bin", "odg-verify.js"))) {
  failures++; console.log("  FAIL D0. runtime/dist/bin/odg-verify.js missing — run `npm run build:runtime` first");
} else {
  { const d = gitRepo(); const r = realScoped(d);
    check(r.code === 3 && !r.log.includes("archive:T"), "D1. only the proven untracked patch ⇒ delegated verdict clean ⇒ PENDING COMMIT (exit 3), not archived"); fs.rmSync(d, { recursive: true, force: true }); }
  { const d = gitRepo(); fs.writeFileSync(path.join(d, "docs", "stray.md"), "x\n"); const r = realScoped(d);
    const v = r.rep.scope?.delegatedVerdicts?.[0];
    check(r.code === 2 && r.log.length === 0 && !!v && v.gitClean === false && v.residual.includes("docs/stray.md"), "D2. extra untracked sibling ⇒ pre-flight STOP, residual names docs/stray.md"); fs.rmSync(d, { recursive: true, force: true }); }
  { const d = gitRepo(); fs.writeFileSync(path.join(d, "README.md"), "edited\n"); const r = realScoped(d);
    check(r.code === 2 && !r.log.includes("archive:T"), "D3. tracked edit outside the proven set ⇒ STOP, nothing archived"); fs.rmSync(d, { recursive: true, force: true }); }
  { const d = fs.mkdtempSync(path.join(os.tmpdir(), "v161-nogit-")); fs.mkdirSync(path.join(d, "runtime", "dist", "bin"), { recursive: true });
    fs.copyFileSync(path.join(REPO, "runtime", "dist", "bin", "odg-verify.js"), path.join(d, "runtime", "dist", "bin", "odg-verify.js"));
    const r = realScoped(d);
    check(r.code === 2 && r.log.length === 0, "D4. not a git repo (git status fails) ⇒ fail-closed STOP"); fs.rmSync(d, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------- E. bin wiring (odg-delegate → converge; odg-converge argv)
console.log("E. bin wiring");
const MODULES = ["truth-lock-gate", "truth-lock", "delegate-isolation", "scope-observer", "mission-lifecycle", "action-gate",
  "bash-command-governor", "evidence-provenance", "provider-sandbox", "state-transition", "governance-kernel", "prefer-dist-bin",
  "odg-sovereign-delegation"];
const LOADER_STUB = `const fs=require("fs"),path=require("path");
const plan={mission:"M",mode:"IMPLEMENT",authorizedPaths:["src/app/deliverable.ts"],objectives:[{id:"m_1",goal:"deliver",done_when:["ok"]}],definition_of_done:["ok"]};
fs.mkdirSync(path.join("runtime","generated"),{recursive:true});
fs.writeFileSync(path.join("runtime","generated","mission-plan.json"),JSON.stringify(plan,null,2));
process.exit(0);
`;
const recStub = (name: string, exitEnv: string) => `require("fs").writeFileSync(${JSON.stringify(name)},JSON.stringify(process.argv.slice(2)));process.exit(Number(process.env.${exitEnv}||0));\n`;
function delegateSandbox(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v161-deleg-"));
  for (const sub of ["runtime/dist/core", "runtime/dist/bin", "runtime/generated", "runtime/missions", "src/app"]) fs.mkdirSync(path.join(dir, sub), { recursive: true });
  for (const m of MODULES) { const s = path.join(REPO, "runtime", "dist", "core", m + ".js"); if (fs.existsSync(s)) fs.copyFileSync(s, path.join(dir, "runtime", "dist", "core", m + ".js")); }
  fs.writeFileSync(path.join(dir, "runtime", "dist", "core", "mission-loader.js"), LOADER_STUB);
  fs.writeFileSync(path.join(dir, "runtime", "dist", "bin", "odg-verify.js"), recStub(path.join(dir, "verify-argv.json"), "VERIFY_EXIT"));
  fs.writeFileSync(path.join(dir, "runtime", "dist", "bin", "odg-converge.js"), recStub(path.join(dir, "converge-argv.json"), "CONVERGE_EXIT"));
  fs.copyFileSync(path.join(REPO, "runtime", "dist", "bin", "odg-delegate.js"), path.join(dir, "runtime", "dist", "bin", "odg-delegate.js"));
  fs.writeFileSync(path.join(dir, "runtime", "missions", "M.json"), JSON.stringify({ mission: "M", mode: "IMPLEMENT", authorizedPaths: ["src/app/deliverable.ts"], objectives: [{ id: "m_1", goal: "deliver", done_when: ["ok"] }] }));
  const g = (a: string[]) => spawnSync("git", a, { cwd: dir, stdio: "ignore" });
  g(["init", "-q"]); g(["config", "user.email", "t@t.t"]); g(["config", "user.name", "t"]);
  fs.writeFileSync(path.join(dir, ".gitignore"), "runtime/\nverify-argv.json\nconverge-argv.json\n");
  fs.writeFileSync(path.join(dir, "README.md"), "seed\n"); g(["add", "-A"]); g(["-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed"]);
  fs.writeFileSync(path.join(dir, "src", "app", "deliverable.ts"), "export const x = 1;\n");
  return dir;
}
function runDelegate(dir: string, convergeExit: number) {
  const env: NodeJS.ProcessEnv = { ...process.env, CONVERGE_EXIT: String(convergeExit), VERIFY_EXIT: "0" };
  delete env.ODG_TRUTH_LOCK_ENFORCE; delete env.ODG_DELEGATE_ISOLATION; delete env.ODG_RUNTIME;
  const r = spawnSync("node", ["runtime/dist/bin/odg-delegate.js", "M"], { cwd: dir, encoding: "utf8", env });
  const read = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
  return { exit: r.status ?? -1, out: (r.stdout || "") + (r.stderr || ""), verifyArgv: read("verify-argv.json") as string[] | null, convergeArgv: read("converge-argv.json") as string[] | null };
}
{
  const dir = delegateSandbox(); const r = runDelegate(dir, 0);
  const vPaths = (r.verifyArgv || []).filter((a) => a.startsWith("--delegated-path="));
  const cPaths = (r.convergeArgv || []).filter((a) => a.startsWith("--delegated-path="));
  check(!!r.convergeArgv && r.convergeArgv[0] === "--mission=M", "E1. delegate invokes converge with --mission=<its mission>");
  check(JSON.stringify(cPaths) === JSON.stringify(["--delegated-path=src/app/deliverable.ts"]) && JSON.stringify(cPaths) === JSON.stringify(vPaths),
    "E2. converge receives EXACTLY the proven --delegated-path set verify received (same observation)");
  check(r.exit === 0 && /ODG DELEGATE — done/.test(r.out), "E3. converge exit 0 ⇒ delegate completes (archive step reached)");
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = delegateSandbox(); const r = runDelegate(dir, 3);
  check(r.exit === 0 && /PROVEN, AWAITING HUMAN COMMIT/.test(r.out) && !/ODG DELEGATE — done/.test(r.out) && !/Lifecycle:/.test(r.out),
    "E3b. converge exit 3 (pending commit) ⇒ delegate stops honestly (exit 0), markArchived NEVER called");
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = delegateSandbox(); const r = runDelegate(dir, 2);
  check(r.exit !== 0 && /STOP: converge did not reach convergence/.test(r.out) && !/ODG DELEGATE — done/.test(r.out) && !/Lifecycle:/.test(r.out),
    "E4. converge exit 2 ⇒ delegate STOPs non-zero, archive (markArchived) never runs");
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  const dir = delegateSandbox(); fs.writeFileSync(path.join(dir, "stray.txt"), "x\n"); const r = runDelegate(dir, 0);
  check(r.exit === 2 && /OUT OF SCOPE/.test(r.out) && r.verifyArgv === null && r.convergeArgv === null, "E5. out-of-scope file ⇒ STOP at conformance; verify/converge never spawned");
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  // odg-converge launcher forwards argv verbatim to tsx(converge-cli.ts); no argument ⇒ [entry] only (unchanged).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v161-convbin-"));
  fs.mkdirSync(path.join(dir, "node_modules", ".bin"), { recursive: true });
  const tsxStub = path.join(dir, "node_modules", ".bin", "tsx");
  fs.writeFileSync(tsxStub, `#!/usr/bin/env node\nrequire("fs").writeFileSync(${JSON.stringify(path.join(dir, "tsx-argv.json"))},JSON.stringify(process.argv.slice(2)));process.exit(3);\n`);
  fs.chmodSync(tsxStub, 0o755);
  const bin = path.join(REPO, "runtime", "dist", "bin", "odg-converge.js");
  const entry = path.join(dir, "src", "runtime", "converge-cli.ts");
  const a = spawnSync("node", [bin], { cwd: dir }); const argvA = JSON.parse(fs.readFileSync(path.join(dir, "tsx-argv.json"), "utf8"));
  check(a.status === 3 && JSON.stringify(argvA) === JSON.stringify([entry]), "E6. odg-converge with no argument ⇒ tsx [entry] only (unchanged), exit code forwarded");
  const b = spawnSync("node", [bin, "--mission=M", "--delegated-path=docs/a.md"], { cwd: dir }); const argvB = JSON.parse(fs.readFileSync(path.join(dir, "tsx-argv.json"), "utf8"));
  check(b.status === 3 && JSON.stringify(argvB) === JSON.stringify([entry, "--mission=M", "--delegated-path=docs/a.md"]), "E7. odg-converge forwards the scope argv verbatim");
  fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------- F. Mission Ledger refuses a delegated (uncommitted) patch
console.log("F. Mission Ledger — no proven entry while the delegated patch is uncommitted");
function ledgerSandbox(verifyMode: string | null): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v161-ledger-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  // read-only COPIES of the constitution/policies/state-machine the real ledger loads (the repo is never written)
  for (const sub of ["constitution", "policies", "governance"]) {
    const src = path.join(REPO, "runtime", sub);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(dir, "runtime", sub), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, "runtime", "generated", "mission-report.json"), JSON.stringify({ mission: "LM", validated: true, status: "SUCCESS" }));
  const verify: Record<string, unknown> = { build: true, typescript: true, gitClean: false, mission: "LM" };
  if (verifyMode) verify.gitCleanScope = { mode: verifyMode, provenInScope: ["docs/a.md"], residualDirty: [] };
  fs.writeFileSync(path.join(dir, "runtime", "generated", "runtime-verify.json"), JSON.stringify(verify));
  return dir;
}
function ledgerRun(dir: string, marker: boolean) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (marker) env.ODG_DELEGATED_PATCH_PENDING_COMMIT = "1"; else delete env.ODG_DELEGATED_PATCH_PENDING_COMMIT;
  const r = spawnSync("node", [path.join(REPO, "runtime", "dist", "core", "mission-ledger.js"), "LM"], { cwd: dir, encoding: "utf8", env });
  const out = (r.stdout || "") + (r.stderr || "");
  let entries: { mission?: string }[] = [];
  try { entries = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "mission-ledger.json"), "utf8")).entries || []; } catch { entries = []; }
  return { out, entries };
}
{
  const d = ledgerSandbox(null); const r = ledgerRun(d, true);
  check(/DELEGATED_PATCH|delegated patch is UNCOMMITTED/.test(r.out) && !r.entries.some((e) => e.mission === "LM"), "F1. marker set ⇒ ledger REFUSES (no entry written) despite a validated report");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // #923 re-inspection: a STALE DELEGATED_PATCH runtime-verify.json (left by a delegate run awaiting commit) must NOT
  // block a later NORMAL mission's ledger stage.
  const d = ledgerSandbox("DELEGATED_PATCH"); const r = ledgerRun(d, false);
  check(!/delegated patch is UNCOMMITTED/.test(r.out) && r.entries.some((e) => e.mission === "LM"), "F2. stale DELEGATED_PATCH verify file + NORMAL ledger stage (no marker) ⇒ RECORDED");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = ledgerSandbox("DELEGATED_PATCH"); const r = ledgerRun(d, true);
  check(/delegated patch is UNCOMMITTED/.test(r.out) && !r.entries.some((e) => e.mission === "LM"), "F3. env marker still refuses (no entry), whatever the verify file says");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = ledgerSandbox(null); const r = ledgerRun(d, false);
  check(!/delegated patch is UNCOMMITTED/.test(r.out) && r.entries.some((e) => e.mission === "LM"), "F4. no marker + default verify evidence ⇒ recorded (unchanged)");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // Build/TS Evidence stage rewrites runtime-verify.json as {...prior, …}: it must DROP the delegated markers.
  for (const engineering of [true, false]) {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "v161-bts-"));
    fs.mkdirSync(path.join(d, "runtime", "generated"), { recursive: true });
    const plan: Record<string, unknown> = { mission: "NM", objectives: [{ id: "o", goal: "g", done_when: ["d"] }] };
    if (engineering) { plan.authorizedPaths = ["src/x.ts"]; plan.requiresEngineering = true; } else { plan.mode = "AUDIT"; }
    fs.writeFileSync(path.join(d, "runtime", "generated", "mission-plan.json"), JSON.stringify(plan));
    fs.writeFileSync(path.join(d, "runtime", "generated", "runtime-verify.json"), JSON.stringify({ gitClean: false, delegatedPatchClean: true, gitCleanScope: { mode: "DELEGATED_PATCH", provenInScope: ["docs/a.md"], residualDirty: [] }, keep: "prior-field" }));
    const prev = process.cwd(); process.chdir(d);
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bts = require(path.join(REPO, "runtime", "dist", "core", "stage-build-ts-evidence.js"));
      bts.runBuildTsEvidence({ buildFn: () => true, tscFn: () => true });
    } finally { process.chdir(prev); }
    const v = JSON.parse(fs.readFileSync(path.join(d, "runtime", "generated", "runtime-verify.json"), "utf8"));
    check(!("gitCleanScope" in v) && !("delegatedPatchClean" in v) && v.keep === "prior-field" && v.mission === "NM",
      `F5. Build/TS Evidence (${engineering ? "engineering" : "read-only"}) drops gitCleanScope/delegatedPatchClean, keeps other prior fields`);
    fs.rmSync(d, { recursive: true, force: true });
  }
}

console.log(failures === 0 ? "\nALL PASS — V16.1 mission-scoped delegate converge" : `\nFAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
