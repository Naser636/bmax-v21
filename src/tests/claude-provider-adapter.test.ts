/*
 * Conformance test — Claude Provider Adapter (CLAUDE_PROVIDER_ADAPTER_V1)
 *
 * Exercises the full provider contract WITHOUT calling the real (paid) Claude CLI: the process
 * runner is injected. Verifies command shape (contract §2), deterministic prompt (§3), result
 * normalization (§4), return-code mapping (§7), frozen-root enforcement (§9), and the cost-saving
 * cache. Run: `npx tsx src/tests/claude-provider-adapter.test.ts`.
 */

import fs from "node:fs";

import {
  ClaudeProviderAdapter,
  createClaudeProvider,
  type ProviderProcessResult,
  type ProviderProcessRunner,
} from "@/providers/claude-provider-adapter";
import {
  PROVIDER_CONTRACT_VERSION,
  isFrozenPath,
  missionRequiresProvider,
  renderMissionPrompt,
  toPipelineOutcome,
  type ProviderMission,
  type ProviderRequest,
} from "@/providers/provider-port";

// --- fixtures ---------------------------------------------------------------

function mission(authorizedPaths: string[], mode = "BUILD"): ProviderMission {
  return {
    mission: "DEMO_CAPABILITY",
    priority: "NORMAL",
    mode,
    objectives: [{ id: "o1", goal: "Deliver X.", done_when: ["Build green."] }],
    definitionOfDone: ["Objective completed."],
    completion: ["Release Manager decision is RELEASE."],
    authorizedPaths,
    context: {
      repoRoot: "/repo",
      branch: "main",
      headCommit: "abc123",
      masterPlanObjectives: ["X", "Y"],
      missingCapabilities: ["X"],
    },
  };
}

function request(m: ProviderMission, extra: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    providerContractVersion: PROVIDER_CONTRACT_VERSION,
    mission: m,
    model: "claude-opus-4-8",
    maxTurns: 12,
    ...extra,
  };
}

const successEnvelope = (result: object, sessionId = "sess-1"): string =>
  JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    session_id: sessionId,
    num_turns: 3,
    result: JSON.stringify(result),
  });

/** Build a fake runner that records claude/git calls and returns scripted output. */
function fakeRunner(opts: {
  claude: ProviderProcessResult;
  gitPorcelain?: string;
}): { run: ProviderProcessRunner; calls: { claude: number; git: number }; lastClaudeArgs: () => string[] } {
  const calls = { claude: 0, git: 0 };
  let lastArgs: string[] = [];
  const run: ProviderProcessRunner = (bin, args) => {
    if (bin === "git") {
      calls.git++;
      // Model reality for the adapter's pre-run baseline: the working tree is clean BEFORE the
      // provider runs (no claude call yet) and shows the scripted porcelain only AFTER it has run.
      // This lets post-run enforcement attribute changes to the provider, not to a pre-existing tree.
      return { status: 0, stdout: calls.claude > 0 ? (opts.gitPorcelain ?? "") : "", stderr: "" };
    }
    calls.claude++;
    lastArgs = args;
    return opts.claude;
  };
  return { run, calls, lastClaudeArgs: () => lastArgs };
}

const CACHE_DIR = `${process.cwd()}/runtime/generated/provider-cache-test`;
function freshCacheDir(): string {
  fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  return CACHE_DIR;
}

// --- describe / static (contract §1) ---------------------------------------

const probe = createClaudeProvider({ model: "claude-opus-4-8" });
console.assert(probe.name === "claude-code", "provider name is claude-code");
const d = probe.describe();
console.assert(d.kind === "engineering-provider", "kind is engineering-provider");
console.assert(d.providerContractVersion === "1.0.0", "contract version 1.0.0");

// --- ODG routing decision (contract §0/§1) ----------------------------------

console.assert(missionRequiresProvider({ authorizedPaths: ["src/app/**"] }) === true, "write scope ⇒ required");
console.assert(missionRequiresProvider({ authorizedPaths: [] }) === false, "no scope ⇒ not required");
console.assert(missionRequiresProvider({ mode: "AUDIT", authorizedPaths: ["x"] }) === false, "audit ⇒ not required");
console.assert(missionRequiresProvider({ requiresEngineering: true }) === true, "explicit flag ⇒ required");

// --- deterministic prompt (contract §3) -------------------------------------

const p1 = renderMissionPrompt(request(mission(["src/app/**"])));
const p2 = renderMissionPrompt(request(mission(["src/app/**"])));
console.assert(p1 === p2, "prompt render is deterministic");
console.assert(p1.includes("# MISSION: DEMO_CAPABILITY"), "prompt has mission header");
console.assert(p1.includes("## AUTHORIZED_PATHS"), "prompt has authorized-paths section");
console.assert(
  renderMissionPrompt(request(mission([]))).includes("READ-ONLY mission"),
  "empty scope renders read-only notice",
);

// --- frozen path classification (contract §9) -------------------------------

console.assert(isFrozenPath("runtime/bin/odg") === true, "runtime/** is frozen");
console.assert(isFrozenPath("src/core/runtime-autonomy.ts") === true, "src/core/** is frozen");
console.assert(isFrozenPath("docs/RUNTIME_AUTONOMY_DESIGN_v1.md") === true, "design docs frozen");
console.assert(isFrozenPath("src/app/page.tsx") === false, "app code not frozen");

// --- command shape (contract §2) --------------------------------------------

{
  const f = fakeRunner({ claude: { status: 0, stdout: successEnvelope({ mission: "DEMO_CAPABILITY", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: ["o1"], changedFiles: [], commandsRun: [], blocker: null }), stderr: "" }, gitPorcelain: " M src/app/page.tsx\n" });
  const adapter = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() });
  adapter.execute(request(mission(["src/app/**"])));
  const a = f.lastClaudeArgs();
  console.assert(a.includes("-p"), "uses -p (headless)");
  console.assert(a[a.indexOf("--output-format") + 1] === "json", "json output format");
  console.assert(a[a.indexOf("--model") + 1] === "claude-opus-4-8", "model pinned");
  console.assert(a.includes("--append-system-prompt"), "guardrails appended");
  console.assert(a[a.indexOf("--permission-mode") + 1] === "acceptEdits", "write mission ⇒ acceptEdits");
  const ro = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() });
  ro.execute(request(mission([])));
  const b = f.lastClaudeArgs();
  console.assert(b[b.indexOf("--permission-mode") + 1] === "plan", "read-only mission ⇒ plan mode");
  console.assert(!b.includes("Edit,Write,Bash,Grep,Glob"), "read-only omits write tools");
}

// --- OK path (contract §4/§7) -----------------------------------------------

{
  const f = fakeRunner({ claude: { status: 0, stdout: successEnvelope({ mission: "DEMO_CAPABILITY", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: ["o1"], changedFiles: ["src/app/page.tsx"], commandsRun: ["npm run build"], blocker: null }), stderr: "" }, gitPorcelain: " M src/app/page.tsx\n" });
  const adapter = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() });
  const out = adapter.execute(request(mission(["src/app/**"])));
  console.assert(out.classification === "OK", "clean run ⇒ OK");
  console.assert(out.providerExecuted === true, "provider executed");
  console.assert(out.result?.status === "DONE", "result parsed as DONE");
  console.assert(out.sessionId === "sess-1", "session id captured");
  console.assert(out.unauthorizedChanges.length === 0, "no unauthorized changes");
  console.assert(toPipelineOutcome(out).pipelineOk === true, "OK maps to pipelineOk true");
}

// --- BLOCKED (provider-certified stop, contract §4.2/§7) --------------------

{
  const f = fakeRunner({ claude: { status: 0, stdout: successEnvelope({ mission: "DEMO_CAPABILITY", providerContractVersion: "1.0.0", status: "BLOCKED", objectivesAddressed: [], changedFiles: [], commandsRun: [], blocker: "missing precondition" }), stderr: "" }, gitPorcelain: "" });
  const out = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() }).execute(request(mission(["src/app/**"])));
  console.assert(out.classification === "BLOCKED", "provider BLOCKED ⇒ BLOCKED");
  console.assert(toPipelineOutcome(out).pipelineOk === false, "BLOCKED maps to pipelineOk false");
}

// --- FAILED (non-zero exit, contract §7.1) ----------------------------------

{
  const f = fakeRunner({ claude: { status: 1, stdout: "", stderr: "boom" }, gitPorcelain: "" });
  const out = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() }).execute(request(mission(["src/app/**"])));
  console.assert(out.classification === "FAILED", "non-zero exit ⇒ FAILED");
}

// --- INTERRUPTED (timeout/signal, contract §7.1/§8) -------------------------

{
  const f = fakeRunner({ claude: { status: null, stdout: "", stderr: "", signal: "SIGTERM", timedOut: true }, gitPorcelain: "" });
  const out = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() }).execute(request(mission(["src/app/**"])));
  console.assert(out.classification === "INTERRUPTED", "timeout ⇒ INTERRUPTED (resumable)");
}

// --- frozen-root enforcement (contract §9 layer 4) --------------------------

{
  const f = fakeRunner({ claude: { status: 0, stdout: successEnvelope({ mission: "DEMO_CAPABILITY", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: [], changedFiles: [], commandsRun: [], blocker: null }), stderr: "" }, gitPorcelain: " M src/core/runtime-autonomy.ts\n M src/app/page.tsx\n" });
  const out = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() }).execute(request(mission(["src/app/**"])));
  console.assert(out.classification === "FAILED", "unauthorized frozen change ⇒ FAILED");
  console.assert(out.unauthorizedChanges.includes("src/core/runtime-autonomy.ts"), "frozen file flagged");
  console.assert(!out.unauthorizedChanges.includes("src/app/page.tsx"), "authorized file not flagged");
}

// --- resume bypasses cache and passes --resume (contract §8) ----------------

{
  const f = fakeRunner({ claude: { status: 0, stdout: successEnvelope({ mission: "DEMO_CAPABILITY", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: [], changedFiles: [], commandsRun: [], blocker: null }, "sess-resumed"), stderr: "" }, gitPorcelain: "" });
  const adapter = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() });
  adapter.execute(request(mission(["src/app/**"]), { resumeSessionId: "sess-prev" }));
  const a = f.lastClaudeArgs();
  console.assert(a[0] === "--resume" && a[1] === "sess-prev", "resume passes --resume <id> first");
}

// --- cost minimization: identical re-request served from cache --------------

{
  const f = fakeRunner({ claude: { status: 0, stdout: successEnvelope({ mission: "DEMO_CAPABILITY", providerContractVersion: "1.0.0", status: "DONE", objectivesAddressed: [], changedFiles: [], commandsRun: [], blocker: null }), stderr: "" }, gitPorcelain: "" });
  const adapter = new ClaudeProviderAdapter({ run: f.run, cacheDir: freshCacheDir() });
  const req = request(mission([])); // read-only: no changed files, cacheable
  const first = adapter.execute(req);
  console.assert(first.fromCache === false && f.calls.claude === 1, "first call is live");
  const second = adapter.execute(req);
  console.assert(second.fromCache === true, "identical re-request served from cache");
  console.assert(f.calls.claude === 1, "no second live provider call (cost saved)");
  const bypass = adapter.execute(request(mission([]), { bypassCache: true }));
  console.assert(bypass.fromCache === false && f.calls.claude === 2, "bypassCache forces live call");
}

// cleanup: cache lives under git-ignored runtime/generated, but remove the test dir anyway.
fs.rmSync(CACHE_DIR, { recursive: true, force: true });

console.log("Claude Provider Adapter OK");
