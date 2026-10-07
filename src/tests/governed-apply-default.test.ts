/*
 * V43 — GOVERNED APPLY IS THE DEFAULT ENGINEERING PATH — integration + security proof.
 *
 * Composes the production objects (RuntimeAutonomy → AutonomyRuntimeAdapter → REAL ClaudeProviderAdapter)
 * with ONLY the process boundary stubbed. Proves, end-to-end and OFFLINE, that:
 *   (1) the default engineering path hands the provider ZERO Write/Edit/Bash (plan mode + read-only tools);
 *   (2) ODG — not the provider — writes the repository, via the governed patch-executor, within scope;
 *   (3) an explicit (never silent) ODG_PROVIDER_DIRECT_WRITE=1 opt-out restores the legacy direct-write surface;
 *   (4) an out-of-scope proposal is NOT written anywhere (no hidden fallback to a direct write).
 * Run: `npx tsx src/tests/governed-apply-default.test.ts`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import { AUTONOMY_CONTRACT_VERSION } from "@/contracts/runtime-autonomy";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";
import { ClaudeProviderAdapter, type ProviderProcessRunner } from "@/providers/claude-provider-adapter";

const MISSION = "PROVIDER_ENABLED_SMOKE_V1";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const MISSION_FILE = path.join(REPO_ROOT, "runtime", "missions", `${MISSION}.json`);
const TARGET_REL = "src/app/provider-smoke/marker.ts"; // inside the mission's authorizedPaths
const cfg = { autonomyContractVersion: AUTONOMY_CONTRACT_VERSION };

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "odg-v43-"));
  const generated = path.join(root, "runtime", "generated");
  fs.mkdirSync(path.join(root, "runtime", "missions"), { recursive: true });
  fs.mkdirSync(path.join(root, "runtime", "core"), { recursive: true });
  fs.mkdirSync(generated, { recursive: true });
  fs.writeFileSync(path.join(root, "runtime", "core", "mission-ledger.js"), "process.exit(0);\n");
  // Local pipeline stub: exits non-zero so LOCAL fails cleanly → recovery exhausts → provider path
  // (the real engineering route) runs. Avoids a noisy module-not-found dump from a missing launcher.
  fs.mkdirSync(path.join(root, "runtime", "bin"), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime", "bin", "odg-run.js"), "process.exit(1);\n");
  fs.copyFileSync(MISSION_FILE, path.join(root, "runtime", "missions", `${MISSION}.json`));
  fs.writeFileSync(path.join(generated, "mission-plan.json"), JSON.stringify({ objectives: [MISSION] }));
  fs.writeFileSync(path.join(generated, "capability-registry.json"), JSON.stringify({ missingCapabilities: [MISSION] }));
  fs.writeFileSync(path.join(generated, "runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
  fs.writeFileSync(path.join(generated, "mission-report.json"), JSON.stringify({ mission: MISSION, status: "SUCCESS", validated: true, objectives: [MISSION] }));
  const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
  git("init"); git("config", "user.email", "odg@local"); git("config", "user.name", "ODG");
  git("add", "-A"); git("-c", "commit.gpgsign=false", "commit", "-m", "fixture");
  return root;
}

/** Fake `claude` process: records args, writes NOTHING (a plan-mode provider cannot), returns a proposal. */
function proposingRunner(capture: { args: string[] }, edits: object[]): ProviderProcessRunner {
  return (bin, args) => {
    if (bin === "git") return { status: 0, stdout: "", stderr: "" };
    capture.args = args;
    return {
      status: 0,
      stdout: JSON.stringify({
        type: "result", subtype: "success", is_error: false, session_id: "s",
        result: JSON.stringify({
          mission: MISSION, providerContractVersion: "1.0.0", status: "DONE",
          objectivesAddressed: ["PROVIDER_SMOKE_MARKER"], changedFiles: [], commandsRun: [], blocker: null,
          proposedEdits: edits,
        }),
      }),
      stderr: "",
    };
  };
}

const PERM = (a: string[]) => a[a.indexOf("--permission-mode") + 1];
const TOOLS = (a: string[]) => a[a.indexOf("--allowedTools") + 1];

// === 1. DEFAULT: provider denied write tools; ODG applies the proposal in-scope =================
{
  const ws = makeWorkspace();
  const cap = { args: [] as string[] };
  const provider = new ClaudeProviderAdapter({ cwd: ws, run: proposingRunner(cap, [{ objectiveId: "o1", target: TARGET_REL, content: "export const MARKER = true;\n" }]), cacheDir: path.join(ws, "runtime/generated/provider-cache") });
  const result = new RuntimeAutonomy().run(cfg, new AutonomyRuntimeAdapter(ws, provider));

  check(PERM(cap.args) === "plan", "SECURITY: default engineering ⇒ provider runs in plan mode (no acceptEdits)");
  check(TOOLS(cap.args) === "Read,Grep,Glob", "SECURITY: provider gets read-only tools only");
  check(!cap.args.includes("Edit,Write,Bash,Grep,Glob") && cap.args.indexOf("acceptEdits") === -1, "SECURITY: NO Write/Edit/Bash, NO acceptEdits");
  check(fs.existsSync(path.join(ws, TARGET_REL)) && fs.readFileSync(path.join(ws, TARGET_REL), "utf8").includes("MARKER = true"), "APPLY: ODG (patch-executor) wrote the in-scope file — the provider did not");
  check(result.status === "PLAN_COMPLETE" && result.completed[0]?.record.decision === "RELEASE", "the governed-apply mission releases");
  fs.rmSync(ws, { recursive: true, force: true });
}

// === 2. A/B — explicit opt-out restores the legacy direct-write surface ==========================
{
  const ws = makeWorkspace();
  const cap = { args: [] as string[] };
  const had = process.env.ODG_PROVIDER_DIRECT_WRITE;
  process.env.ODG_PROVIDER_DIRECT_WRITE = "1";
  try {
    const provider = new ClaudeProviderAdapter({ cwd: ws, run: proposingRunner(cap, []), cacheDir: path.join(ws, "runtime/generated/provider-cache") });
    new RuntimeAutonomy().run(cfg, new AutonomyRuntimeAdapter(ws, provider));
    check(PERM(cap.args) === "acceptEdits" && TOOLS(cap.args).includes("Write"), "A/B CONTROL: ODG_PROVIDER_DIRECT_WRITE=1 ⇒ provider gets acceptEdits + Write (explicit legacy)");
  } finally {
    if (had === undefined) delete process.env.ODG_PROVIDER_DIRECT_WRITE; else process.env.ODG_PROVIDER_DIRECT_WRITE = had;
  }
  fs.rmSync(ws, { recursive: true, force: true });
}

// === 3. SECURITY — an out-of-scope proposal is NOT written anywhere (no hidden direct write) =====
{
  const ws = makeWorkspace();
  const cap = { args: [] as string[] };
  const provider = new ClaudeProviderAdapter({ cwd: ws, run: proposingRunner(cap, [{ target: "src/core/forbidden.ts", content: "nope" }]), cacheDir: path.join(ws, "runtime/generated/provider-cache") });
  new RuntimeAutonomy().run(cfg, new AutonomyRuntimeAdapter(ws, provider));
  check(!fs.existsSync(path.join(ws, "src", "core", "forbidden.ts")), "SECURITY: out-of-scope proposed target is never written (governed executor rejects it)");
  fs.rmSync(ws, { recursive: true, force: true });
}

if (failures > 0) { console.error(`\nGoverned Apply Default: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nV43 governed-apply default OK");
