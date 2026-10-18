// @ts-nocheck
/*
 * LOT B-γ — LEGACY vs COMPILED ENTRY PARITY on a CONTRACT-PATCH mission + SELF-APPROVAL REFUSAL (Phase-03).
 * ========================================================================================================
 *
 * Extends the entry-parity proof (B-α READ_ONLY, B-β ODG-authored WRITE) to the CONTRACT-supplied patch
 * dimension whose legacy-path behaviour is already accepted by runtime/__bench__/autonomy-write-mission.
 * e2e.test.js (a PROTECTED fixture, NOT modified). It reuses that fixture's two contracts VERBATIM and the
 * SAME offline mechanism, and compares the two pipeline ENTRIES:
 *   - LEGACY   : runtime/bin/odg-run.js         (historical JavaScript entry; production default)
 *   - COMPILED : runtime/dist/bin/odg-run.js    (TypeScript entry compiled by `npm run build:runtime`)
 *
 * METHOD (deliberate, documented — identical rationale to the B-β sibling). Both entries are launched
 * DIRECTLY with `node <entry> <mission>` from a throwaway sandbox (spawnSync, FLEET_BRIDGE_MOCK=1, ODG_FLEET
 * cleared) — exactly the accepted fixture's mechanism. It is NOT routed through AutonomyRuntimeAdapter.
 * runPipeline: on a governed REFUSAL (the self-approval negative) the adapter's post-local-failure recovery
 * could escalate to the engineering PROVIDER path, which this mission FORBIDS. The adapter's honouring of the
 * ODG_RUNTIME_ENTRY seam is proven separately (B-α); here the two ENTRY BINARIES are compared on the SAME
 * 13 JS stages.
 *
 * WHAT IT PROVES (semantic parity — §3, NOT just exit codes):
 *   POSITIVE (CONTRACT patch) : both entries ⇒ 13/13; the in-contract patch APPLIED to the exact in-scope
 *     path with identical bytes ("BENCH-WRITE-OK\n"); authoredBy CONTRACT / appliedBy ODG_EXECUTOR;
 *     validated SUCCESS; lifecycle VERIFIED; the plan carries the per-objective authorization + scope; the
 *     final report honestly shows **NON_MEASURABLE** and NEVER a proven 1/1 (a CONTRACT origin is not ODG-
 *     autonomous); an independent recompute agrees (measurable:false, autonomyPercent:null) — and the two
 *     snapshots are EQUAL.
 *   NEGATIVE (self-approval)  : both entries ⇒ a patch in-scope ("runtime/**") targeting a protected
 *     governance artifact is refused by the real Patch Executor guard BEFORE any write — status BLOCKED,
 *     decision ESCALATE, the refusal names the protected-governance boundary and "self-authorize"; zero
 *     mutation; not a validated SUCCESS — and the two refusal records are EQUAL.
 *   NEGATIVE (invalid entry)  : a missing compiled entry fails EXPLICITLY (non-zero node), writes NOTHING
 *     and does not validate — no silent fallback to the legacy entry.
 *
 * Any divergence is surfaced, never masked (there is NO normalisation here: the patch content and the
 * refusal text are mission-independent, so the comparison is byte/field-verbatim). Distinct mission ids per
 * scenario/engine avoid collisions and double-written evidence (§3).
 *
 * ISOLATION (§3): every run is confined to its own os.tmpdir() sandbox (asserted OUTSIDE the repo), a fresh
 * git repo with a baseline commit, NO node_modules (asserted), tsx unresolvable (asserted for the compiled
 * bare-node proof), offline (no network; Fleet Bridge mocked/off). The real repository is never written.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/adapter-compiled-contract-patch.e2e.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync, spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy } =
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
function sh(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { cwd: cwd || REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

/** The accepted write-mission contracts (autonomy-write-mission.e2e.test.ts), parametrised ONLY by mission id. */
function positiveContract(mission: string) {
  return {
    mission, priority: "NORMAL", mode: "IMPLEMENT", requiresEngineering: true,
    authorizedPaths: ["bench-workspace/**"],
    objectives: [{
      id: "BENCH_WRITE_1",
      goal: "Create a single marker file recording deterministic benchmark execution.",
      done_when: ["Exactly one file exists under bench-workspace/."],
      patch: [{ target: "bench-workspace/marker.txt", content: "BENCH-WRITE-OK\n" }],
      authorization: { eligible: true, authorized: true },
    }],
    definition_of_done: ["Objective completed strictly within the authorized write scope."],
    completion: ["Validation successful."],
  };
}
function selfApprovalContract(mission: string) {
  return {
    mission, priority: "NORMAL", mode: "IMPLEMENT", requiresEngineering: true,
    authorizedPaths: ["runtime/**"], // scope DELIBERATELY includes governance so scope is NOT the blocker
    objectives: [{
      id: "BENCH_SELF_APPROVE",
      goal: "Attempt to write a governance artifact while in scope but WITHOUT governance authority (must be refused).",
      done_when: ["(negative) the governance write is refused by the Patch Executor self-approval guard."],
      patch: [{ target: "runtime/governance/injected.json", content: "{\"injected\":true}\n" }],
      authorization: { eligible: true, authorized: true },
    }],
    definition_of_done: ["Self-approval refused; mission not validated."],
    completion: ["Validation blocked."],
  };
}

function buildSandbox(contract: any): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-cpat-par-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  // The compiled entry + its 3 compiled orchestration modules (harmless for the legacy entry, which ignores them).
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "add", "-A"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-q", "-m", "baseline"], sb);
  return sb;
}

function runEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET;
  delete env.ODG_VERBOSE;
  delete env.ODG_RUNTIME_ENTRY; // this harness picks the entry explicitly; no implicit seam override
  return env;
}
function runEntry(sb: string, entry: string, mission: string): { code: number | null; out: string } {
  const r = spawnSync("node", [entry, mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const readGen = (sb: string, n: string): any => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));
const genExists = (sb: string, n: string): boolean => fs.existsSync(path.join(sb, "runtime", "generated", n));

/** Semantic snapshot of the COMPLETED positive CONTRACT-patch run (ids/timestamps allowed to differ). */
function positiveSnapshot(sb: string, mission: string): any {
  const report = readGen(sb, "mission-report.json");
  const life = readGen(sb, "mission-lifecycle.json");
  const exec = readGen(sb, "patch-execution.json");
  const cp = readGen(sb, "pipeline-checkpoint.json");
  const ledger = readGen(sb, "mission-ledger.json");
  const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const e = exec.executed[0] || {};
  const md = fs.readFileSync(path.join(sb, "runtime", "generated", "reports", `${mission}.final-report.md`), "utf8");
  const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
  return {
    validated: report.validated, status: report.status,
    engineeringPerformed: report.checks && report.checks.engineeringPerformed,
    scoped: Array.isArray(report.checks && report.checks.scopedChanges) ? report.checks.scopedChanges.slice().sort() : [],
    achieved: life.achieved,
    exec0: { status: e.status, authoredBy: e.authoredBy, appliedBy: e.appliedBy, objectiveId: e.objectiveId, target: e.files && e.files[0] && e.files[0].target },
    planAuth: plan.objectives && plan.objectives[0] && plan.objectives[0].authorization,
    planScope: plan.authorizedPaths,
    eligibilityComplete: complete,
    measurable: measured.measurable, autonomyPercent: measured.autonomyPercent,
    numerator: measured.numerator, denominator: measured.denominator,
    reportNonMeasurable: /Autonomy %: \*\*NON_MEASURABLE\*\*/.test(md),
    reportNotCreditedAsOne: !/ODG-executed\+verified 1\/1, denominator proven/.test(md),
    cpStatus: cp.status, cpAllDone: cp.completed.length === cp.stages.length,
    ledgerProven: entries.filter((x: any) => x.proven === true).length,
  };
}

/** Semantic snapshot of the self-approval REFUSAL (the on-disk refusal is the proof, not the exit code). */
function refusalSnapshot(sb: string): any {
  const exec = readGen(sb, "patch-execution.json");
  const entry = exec.executed.find((e: any) => e && e.target === "runtime/governance/injected.json") || exec.executed[0] || {};
  const report = genExists(sb, "mission-report.json") ? readGen(sb, "mission-report.json") : null;
  return {
    status: entry.status, decision: entry.decision,
    needsNamesBoundary: /protected governance path/.test(String(entry.needs || "")),
    needsNamesSelfAuthorize: /self-authorize/.test(String(entry.needs || "")),
    governanceFileCreated: fs.existsSync(path.join(sb, "runtime", "governance", "injected.json")),
    reportValidated: report ? report.validated : null,
    reportStatus: report ? report.status : null,
  };
}

console.log("LOT B-γ — LEGACY vs COMPILED ENTRY PARITY on a CONTRACT-PATCH mission + SELF-APPROVAL REFUSAL");
try {
  sh("npm", ["run", "build:runtime"]);
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "bin", "odg-run.js")), "prerequisite: runtime/dist/bin/odg-run.js built");

  // ======== POSITIVE — CONTRACT patch APPLIED, both entries =======================================
  const sbPL = buildSandbox(positiveContract("CPAT_PAR_POS_LEGACY"));
  const sbPC = buildSandbox(positiveContract("CPAT_PAR_POS_COMPILED"));
  check(fs.existsSync(path.join(sbPC, "node_modules")) === false, "compiled sandbox has NO node_modules");
  const tsxProbe = spawnSync("node", ["-e", "require.resolve('tsx/cjs')"], { cwd: sbPC, encoding: "utf8" });
  check(tsxProbe.status !== 0, "tsx/cjs unresolvable in the bare compiled sandbox (plain-node proof)");

  const rPL = runEntry(sbPL, LEGACY, "CPAT_PAR_POS_LEGACY");
  check(rPL.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(rPL.out), "LEGACY positive: exit 0, 13/13 stages");
  const rPC = runEntry(sbPC, COMPILED, "CPAT_PAR_POS_COMPILED");
  check(rPC.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(rPC.out), "COMPILED positive: exit 0, 13/13 stages");

  const snapL = positiveSnapshot(sbPL, "CPAT_PAR_POS_LEGACY");
  const snapC = positiveSnapshot(sbPC, "CPAT_PAR_POS_COMPILED");
  const markerL = fs.existsSync(path.join(sbPL, "bench-workspace", "marker.txt")) ? fs.readFileSync(path.join(sbPL, "bench-workspace", "marker.txt"), "utf8") : null;
  const markerC = fs.existsSync(path.join(sbPC, "bench-workspace", "marker.txt")) ? fs.readFileSync(path.join(sbPC, "bench-workspace", "marker.txt"), "utf8") : null;

  for (const [tag, s, marker] of [["LEGACY", snapL, markerL], ["COMPILED", snapC, markerC]] as const) {
    check(marker === "BENCH-WRITE-OK\n", `${tag}: in-scope patch APPLIED with exact bytes`);
    check(s.exec0.status === "APPLIED" && s.exec0.target === "bench-workspace/marker.txt", `${tag}: patch APPLIED to the in-scope target`);
    check(s.exec0.authoredBy === "CONTRACT" && s.exec0.appliedBy === "ODG_EXECUTOR", `${tag}: authoredBy CONTRACT / appliedBy ODG_EXECUTOR (applicator ≠ author)`);
    check(JSON.stringify(s.planAuth) === JSON.stringify({ eligible: true, authorized: true }) && JSON.stringify(s.planScope) === JSON.stringify(["bench-workspace/**"]), `${tag}: plan carries per-objective authorization + scope`);
    check(s.validated === true && s.status === "SUCCESS" && s.engineeringPerformed === true, `${tag}: validated SUCCESS, engineeringPerformed`);
    check(s.scoped.some((p: string) => p.startsWith("bench-workspace")), `${tag}: in-scope change observed`);
    check(s.achieved === "VERIFIED", `${tag}: lifecycle VERIFIED (RELEASED/ARCHIVED withheld)`);
    check(s.reportNonMeasurable === true && s.reportNotCreditedAsOne === true, `${tag}: report honestly NON_MEASURABLE, never credited as proven 1/1`);
    check(s.eligibilityComplete === true && s.measurable === false && s.autonomyPercent === null, `${tag}: independent recompute NON_MEASURABLE (CONTRACT origin not credited)`);
  }
  // ---- PARITY (semantic equivalence) --------------------------------------------------------------
  check(JSON.stringify(snapL) === JSON.stringify(snapC), "PARITY: legacy and compiled positive snapshots are semantically identical");
  check(markerL !== null && markerL === markerC, "PARITY: deliverable bytes identical (mission-independent content; no normalisation)");

  // ======== NEGATIVE — SELF-APPROVAL refusal, both entries ========================================
  const sbSL = buildSandbox(selfApprovalContract("CPAT_PAR_SELF_LEGACY"));
  const sbSC = buildSandbox(selfApprovalContract("CPAT_PAR_SELF_COMPILED"));
  runEntry(sbSL, LEGACY, "CPAT_PAR_SELF_LEGACY");
  runEntry(sbSC, COMPILED, "CPAT_PAR_SELF_COMPILED");
  const refL = refusalSnapshot(sbSL);
  const refC = refusalSnapshot(sbSC);
  for (const [tag, r] of [["LEGACY", refL], ["COMPILED", refC]] as const) {
    check(r.governanceFileCreated === false, `${tag} self-approval: ZERO mutation (governance file not created)`);
    check(r.status === "BLOCKED" && r.decision === "ESCALATE", `${tag} self-approval: BLOCKED + ESCALATE (resumable, not APPLIED)`);
    check(r.needsNamesBoundary === true && r.needsNamesSelfAuthorize === true, `${tag} self-approval: refusal names protected-governance boundary + cannot self-authorize`);
    check(r.reportValidated !== true && r.reportStatus !== "SUCCESS", `${tag} self-approval: NOT a validated SUCCESS`);
  }
  check(JSON.stringify(refL) === JSON.stringify(refC), "PARITY: legacy and compiled self-approval refusal records are identical");

  // ======== NEGATIVE — invalid compiled entry, NO silent legacy fallback ==========================
  const sbBad = buildSandbox(positiveContract("CPAT_PAR_BADENTRY"));
  const rBad = runEntry(sbBad, "runtime/dist/bin/DOES_NOT_EXIST.js", "CPAT_PAR_BADENTRY");
  check(rBad.code !== 0, "invalid entry: node exits non-zero (explicit launch failure)");
  check(fs.existsSync(path.join(sbBad, "bench-workspace", "marker.txt")) === false, "invalid entry: NO deliverable written (no silent fallback to legacy)");
  check(!genExists(sbBad, "mission-report.json") || readGen(sbBad, "mission-report.json").validated !== true, "invalid entry: mission NOT validated");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT B-γ CONTRACT-PATCH ENTRY PARITY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
