/*
 * V42 — PROVIDER PROPOSE / ODG GOVERNED APPLY — execution-authority boundary proof.
 *
 * Proves the REAL boundary (not a label): a provider with ZERO Write/Edit/Bash authority PROPOSES a
 * change; ODG alone APPLIES it through the EXISTING governed patch-executor (runtime/core), which
 * enforces authorizedPaths. Includes the decisive A/B (who gets write tools) and the rejection suite.
 * Offline — the provider process is injected; the apply is the real patch-executor via a child process.
 * Run: `npx tsx src/tests/propose-apply-boundary.test.ts`.
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ClaudeProviderAdapter,
  type ProviderProcessResult,
  type ProviderProcessRunner,
} from "@/providers/claude-provider-adapter";
import {
  PROVIDER_CONTRACT_VERSION,
  renderMissionPrompt,
  type ProviderMission,
  type ProviderRequest,
} from "@/providers/provider-port";

const require_ = createRequire(import.meta.url);
const { applyProposal } = require_("../../runtime/core/patch-proposal-apply.js") as {
  applyProposal: (opts: {
    mission: string;
    authorizedPaths: string[];
    proposedEdits: unknown;
    cwd?: string;
  }) => { applied: boolean; reason: string; executed: Array<{ status: string; objectiveId?: string }>; report: { mission?: string } | null };
};

let failures = 0;
function check(cond: boolean, msg: string): void {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  }
}

// --- fixtures ---------------------------------------------------------------

function mission(authorizedPaths: string[]): ProviderMission {
  return {
    mission: "V42_BOUNDARY",
    priority: "NORMAL",
    mode: "IMPLEMENT",
    objectives: [{ id: "o1", goal: "Author out/app.ts.", done_when: ["file exists"] }],
    definitionOfDone: ["done"],
    completion: ["RELEASE"],
    authorizedPaths,
    context: {
      repoRoot: "/repo",
      branch: "main",
      headCommit: "v42head",
      masterPlanObjectives: ["X"],
      missingCapabilities: ["X"],
    },
  };
}
function request(m: ProviderMission, extra: Partial<ProviderRequest> = {}): ProviderRequest {
  return { providerContractVersion: PROVIDER_CONTRACT_VERSION, mission: m, model: "claude-opus-4-8", maxTurns: 12, ...extra };
}
const envelope = (result: object): string =>
  JSON.stringify({ type: "result", subtype: "success", is_error: false, session_id: "s1", num_turns: 2, result: JSON.stringify(result) });

/** Injected runner: records the claude args, models a clean tree, writes NOTHING (a plan-mode provider cannot). */
function recorder(claudeStdout: string): { run: ProviderProcessRunner; lastArgs: () => string[] } {
  let seen: string[] = [];
  let claudeCalls = 0;
  const run: ProviderProcessRunner = (bin, args): ProviderProcessResult => {
    if (bin === "git") return { status: 0, stdout: "", stderr: "" };
    claudeCalls++;
    seen = args;
    return { status: 0, stdout: claudeStdout, stderr: "" };
  };
  return { run, lastArgs: () => seen };
}

const cacheDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "v42-cache-"));
const PERMISSION = (a: string[]) => a[a.indexOf("--permission-mode") + 1];
const TOOLS = (a: string[]) => a[a.indexOf("--allowedTools") + 1];

// === 1. DECISIVE BOUNDARY — propose-only provider is denied Write/Edit/Bash ===
{
  const r = recorder(envelope({ mission: "V42_BOUNDARY", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: ["o1"], changedFiles: [], commandsRun: [], blocker: null, proposedEdits: [{ objectiveId: "o1", target: "out/app.ts", content: "export const x = 1;\n" }] }));
  const out = new ClaudeProviderAdapter({ run: r.run, cacheDir: cacheDir() }).execute(request(mission(["out/"]), { proposeOnly: true }));
  const a = r.lastArgs();
  check(PERMISSION(a) === "plan", "propose-only ⇒ plan mode (no acceptEdits)");
  check(TOOLS(a) === "Read,Grep,Glob", "propose-only ⇒ read-only tools only");
  check(!a.includes("Edit,Write,Bash,Grep,Glob"), "propose-only ⇒ NO Write/Edit/Bash tools");
  check(a.indexOf("acceptEdits") === -1, "propose-only ⇒ acceptEdits never passed");
  check(out.classification === "OK", "clean propose-only run ⇒ OK");
  check(!!out.result && Array.isArray(out.result.proposedEdits) && out.result.proposedEdits!.length === 1, "provider proposal parsed into result");
  check(out.changedFiles.length === 0, "provider itself changed NO files (it has no write tool)");
}

// === 2. A/B — authority surface differs (CONTROL writes, TREATMENT proposes) ===
{
  const res = { mission: "V42_BOUNDARY", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: ["o1"], changedFiles: [], commandsRun: [], blocker: null };
  const control = recorder(envelope(res));
  new ClaudeProviderAdapter({ run: control.run, cacheDir: cacheDir() }).execute(request(mission(["out/"]))); // no proposeOnly
  const treatment = recorder(envelope({ ...res, proposedEdits: [{ target: "out/app.ts", content: "x" }] }));
  new ClaudeProviderAdapter({ run: treatment.run, cacheDir: cacheDir() }).execute(request(mission(["out/"]), { proposeOnly: true }));
  check(PERMISSION(control.lastArgs()) === "acceptEdits" && TOOLS(control.lastArgs()).includes("Write"), "CONTROL: provider gets acceptEdits + Write (direct-write authority)");
  check(PERMISSION(treatment.lastArgs()) === "plan" && !TOOLS(treatment.lastArgs()).includes("Write"), "TREATMENT: provider gets plan + no Write (zero write authority)");
}

// === 3. PROMPT — propose-only instructs returning proposedEdits; default does not ===
{
  const pOnly = renderMissionPrompt(request(mission(["out/"]), { proposeOnly: true }));
  const pDef = renderMissionPrompt(request(mission(["out/"])));
  check(pOnly.includes("PROPOSE_ONLY") && pOnly.includes("proposedEdits"), "propose-only prompt names PROPOSE_ONLY + proposedEdits");
  check(pOnly.includes("Do NOT modify"), "propose-only prompt forbids modifying files");
  check(!pDef.includes("PROPOSE_ONLY"), "default prompt unchanged (no PROPOSE_ONLY)");
}

// === 4. GOVERNED APPLY (happy path) — ODG is the writer, within authorizedPaths ===
function sandbox(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "v42-sbx-"));
  fs.mkdirSync(path.join(d, "runtime", "generated"), { recursive: true });
  return d;
}
{
  const d = sandbox();
  const target = path.join(d, "out", "app.ts");
  check(!fs.existsSync(target), "before apply: target absent (provider wrote nothing)");
  const res = applyProposal({ mission: "V42_BOUNDARY", authorizedPaths: ["out/"], proposedEdits: [{ objectiveId: "o1", target: "out/app.ts", content: "export const ok = true;\n" }], cwd: d });
  check(res.applied === true, "valid in-scope proposal ⇒ applied by governed executor");
  check(fs.existsSync(target) && fs.readFileSync(target, "utf8").includes("ok = true"), "ODG (patch-executor child) wrote the file");
  check(res.executed.some((e) => e.status === "APPLIED"), "patch-execution evidence shows APPLIED");
  // Mission identity is ODG's, never the provider's self-report.
  const plan = JSON.parse(fs.readFileSync(path.join(d, "runtime", "generated", "patch-plan.json"), "utf8"));
  check(plan.mission === "V42_BOUNDARY", "apply uses ODG's authoritative mission id");
  fs.rmSync(d, { recursive: true, force: true });
}

// === 5. REJECTIONS (reject safely; no out-of-scope write) =====================
{
  // (a) target outside authorizedPaths ⇒ executor FAILED, file not written, not applied.
  const d = sandbox();
  const res = applyProposal({ mission: "V42_BOUNDARY", authorizedPaths: ["out/"], proposedEdits: [{ target: "src/secret.ts", content: "nope" }], cwd: d });
  check(res.applied === false, "out-of-scope target ⇒ not applied");
  check(!fs.existsSync(path.join(d, "src", "secret.ts")), "out-of-scope file NOT written");
  check(res.executed.some((e) => e.status === "FAILED"), "out-of-scope recorded FAILED by executor");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // (b) malformed (neither content nor diff) ⇒ rejected before spawn, nothing written.
  const d = sandbox();
  const res = applyProposal({ mission: "V42_BOUNDARY", authorizedPaths: ["out/"], proposedEdits: [{ target: "out/a.ts" }], cwd: d });
  check(res.reason === "MALFORMED_PROPOSAL" && res.applied === false, "malformed edit ⇒ MALFORMED_PROPOSAL (atomic reject)");
  check(!fs.existsSync(path.join(d, "runtime", "generated", "patch-plan.json")), "malformed ⇒ no plan written, no executor spawned");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // (c) ambiguous (both content AND diff) ⇒ rejected.
  const d = sandbox();
  const res = applyProposal({ mission: "V42_BOUNDARY", authorizedPaths: ["out/"], proposedEdits: [{ target: "out/a.ts", content: "x", diff: "@@ -1 +1 @@" }], cwd: d });
  check(res.reason === "MALFORMED_PROPOSAL", "ambiguous edit (content+diff) ⇒ rejected");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // (d) empty proposal (provider DONE without edits) ⇒ NO_PROPOSAL, nothing applied.
  const d = sandbox();
  const res = applyProposal({ mission: "V42_BOUNDARY", authorizedPaths: ["out/"], proposedEdits: [], cwd: d });
  check(res.reason === "NO_PROPOSAL" && res.applied === false, "DONE without a proposal ⇒ not accepted");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // (e) diff whose context does not match the target ⇒ executor FAILED, target not written.
  const d = sandbox();
  const res = applyProposal({ mission: "V42_BOUNDARY", authorizedPaths: ["out/"], proposedEdits: [{ target: "out/a.ts", diff: "@@ -1,1 +1,1 @@\n-nonexistent context\n+replacement" }], cwd: d });
  check(res.applied === false && res.executed.some((e) => e.status === "FAILED"), "diff context mismatch ⇒ FAILED (no half-applied file)");
  check(!fs.existsSync(path.join(d, "out", "a.ts")), "mismatched diff leaves target unwritten");
  fs.rmSync(d, { recursive: true, force: true });
}
{
  // (f) missing scope ⇒ throws (cannot authorize an engineering apply without a write scope).
  let threw = false;
  try { applyProposal({ mission: "V42_BOUNDARY", authorizedPaths: [], proposedEdits: [{ target: "out/a.ts", content: "x" }] }); } catch { threw = true; }
  check(threw, "empty authorizedPaths ⇒ applyProposal refuses (no authority to apply)");
}

if (failures > 0) {
  console.error(`propose-apply-boundary: ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("V42 propose/apply boundary OK");
