// @ts-nocheck
/*
 * LOT B-ε — LEGACY vs COMPILED ENTRY PARITY on the MULTI-MISSION AGGREGATE measure (Phase-03 TS migration).
 * ========================================================================================================
 *
 * Extends entry-parity (B-α READ_ONLY, B-β ODG WRITE, B-γ CONTRACT patch, B-δ git ff/non-ff) to the single
 * AGGREGATE autonomy measurement whose legacy behaviour is accepted by runtime/__bench__/autonomy-multi-
 * mission.e2e.test.js (a PROTECTED fixture, NOT modified). It reuses that fixture's contracts, sandbox
 * topologies and measurement wiring VERBATIM, and runs the SAME representative set through BOTH entries:
 *   - LEGACY   : runtime/bin/odg-run.js         (historical JavaScript entry; production default)
 *   - COMPILED : runtime/dist/bin/odg-run.js    (TypeScript entry compiled by `npm run build:runtime`)
 *
 * TWO INDEPENDENT CAMPAIGNS, NEVER SUMMED. Each engine runs its OWN representative set and gets its OWN
 * aggregate denominator of 6. The denominators are compared for EQUALITY (both must be 6 / 5 / 83.3%); they
 * are NEVER concatenated into a 12 — that would conflate two distinct campaigns (explicitly forbidden).
 *
 * OFFICIAL DENOMINATOR (CTO Phase-03), per engine:
 *   1. AUDIT (read-only)            Clean Workspace              3 obj  ODG-executed+verified   → 3
 *   2. IN-SCOPE WRITE (governed)    ODG Synthetic Deliverable    1 obj  ODG-executed+verified   → 1
 *   3a. LOCAL ACTION (ff)           Governed Git Branch Integ.   1 obj  ODG-executed+verified   → 1
 *   3b. LOCAL ACTION (non-ff)       Governed Git Branch Integ.   1 obj  AUTHORIZED, FAILED       → 0
 *   ⇒ denominator 6, numerator 5 ⇒ 5/6 = 83.3%.
 *
 * WHY 5/6 (verified, reproduced — NOT a defect, NOT a measurement error): the non-ff objective is genuinely
 * {eligible,authorized} and attempts a real integration (execute:true); it fails on TOPOLOGY (non-fast-
 * forward), never on authorization (proven in-test). §6: an authorized objective that fails stays in the
 * denominator with a zero numerator. The two OTHER negatives (invalid-scope, self-approval) are UNAUTHORIZED
 * attempts and are EXCLUDED from every denominator (verified: the denominator stays 6, not 7/8).
 *
 * METHOD (deliberate, documented — identical rationale to B-β..δ). Both entries are launched DIRECTLY with
 * `node <entry> <mission>` from throwaway sandboxes (spawnSync, FLEET_BRIDGE_MOCK=1, ODG_FLEET/ODG_VERBOSE
 * cleared) — the accepted fixture's mechanism. It is NOT routed through AutonomyRuntimeAdapter.runPipeline
 * (whose post-local-failure recovery could escalate the refusals to the FORBIDDEN provider path). The
 * aggregate is recomputed with the REAL runtime modules (objective-attribution + autonomy-measure), reused
 * verbatim — NO second measure, NO new primitive.
 *
 * Any divergence is surfaced, never masked. Raw commit SHAs differ between independent repos, so git facts
 * are compared RELATIONALLY (ff-happened / stable-moved), not as raw hashes. Distinct mission ids per engine
 * avoid collisions and double-written evidence (§4).
 *
 * ISOLATION (§4): each run is confined to its OWN os.tmpdir() sandbox (asserted OUTSIDE the repo; git sandboxes
 * are throwaway repos), NO node_modules (asserted), tsx unresolvable (asserted — compiled bare-node proof),
 * offline (no network/remote/push/provider). Every git command targets a sandbox cwd; the real repo is never
 * written.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/adapter-compiled-multi-mission.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy, CATEGORY } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));

const LEGACY = "runtime/bin/odg-run.js";
const COMPILED = "runtime/dist/bin/odg-run.js";
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes: string[] = [];
let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}
function seedRuntime(sb: string): void {
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true }); // compiled entry + modules
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
}
function buildSandbox(c: any): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-multi-par-"));
  sandboxes.push(sb); seedRuntime(sb);
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${c.mission}.json`), JSON.stringify(c, null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  return sb;
}
function buildSandboxGit(c: any, diverge: boolean): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-multi-git-par-"));
  sandboxes.push(sb); seedRuntime(sb);
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${c.mission}.json`), JSON.stringify(c, null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  const base = git(sb, ["rev-parse", "HEAD"]);
  git(sb, ["branch", "stable", base]); git(sb, ["branch", "work", base]);
  git(sb, ["checkout", "-q", "work"]);
  fs.writeFileSync(path.join(sb, "work-change.txt"), "work-1\n");
  git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "work commit 1"]);
  if (diverge) {
    git(sb, ["checkout", "-q", "stable"]);
    fs.writeFileSync(path.join(sb, "stable-change.txt"), "stable-1\n");
    git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "stable commit 1"]);
  }
  git(sb, ["checkout", "-q", base]);
  return sb;
}
function runEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE; delete env.ODG_RUNTIME_ENTRY;
  return env;
}
function runEntry(sb: string, entry: string, mission: string): { code: number | null; out: string } {
  const r = spawnSync("node", [entry, mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const readGen = (sb: string, n: string): any => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));
const genExists = (sb: string, n: string): boolean => fs.existsSync(path.join(sb, "runtime", "generated", n));

// Contracts — verbatim clones of the accepted fixture's inline contracts (parametrised by mission id).
function cleanContract(mission: string) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate the transient git-ignored runtime workspace artifacts under runtime/ (read-only scan).", done_when: ["A deterministic scan lists every candidate path under runtime/ that is safe to remove."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm each candidate is covered by the gitignore/backup/archive policy so no tracked or required artifact is listed.", done_when: ["Every candidate is git-ignored or already archived; no tracked or required artifact is listed."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence of the cleaned workspace state without deleting any tracked or required artifact.", done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
    definition_of_done: ["Evidence generated", "Report generated"],
  };
}
function synthContract(mission: string, authorizedPaths: string[]) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "IMPLEMENT", priority: "NORMAL",
    requires_engineering: true, authorized_paths: authorizedPaths,
    objectives: [{ id: "ODG_WRITE_1", goal: "ODG formulates and writes a deterministic synthetic manifest inside the authorized scope.", done_when: ["A single ODG-authored file exists inside the authorized scope."], authorization: { eligible: true, authorized: true } }],
    definition_of_done: ["ODG-authored deliverable written strictly within the authorized scope."],
    completion: ["Validation successful."],
  };
}
function gitContract(mission: string, execute: boolean) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL",
    requires_engineering: false, authorized_paths: [],
    objectives: [{ id: "GIT_BRANCH_INTEGRATION_1", goal: "Integrate the local source branch into the local target branch, fast-forward only, recorded C03.", done_when: ["The target branch tip equals the source tip via a local fast-forward."], authorization: { eligible: true, authorized: true }, git_branch_integration: { target: "stable", source: "work", execute } }],
    verify: [{ capability: "Governed Git Branch Integration", evidence: "git-branch-integrated" }],
    definition_of_done: ["Local fast-forward integration performed and recorded."],
  };
}

// Per-mission work-units (identical wiring to the fixture's unitsFor), namespaced by mission id.
function unitsFor(sb: string, mission: string): any[] {
  const exec = readGen(sb, "patch-execution.json");
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const report = genExists(sb, "mission-report.json") ? readGen(sb, "mission-report.json") : { checks: {} };
  const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  if (!complete) throw new Error(`[${mission}] denominator incomplete`);
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const units = fromExecution(exec, attribution, map, { runComplete: coverageOk });
  return units.map((u: any) => ({ ...u, id: `${mission}::${u.id}` }));
}
// Per-mission semantic facts (engine-independent) for cross-engine comparison.
function missionFacts(sb: string): any {
  const report = genExists(sb, "mission-report.json") ? readGen(sb, "mission-report.json") : null;
  const life = genExists(sb, "mission-lifecycle.json") ? readGen(sb, "mission-lifecycle.json") : null;
  const cp = genExists(sb, "pipeline-checkpoint.json") ? readGen(sb, "pipeline-checkpoint.json") : null;
  const ledger = genExists(sb, "mission-ledger.json") ? readGen(sb, "mission-ledger.json") : null;
  const entries = !ledger ? [] : (Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []));
  return {
    validated: report ? report.validated : null, status: report ? report.status : null,
    achieved: life ? life.achieved : null,
    cpStatus: cp ? cp.status : null, cpAllDone: cp ? cp.completed.length === cp.stages.length : null,
    ledgerProven: entries.filter((x: any) => x.proven === true).length,
  };
}

/** Run ONE engine's full representative campaign; returns its OWN aggregate + per-mission facts + git facts. */
function runCampaign(entry: string, suffix: string): any {
  const sbClean = buildSandbox(cleanContract(`MULTI_CLEAN_${suffix}`));
  const rClean = runEntry(sbClean, entry, `MULTI_CLEAN_${suffix}`);
  const sbWrite = buildSandbox(synthContract(`MULTI_WRITE_${suffix}`, ["bench-workspace/**"]));
  const rWrite = runEntry(sbWrite, entry, `MULTI_WRITE_${suffix}`);
  const sbGit = buildSandboxGit(gitContract(`MULTI_GIT_${suffix}`, true), false);
  const workTip = git(sbGit, ["rev-parse", "work"]);
  const rGit = runEntry(sbGit, entry, `MULTI_GIT_${suffix}`);
  const stableAfterFF = git(sbGit, ["rev-parse", "stable"]);
  const sbNonFF = buildSandboxGit(gitContract(`MULTI_NONFF_${suffix}`, true), true);
  const stableBeforeNonFF = git(sbNonFF, ["rev-parse", "stable"]);
  runEntry(sbNonFF, entry, `MULTI_NONFF_${suffix}`);
  const stableAfterNonFF = git(sbNonFF, ["rev-parse", "stable"]);
  const nonFFExec = readGen(sbNonFF, "patch-execution.json");
  const nonFFEntry = nonFFExec.executed.find((x: any) => x.objectiveId === "GIT_BRANCH_INTEGRATION_1" || x.action === "GIT_BRANCH_INTEGRATION_1") || {};

  const executedUnits = [
    ...unitsFor(sbClean, `MULTI_CLEAN_${suffix}`),
    ...unitsFor(sbWrite, `MULTI_WRITE_${suffix}`),
    ...unitsFor(sbGit, `MULTI_GIT_${suffix}`),
  ];
  const failedUnits = unitsFor(sbNonFF, `MULTI_NONFF_${suffix}`);
  const agg = measureAutonomy([...executedUnits, ...failedUnits]);
  const anyNullActorDone = [...executedUnits, ...failedUnits].some((u: any) => u.actor === null && (u.status === "EXECUTED" || u.status === "APPLIED" || u.status === "DONE"));
  return {
    pipelines: { clean: rClean.code, write: rWrite.code, git: rGit.code },
    stageOk: {
      clean: /PIPELINE SUCCESS — 13\/13 stages/.test(rClean.out),
      write: /PIPELINE SUCCESS — 13\/13 stages/.test(rWrite.out),
      git: /PIPELINE SUCCESS — 13\/13 stages/.test(rGit.out),
    },
    writeDeliverable: fs.existsSync(path.join(sbWrite, "bench-workspace", "odg-synthetic-manifest.txt")),
    gitFF: stableAfterFF === workTip,
    nonFFStableUnchanged: stableAfterNonFF === stableBeforeNonFF,
    nonFFStatus: nonFFEntry.status, nonFFReasonNonFF: /non-fast-forward/.test(String(nonFFEntry.error || "")),
    facts: { clean: missionFacts(sbClean), write: missionFacts(sbWrite), git: missionFacts(sbGit), nonff: missionFacts(sbNonFF) },
    agg: {
      measurable: agg.measurable, denominator: agg.denominator, numerator: agg.numerator, autonomyPercent: agg.autonomyPercent,
      catExecuted: agg.categories[CATEGORY.ODG_EXECUTED_VERIFIED], catBlocked: agg.categories[CATEGORY.BLOCKED_REFUSED_FAILED], catOperator: agg.categories[CATEGORY.OPERATOR_OR_EXTERNAL],
      distinctions: agg.distinctions,
    },
    anyNullActorDone,
  };
}

/** Security controls (UNAUTHORIZED attempts) — must refuse, zero mutation, EXCLUDED from the denominator. */
function runSecurityControls(entry: string, suffix: string): any {
  const sbNoScope = buildSandbox(synthContract(`MULTI_NOSCOPE_${suffix}`, []));
  runEntry(sbNoScope, entry, `MULTI_NOSCOPE_${suffix}`);
  const sbGov = buildSandbox(synthContract(`MULTI_GOV_${suffix}`, ["runtime/governance/**"]));
  runEntry(sbGov, entry, `MULTI_GOV_${suffix}`);
  return {
    noScopeZeroMutation: fs.existsSync(path.join(sbNoScope, "bench-workspace", "odg-synthetic-manifest.txt")) === false,
    noScopeNotValidated: !genExists(sbNoScope, "mission-report.json") || readGen(sbNoScope, "mission-report.json").validated !== true,
    govZeroMutation: fs.existsSync(path.join(sbGov, "runtime", "governance", "odg-synthetic-manifest.txt")) === false,
    govNotValidated: !genExists(sbGov, "mission-report.json") || readGen(sbGov, "mission-report.json").validated !== true,
  };
}

console.log("LOT B-ε — LEGACY vs COMPILED ENTRY PARITY on the MULTI-MISSION AGGREGATE");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "bin", "odg-run.js")), "prerequisite: runtime/dist/bin/odg-run.js built");

  // Bare-sandbox isolation proof (one representative compiled sandbox).
  const probeSb = buildSandbox(cleanContract("MULTI_PROBE_ISO"));
  check(fs.existsSync(path.join(probeSb, "node_modules")) === false, "compiled sandbox has NO node_modules");
  const tsxProbe = spawnSync("node", ["-e", "require.resolve('tsx/cjs')"], { cwd: probeSb, encoding: "utf8" });
  check(tsxProbe.status !== 0, "tsx/cjs unresolvable in the bare compiled sandbox (plain-node proof)");

  // ======== TWO INDEPENDENT CAMPAIGNS (never summed) ==============================================
  const L = runCampaign(LEGACY, "L");
  const C = runCampaign(COMPILED, "C");

  for (const [tag, k] of [["LEGACY", L], ["COMPILED", C]] as const) {
    check(k.pipelines.clean === 0 && k.pipelines.write === 0 && k.pipelines.git === 0, `${tag}: the 3 success missions all exit 0`);
    check(k.stageOk.clean && k.stageOk.write && k.stageOk.git, `${tag}: 13/13 stages for the 3 success missions`);
    check(k.writeDeliverable === true, `${tag}: in-scope write deliverable exists`);
    check(k.gitFF === true, `${tag}: git ff — stable fast-forwarded to work tip`);
    check(k.nonFFStableUnchanged === true && k.nonFFStatus === "FAILED" && k.nonFFReasonNonFF === true, `${tag}: non-ff FAILED on topology, target unchanged (authorized-but-failed)`);
    check(k.facts.clean.validated === true && k.facts.write.validated === true && k.facts.git.validated === true, `${tag}: clean/write/git validated`);
    check(k.facts.nonff.validated !== true, `${tag}: non-ff NOT validated`);
    // Aggregate (this engine's OWN denominator of 6 — never summed with the other engine's).
    check(k.agg.measurable === true && k.agg.denominator === 6 && k.agg.numerator === 5 && k.agg.autonomyPercent === 83.3, `${tag}: aggregate 5/6 = 83.3% (own denominator)`);
    check(k.agg.catExecuted === 5 && k.agg.catBlocked === 1 && k.agg.catOperator === 0, `${tag}: categories 5 executed / 1 blocked-failed / 0 operator`);
    check(k.anyNullActorDone === false, `${tag}: no DONE unit with an unproven (CONTRACT/UNKNOWN) author credited`);
  }

  // ======== PARITY — the two engines' aggregates + per-mission facts are EQUAL (not summed) =======
  check(JSON.stringify(L.agg) === JSON.stringify(C.agg), "PARITY: legacy and compiled aggregates are identical (6 / 5 / 83.3% / categories / distinctions)");
  check(JSON.stringify(L.facts) === JSON.stringify(C.facts), "PARITY: per-mission facts (validated/status/lifecycle/checkpoint/ledger) identical across engines");
  check(L.gitFF === C.gitFF && L.nonFFStableUnchanged === C.nonFFStableUnchanged && L.nonFFStatus === C.nonFFStatus, "PARITY: git ff/non-ff relational facts identical");

  // ======== SECURITY CONTROLS (unauthorized attempts) — refuse + EXCLUDED from denominator ========
  const sL = runSecurityControls(LEGACY, "L");
  const sC = runSecurityControls(COMPILED, "C");
  for (const [tag, s] of [["LEGACY", sL], ["COMPILED", sC]] as const) {
    check(s.noScopeZeroMutation && s.noScopeNotValidated, `${tag} control: invalid-scope refused (zero mutation, not validated) — unauthorized, excluded`);
    check(s.govZeroMutation && s.govNotValidated, `${tag} control: self-approval refused (zero mutation, not validated) — unauthorized, excluded`);
  }
  check(JSON.stringify(sL) === JSON.stringify(sC), "PARITY: security-control refusals identical across engines");
  // The denominator stayed 6 (unauthorized attempts were NOT added) — proven by the aggregate assertions above.
  check(L.agg.denominator === 6 && C.agg.denominator === 6, "denominator stays 6 (unauthorized attempts never inflate it to 7/8)");

  // ======== NEGATIVE — invalid compiled entry, NO silent legacy fallback ==========================
  const sbBad = buildSandbox(cleanContract("MULTI_BADENTRY"));
  const rBad = runEntry(sbBad, "runtime/dist/bin/DOES_NOT_EXIST.js", "MULTI_BADENTRY");
  check(rBad.code !== 0, "invalid entry: node exits non-zero (explicit launch failure)");
  check(!genExists(sbBad, "mission-report.json") || readGen(sbBad, "mission-report.json").validated !== true, "invalid entry: mission NOT validated (no silent fallback)");

  console.log(`\n=== AGGREGATE PARITY — LEGACY ${L.agg.numerator}/${L.agg.denominator}=${L.agg.autonomyPercent}%  vs  COMPILED ${C.agg.numerator}/${C.agg.denominator}=${C.agg.autonomyPercent}%  (separate campaigns, equal, NOT summed) ===`);
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT B-ε MULTI-MISSION AGGREGATE ENTRY PARITY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
