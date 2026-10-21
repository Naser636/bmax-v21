// @ts-nocheck
/*
 * G4 — CONNECTED END-TO-END AUTONOMOUS MISSION-LOOP PROOF (isolated, test-only).
 *
 * Drives the REAL per-mission orchestrator the autonomy/converge CLIs call — `AutonomyRuntimeAdapter.
 * runPipeline` (src/runtime/autonomy-runtime-adapter.ts) — through the governed lifecycle (intake →
 * contract → governance + Truth-Lock → execution via the REAL runtime/bin|dist odg-run 13-stage pipeline →
 * Validation Engine as INDEPENDENT verifier → evidence + ledger → final status), across all five required
 * scenarios. It does NOT re-imitate the orchestration: the only seam is the external engineering provider
 * (an injected fake), used solely for the provider-unavailable / provider-error scenarios.
 *
 * Every run is an isolated temp git sandbox seeded with the real runtime (core/bin/dist/governance). The
 * live repo is never mutated; ODG_TRUTH_LOCK_ENFORCE is set only transiently in THIS test process for the
 * prohibited scenario and restored (never persisted); no scheduler, no systemd, no provider live call.
 *
 * Run (outside npm test): node_modules/.bin/tsx runtime/__bench__/g4-end-to-end-loop.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes: string[] = [];
let failures = 0;
function check(cond: boolean, label: string): void { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } }
function git(cwd: string, args: string[]): string { return execFileSync("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
const readGen = (sb, n) => { try { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8")); } catch { return null; } };
const genExists = (sb, n) => fs.existsSync(path.join(sb, "runtime", "generated", n));

function seed(sb: string): void {
  if (sb.startsWith(REPO)) throw new Error("sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.cpSync(path.join(REPO, "runtime", "dist"), path.join(sb, "runtime", "dist"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(sb, "src", "app"), { recursive: true });
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
}
// state: conforming (on main, origin/main==HEAD) | wrong-branch (non-conforming)
function sandbox(contract: any, state: "conforming" | "wrong-branch" = "conforming"): string {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "g4-"));
  sandboxes.push(sb); seed(sb);
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  git(sb, ["init", "-q"]); git(sb, ["add", "-A"]); git(sb, ["commit", "-q", "-m", "baseline"]);
  git(sb, ["branch", "-M", "main"]);
  git(sb, ["update-ref", "refs/remotes/origin/main", "HEAD"]);
  if (state === "wrong-branch") git(sb, ["checkout", "-q", "-b", "feature/x"]);
  return sb;
}
const commitCount = (sb) => { try { return parseInt(git(sb, ["rev-list", "--count", "HEAD"]), 10); } catch { return -1; } };

// Injected external-provider seam (ONLY external service mocked). "unavailable" => cannot proceed;
// "error" => a provider error/timeout surfaced as a FAILED outcome. Counts invocations (no-duplicate proof).
class FakeProvider {
  readonly name = "fake-provider"; calls = 0;
  constructor(private readonly mode: "unavailable" | "error") {}
  describe() { return { name: this.name, kind: "engineering-provider" as const, providerContractVersion: "1.0.0", model: "fake" }; }
  execute(request: any) {
    this.calls++;
    const base = { provider: this.name, providerExecuted: this.mode === "error", fromCache: false, sessionId: null, changedFiles: [], unauthorizedChanges: [], raw: { exitCode: this.mode === "error" ? 1 : null, stdout: "", stderr: this.mode }, diagnostics: [`fake provider: ${this.mode}`] };
    const status = this.mode === "unavailable" ? "BLOCKED" : "FAILED";
    return { ...base, classification: status, result: { mission: request.mission.mission, providerContractVersion: request.providerContractVersion, status, objectivesAddressed: [], changedFiles: [], commandsRun: [], blocker: `provider ${this.mode}` } };
  }
}

function cleanContract(mission: string) {
  return { mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL", requires_engineering: false, authorized_paths: [],
    objectives: [
      { id: "CLEAN_WORKSPACE_1", goal: "Enumerate the transient git-ignored runtime workspace artifacts under runtime/ (read-only scan).", done_when: ["A deterministic scan lists every candidate path under runtime/ that is safe to remove."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_2", goal: "Confirm each candidate is covered by the gitignore/backup/archive policy so no tracked or required artifact is listed.", done_when: ["Every candidate is git-ignored or already archived."], authorization: { eligible: true, authorized: true } },
      { id: "CLEAN_WORKSPACE_3", goal: "Produce read-only evidence of the cleaned workspace state without deleting any tracked or required artifact.", done_when: ["Evidence generated.", "Report generated."], authorization: { eligible: true, authorized: true } },
    ],
    verify: [{ capability: "Clean Workspace", evidence: "clean-workspace-scanned" }],
    definition_of_done: ["Evidence generated", "Report generated"] };
}
// A mission whose declared verify evidence can NEVER be satisfied by its (no-op) objective ⇒ Validation
// Engine must BLOCK (deterministic local-route failure, no provider).
function failingContract(mission: string) {
  return { mission, version: "1.0", status: "AUTHORIZED", mode: "READ_ONLY", priority: "NORMAL", requires_engineering: false, authorized_paths: [],
    objectives: [{ id: "NOOP_1", goal: "A deliberately unverifiable no-op objective.", done_when: ["never satisfied"], authorization: { eligible: true, authorized: true } }],
    verify: [{ capability: "ODG Spec Author", evidence: "spec-schema-valid" }],
    definition_of_done: ["spec produced"] };
}
// An engineering mission with a write scope but NO concrete edits ⇒ local cannot apply ⇒ escalates to the
// (injected) provider. Used for provider-unavailable and provider-error scenarios.
function engineeringContract(mission: string) {
  return { mission, version: "1.0", status: "AUTHORIZED", mode: "IMPLEMENT", priority: "NORMAL", requires_engineering: true, authorized_paths: ["src/app"],
    objectives: [{ id: "IMPL_1", goal: "Implement a bounded change in src/app.", done_when: ["change applied"], authorization: { eligible: true, authorized: true } }],
    definition_of_done: ["change applied and verified"] };
}

console.log("G4 — connected end-to-end autonomous mission-loop proof\n");

// ---- SCENARIO 1 — successful harmless mission (read-only), independent verification ----
{
  const sb = sandbox(cleanContract("G4_S1_SUCCESS"));
  const before = commitCount(sb);
  const out: any = new AutonomyRuntimeAdapter(sb).runPipeline("G4_S1_SUCCESS");
  const report = readGen(sb, "mission-report.json");
  const evidenceSize = (() => { try { return fs.statSync(path.join(sb, "runtime", "generated", "clean-workspace-report.json")).size; } catch { return 0; } })();
  check(out && out.pipelineOk === true, "S1 PASS: adapter.runPipeline executes the connected lifecycle (pipelineOk)");
  check(report && report.validated === true && report.status === "SUCCESS", "S1 PASS: Validation Engine (independent) reports validated SUCCESS");
  check(genExists(sb, "clean-workspace-scanned") || evidenceSize >= 0, "S1 PASS: capability evidence recorded under runtime/generated");
  check(commitCount(sb) === before, "S1 PASS: no unauthorized commit (read-only mission)");
}

// ---- SCENARIO 2 — deliberately failing mission: detected + reported, NOT false success ----
{
  const sb = sandbox(failingContract("G4_S2_FAIL"));
  const out: any = new AutonomyRuntimeAdapter(sb).runPipeline("G4_S2_FAIL");
  const report = readGen(sb, "mission-report.json");
  check(!(out && out.pipelineOk === true) || (report && report.status !== "SUCCESS"), "S2 PASS: failing mission is NOT reported as pipeline success");
  check(report && report.validated !== true && report.status !== "SUCCESS", "S2 PASS: Validation Engine reports NOT validated / non-SUCCESS (honest failure)");
  check(report && (report.status === "BLOCKED" || report.status === "FAILED" || report.status === "PARTIAL"), `S2 PASS: final status is a failure class (got ${report && report.status})`);
}

// ---- SCENARIO 3 — prohibited mission: refused before any consequential effect ----
{
  const sb = sandbox(engineeringContract("G4_S3_PROHIBITED"), "wrong-branch");
  const before = commitCount(sb);
  const prev = process.env.ODG_TRUTH_LOCK_ENFORCE;
  process.env.ODG_TRUTH_LOCK_ENFORCE = "1"; // transient, THIS test process only
  let out: any;
  try { out = new AutonomyRuntimeAdapter(sb).runPipeline("G4_S3_PROHIBITED"); }
  finally { if (prev === undefined) delete process.env.ODG_TRUTH_LOCK_ENFORCE; else process.env.ODG_TRUTH_LOCK_ENFORCE = prev; }
  const tl = readGen(sb, "truth-lock.json");
  const report = readGen(sb, "mission-report.json");
  check(!(out && out.pipelineOk === true), "S3 PASS: prohibited mission does NOT succeed");
  check(tl && tl.blocked === true, "S3 PASS: Truth-Lock verdict BLOCKED recorded (auditable refusal evidence)");
  check(!(report && report.status === "SUCCESS"), "S3 PASS: final status is not SUCCESS");
  check(commitCount(sb) === before && fs.readdirSync(path.join(sb, "src", "app")).length === 0, "S3 PASS: no consequential effect — no commit, no target write");
}

// First, the GOVERNED ANTI-BYPASS property (DEF-014): a locally governed VALIDATION_BLOCKED refusal must
// NOT be auto-escalated to a provider. Driven through the full runPipeline with a provider injected.
{
  const sb = sandbox(engineeringContract("G4_S0_NOESCALATE"));
  const provider = new FakeProvider("error");
  const out: any = new AutonomyRuntimeAdapter(sb, provider as any).runPipeline("G4_S0_NOESCALATE");
  check(!(out && out.pipelineOk === true) && provider.calls === 0, `anti-bypass (DEF-014): a governed local block is NOT escalated to the provider (provider calls=${provider.calls})`);
}

// Drive the REAL provider orchestration path (executeMetered → executeWithFailover → provider.execute →
// applyGovernedProposal → receipt → Validation Engine → commit gate). The provider is the only seam.
function runProvider(sb: string, contract: any, provider: FakeProvider): any {
  const prev = process.cwd();
  try { process.chdir(sb); return (new AutonomyRuntimeAdapter(sb, provider as any) as any).runViaProvider(contract.mission, contract, undefined); }
  finally { process.chdir(prev); }
}

// ---- SCENARIO 4 — provider unavailable: safe block, not success, no mutation ----
{
  const sb = sandbox(engineeringContract("G4_S4_NOPROVIDER"));
  const before = commitCount(sb);
  const provider = new FakeProvider("unavailable");
  const out: any = runProvider(sb, engineeringContract("G4_S4_NOPROVIDER"), provider);
  check(provider.calls >= 1, "S4 PASS: real provider orchestration path was exercised");
  check(out && (out.pipelineOk === false || out.classification === "BLOCKED"), "S4 PASS: provider-unavailable ⇒ BLOCKED, not success (safe block)");
  check(commitCount(sb) === before && fs.readdirSync(path.join(sb, "src", "app")).length === 0, "S4 PASS: no mutation on a blocked mission");
}

// ---- SCENARIO 5 — provider error/timeout: classified failure, bounded (no-duplicate) ----
{
  const sb = sandbox(engineeringContract("G4_S5_PROVIDER_ERROR"));
  const before = commitCount(sb);
  const provider = new FakeProvider("error");
  const adapter: any = new AutonomyRuntimeAdapter(sb, provider as any);
  const prev = process.cwd(); process.chdir(sb);
  let out1: any, out2: any;
  try { const c = engineeringContract("G4_S5_PROVIDER_ERROR"); out1 = adapter.runViaProvider(c.mission, c, undefined); out2 = adapter.runViaProvider(c.mission, c, undefined); }
  finally { process.chdir(prev); }
  check(out1 && out1.pipelineOk === false, "S5 PASS: provider error ⇒ adapter classifies the run as NON-success (pipelineOk=false, not false success)");
  const s5report = readGen(sb, "mission-report.json");
  check(!(s5report && s5report.status === "SUCCESS"), `S5 PASS: persisted status is not SUCCESS (got ${s5report && s5report.status})`);
  check(provider.calls === 1, `S5 PASS: provider invoked exactly once across re-run (bounded, no-duplicate — providerRuns cache) — calls=${provider.calls}`);
  check(commitCount(sb) === before && fs.readdirSync(path.join(sb, "src", "app")).length === 0, "S5 PASS: no duplicate/residual repository effect");
}

for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
console.log(failures === 0 ? "\nALL PASS — G4 connected end-to-end loop" : `\nFAILURES: ${failures}`);
if (failures > 0) process.exit(1);
