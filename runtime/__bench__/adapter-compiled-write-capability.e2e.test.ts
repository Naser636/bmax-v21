// @ts-nocheck
/*
 * LOT B-β — LEGACY vs COMPILED ENTRY PARITY on an IMPLEMENT / GOVERNED-WRITE mission (Phase-03 TS migration).
 * ==========================================================================================================
 *
 * Extends the READ_ONLY parity proof (runtime/__bench__/adapter-compiled-entry.e2e.test.ts, Lot B-α) to a
 * REPRESENTATIVE engineering mission: the ODG-formulated in-scope WRITE whose legacy-path behaviour is
 * already accepted by runtime/__bench__/autonomy-write-capability.e2e.test.js. It drives the SAME contract
 * and the SAME offline mechanism as that accepted fixture, and compares the two pipeline ENTRIES:
 *   - LEGACY   : runtime/bin/odg-run.js         (historical JavaScript entry; the production default)
 *   - COMPILED : runtime/dist/bin/odg-run.js    (TypeScript entry compiled by `npm run build:runtime`)
 *
 * METHOD (deliberate, documented). Both entries are launched DIRECTLY with `node <entry> <mission>` from a
 * throwaway sandbox — exactly the mechanism the accepted JS fixture uses (spawnSync, FLEET_BRIDGE_MOCK=1,
 * ODG_FLEET cleared). This is NOT routed through AutonomyRuntimeAdapter.runPipeline: on a governed WRITE
 * REFUSAL the adapter's post-local-failure recovery could escalate to the engineering PROVIDER path, which
 * this mission FORBIDS. The adapter's honouring of the ODG_RUNTIME_ENTRY seam is proven separately by the
 * B-α sibling; here we compare the two ENTRY BINARIES' end-to-end semantics on the SAME 13 JS stages.
 *
 * WHAT IT PROVES (semantic parity, per the mission's §4 — NOT just exit codes):
 *   POSITIVE : both entries ⇒ 13/13, validated SUCCESS, lifecycle VERIFIED (engineering caps at VERIFIED;
 *              RELEASED/ARCHIVED withheld), one ODG-authored in-scope deliverable with identical content
 *              (modulo the mission-id line, which §3 REQUIRES to differ), EXECUTED by "ODG Synthetic
 *              Deliverable" with authoredBy ODG_CAPABILITY / appliedBy ODG_EXECUTOR, non-empty evidence,
 *              independent recompute 1/1, no UNKNOWN/CONTRACT credited — and the two snapshots are EQUAL.
 *   NEGATIVE (empty scope)       : both entries ⇒ zero deliverable, not EXECUTED/APPLIED, not validated.
 *   NEGATIVE (governance scope)  : both entries ⇒ zero governance deliverable, not EXECUTED/APPLIED, not
 *              validated (scope is not authority; the shared guard refuses before any write).
 *   NEGATIVE (invalid entry)     : a missing compiled entry fails EXPLICITLY (non-zero `node`), writes NO
 *              deliverable and does NOT validate — no silent fallback to the legacy entry.
 *
 * Any divergence is surfaced and explained, never normalised away to force a pass (the only intentional
 * normalisation is the REQUIRED-distinct mission-id token in the deliverable; everything else is compared
 * verbatim). Distinct mission ids per scenario avoid collisions / double-written evidence (§3).
 *
 * ISOLATION (§3): every run is confined to its own os.tmpdir() sandbox (asserted OUTSIDE the repo), a fresh
 * git repo with a baseline commit, NO node_modules (asserted), tsx unresolvable (asserted for the compiled
 * bare-node proof), offline (no network; Fleet Bridge mocked/off). The real repository is never written.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/adapter-compiled-write-capability.e2e.test.ts
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

/** The accepted write-capability contract (runtime/__bench__/autonomy-write-capability.e2e.test.js), verbatim shape. */
function contract(mission: string, authorizedPaths: string[]) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "IMPLEMENT",
    priority: "NORMAL", requires_engineering: true, authorized_paths: authorizedPaths,
    objectives: [{
      id: "ODG_WRITE_1",
      goal: "ODG formulates and writes a deterministic synthetic manifest inside the authorized scope.",
      done_when: ["A single ODG-authored file exists inside the authorized scope."],
      authorization: { eligible: true, authorized: true },
    }],
    definition_of_done: ["ODG-authored deliverable written strictly within the authorized scope."],
    completion: ["Validation successful."],
  };
}

function buildSandbox(mission: string, authorizedPaths: string[]): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-wcap-par-"));
  sandboxes.push(sb);
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  // The compiled entry + its 3 compiled orchestration modules (harmless for the legacy entry, which ignores them).
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${mission}.json`), JSON.stringify(contract(mission, authorizedPaths), null, 2));
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

/** Semantic snapshot of a COMPLETED positive run (ids/timestamps/paths allowed to differ; content compared separately). */
function snapshot(sb: string, mission: string): any {
  const report = readGen(sb, "mission-report.json");
  const life = readGen(sb, "mission-lifecycle.json");
  const exec = readGen(sb, "patch-execution.json");
  const cp = readGen(sb, "pipeline-checkpoint.json");
  const ledger = readGen(sb, "mission-ledger.json");
  const entries = Array.isArray(ledger) ? ledger : (ledger.entries || ledger.missions || []);
  const e = exec.executed.find((x: any) => x.objectiveId === "ODG_WRITE_1") || {};
  const evAbs = typeof e.evidence === "string" ? path.join(sb, e.evidence) : "";
  const evidenceNonEmpty = !!evAbs && fs.existsSync(evAbs) && fs.statSync(evAbs).size > 0;
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const probe = (p: string) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
  return {
    validated: report.validated, status: report.status,
    engineeringPerformed: report.checks && report.checks.engineeringPerformed,
    scoped: Array.isArray(report.checks && report.checks.scopedChanges)
      ? report.checks.scopedChanges.slice().sort() : [],
    achieved: life.achieved,
    exec: { status: e.status, capability: e.capability, authoredBy: e.authoredBy, appliedBy: e.appliedBy, evidenceNonEmpty },
    anyUnknownOrContract: exec.executed.some((x: any) => x.authoredBy === "UNKNOWN" || x.authoredBy === "CONTRACT"),
    cpStatus: cp.status, cpAllDone: cp.completed.length === cp.stages.length,
    ledgerProven: entries.filter((x: any) => x.proven === true).length,
    eligibilityComplete: complete,
    measurable: measured.measurable, numerator: measured.numerator, denominator: measured.denominator,
    autonomyPercent: measured.autonomyPercent,
  };
}

/** Deliverable content with its (REQUIRED-distinct, §3) mission-id line masked — the only legitimate difference. */
function deliverableMasked(sb: string): string | null {
  const f = path.join(sb, "bench-workspace", "odg-synthetic-manifest.txt");
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, "utf8").replace(/^mission=.*$/m, "mission=<MASKED>");
}

console.log("LOT B-β — LEGACY vs COMPILED ENTRY PARITY on an IMPLEMENT / GOVERNED-WRITE mission");
try {
  // Precondition: build the compiled entry (writes gitignored runtime/dist in the real repo).
  sh("npm", ["run", "build:runtime"]);
  check(fs.existsSync(path.join(REPO, "runtime", "dist", "bin", "odg-run.js")), "prerequisite: runtime/dist/bin/odg-run.js built");

  // ======== POSITIVE — ODG-authored in-scope write, both entries ==================================
  const sbPL = buildSandbox("WCAP_PAR_POS_LEGACY", ["bench-workspace/**"]);
  const sbPC = buildSandbox("WCAP_PAR_POS_COMPILED", ["bench-workspace/**"]);
  // Isolation proofs (effective, not asserted-by-claim).
  check(fs.existsSync(path.join(sbPC, "node_modules")) === false, "compiled sandbox has NO node_modules");
  const tsxProbe = spawnSync("node", ["-e", "require.resolve('tsx/cjs')"], { cwd: sbPC, encoding: "utf8" });
  check(tsxProbe.status !== 0, "tsx/cjs unresolvable in the bare compiled sandbox (plain-node proof)");

  const rPL = runEntry(sbPL, LEGACY, "WCAP_PAR_POS_LEGACY");
  check(rPL.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(rPL.out), "LEGACY positive: exit 0, 13/13 stages");
  const rPC = runEntry(sbPC, COMPILED, "WCAP_PAR_POS_COMPILED");
  check(rPC.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(rPC.out), "COMPILED positive: exit 0, 13/13 stages");

  const snapL = snapshot(sbPL, "WCAP_PAR_POS_LEGACY");
  const snapC = snapshot(sbPC, "WCAP_PAR_POS_COMPILED");

  // Per-engine correctness (each entry independently satisfies the accepted invariants).
  for (const [tag, s] of [["LEGACY", snapL], ["COMPILED", snapC]] as const) {
    check(s.validated === true && s.status === "SUCCESS", `${tag}: validated SUCCESS`);
    check(s.engineeringPerformed === true, `${tag}: engineeringPerformed=true`);
    check(s.scoped.some((p: string) => p.startsWith("bench-workspace")), `${tag}: in-scope change observed`);
    check(s.achieved === "VERIFIED", `${tag}: lifecycle VERIFIED (RELEASED/ARCHIVED withheld)`);
    check(s.exec.status === "EXECUTED" && s.exec.capability === "ODG Synthetic Deliverable", `${tag}: ODG_WRITE_1 EXECUTED by ODG Synthetic Deliverable`);
    check(s.exec.authoredBy === "ODG_CAPABILITY" && s.exec.appliedBy === "ODG_EXECUTOR", `${tag}: authoredBy ODG_CAPABILITY / appliedBy ODG_EXECUTOR`);
    check(s.exec.evidenceNonEmpty === true, `${tag}: evidence present & non-empty`);
    check(s.anyUnknownOrContract === false, `${tag}: no UNKNOWN/CONTRACT origin credited`);
    check(s.eligibilityComplete === true && s.measurable === true && s.numerator === 1 && s.denominator === 1 && s.autonomyPercent === 100, `${tag}: independent recompute 1/1 = 100%`);
  }
  // Deliverable content (ODG-formulated).
  const delL = deliverableMasked(sbPL);
  const delC = deliverableMasked(sbPC);
  check(!!delL && /generator=ODG_CAPABILITY/.test(delL), "LEGACY: deliverable is ODG-formulated");
  check(!!delC && /generator=ODG_CAPABILITY/.test(delC), "COMPILED: deliverable is ODG-formulated");

  // ---- PARITY (semantic equivalence; the two snapshots must be EQUAL) -----------------------------
  check(JSON.stringify(snapL) === JSON.stringify(snapC), "PARITY: legacy and compiled positive snapshots are semantically identical");
  check(delL !== null && delL === delC, "PARITY: deliverable content identical (mission-id line masked — the only §3-required difference)");

  // ======== NEGATIVE (empty scope) — capability refuses before any write, both entries ============
  for (const [tag, entry, mission] of [["LEGACY", LEGACY, "WCAP_PAR_EMPTY_LEGACY"], ["COMPILED", COMPILED, "WCAP_PAR_EMPTY_COMPILED"]] as const) {
    const sb = buildSandbox(mission, []);
    runEntry(sb, entry, mission); // exit code is not the proof — the on-disk refusal is
    check(fs.existsSync(path.join(sb, "bench-workspace", "odg-synthetic-manifest.txt")) === false, `${tag} empty-scope: NO deliverable written`);
    if (genExists(sb, "patch-execution.json")) {
      const e = readGen(sb, "patch-execution.json").executed.find((x: any) => x.objectiveId === "ODG_WRITE_1");
      check(!e || (e.status !== "EXECUTED" && e.status !== "APPLIED"), `${tag} empty-scope: refused write is NOT EXECUTED/APPLIED`);
    } else check(true, `${tag} empty-scope: no execution record (refused pre-write)`);
    check(!genExists(sb, "mission-report.json") || readGen(sb, "mission-report.json").validated !== true, `${tag} empty-scope: mission NOT validated`);
  }

  // ======== NEGATIVE (governance-subsuming scope) — shared guard refuses, both entries ============
  for (const [tag, entry, mission] of [["LEGACY", LEGACY, "WCAP_PAR_GOV_LEGACY"], ["COMPILED", COMPILED, "WCAP_PAR_GOV_COMPILED"]] as const) {
    const sb = buildSandbox(mission, ["runtime/governance/**"]);
    runEntry(sb, entry, mission);
    check(fs.existsSync(path.join(sb, "runtime", "governance", "odg-synthetic-manifest.txt")) === false, `${tag} gov-scope: NO governance deliverable written`);
    if (genExists(sb, "patch-execution.json")) {
      const e = readGen(sb, "patch-execution.json").executed.find((x: any) => x.objectiveId === "ODG_WRITE_1");
      check(!e || (e.status !== "EXECUTED" && e.status !== "APPLIED"), `${tag} gov-scope: refused write is NOT EXECUTED/APPLIED`);
    } else check(true, `${tag} gov-scope: no execution record (refused pre-write)`);
    check(!genExists(sb, "mission-report.json") || readGen(sb, "mission-report.json").validated !== true, `${tag} gov-scope: mission NOT validated`);
  }

  // ======== NEGATIVE (invalid compiled entry) — explicit failure, NO silent legacy fallback =======
  const sbBad = buildSandbox("WCAP_PAR_BADENTRY", ["bench-workspace/**"]);
  const rBad = runEntry(sbBad, "runtime/dist/bin/DOES_NOT_EXIST.js", "WCAP_PAR_BADENTRY");
  check(rBad.code !== 0, "invalid entry: node exits non-zero (explicit launch failure)");
  check(fs.existsSync(path.join(sbBad, "bench-workspace", "odg-synthetic-manifest.txt")) === false, "invalid entry: NO deliverable written (no silent fallback to legacy)");
  check(!genExists(sbBad, "mission-report.json") || readGen(sbBad, "mission-report.json").validated !== true, "invalid entry: mission NOT validated");
} finally {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT B-β WRITE-CAPABILITY ENTRY PARITY" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
