/*
 * Provider Activation — the seam that ACTIVATES the Provider Registry + Provider Orchestrator inside
 * the Runtime and turns their decision into a real, evidenced provider call.
 *
 * ROOT CAUSE this module fixes: the Provider Registry (src/core/provider-registry.ts) and the
 * Provider Orchestrator (src/core/provider-orchestrator.ts) were fully built + unit-tested but never
 * wired together and never reachable from the Runtime — they were isolated foundations. Separately,
 * runtime/config/provider-policy.json declared LOCAL_ONLY / externalProvidersEnabled:false but was
 * enforced by ZERO lines of code (orphaned, and as written a latent blocker of every real call).
 *
 * This module is the single activation point:
 *   1. It builds the Registry, registers the concrete engineering providers (Claude, OpenAI — the
 *      architecture is extensible: add a descriptor, nothing else changes) with enablement driven by
 *      the policy file, then feeds the Registry snapshot into the Orchestrator.
 *   2. It asks the Orchestrator to resolve the CAPABILITY first and then SELECT a provider
 *      (deterministic, Runtime-owned decision — providers never self-select).
 *   3. It hands the selected provider to the real execution bridge (provider-failover-engine →
 *      Claude/OpenAI adapters, which spawn the real CLI). The outcome is always data: a real
 *      response, or the precise cause of failure (missing credential / binary / policy deny).
 *   4. It returns a single evidence object recording the policy, the selection, and the outcome —
 *      never a claim, never a secret.
 *
 * Everything is error-as-data (no throws on the mission path) and deterministic given its inputs, so
 * the same environment yields the same evidence.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { ProviderRegistry } from "@/core/provider-registry";
import { ProviderOrchestrator } from "@/core/provider-orchestrator";
import { PROVIDER_REGISTRY_CONTRACT_VERSION } from "@/contracts/provider-registry";
import { PROVIDER_ORCHESTRATOR_CONTRACT_VERSION } from "@/contracts/provider-orchestrator";
import { ENGINEERING_CAPABILITY } from "@/contracts/provider-capability";
import type { ProviderAdapterDescriptor } from "@/contracts/provider-adapter";
import {
  PROVIDER_CONTRACT_VERSION,
  type ProviderMission,
  type ProviderRequest,
  type RoutableMission,
} from "@/providers/provider-port";
import { defaultAvailabilityEnv } from "@/providers/provider-factory";
import type { AvailabilityEnv } from "@/providers/provider-availability";
import type { ClaudeProviderOptions } from "@/providers/claude-provider-adapter";
import { OpenAIProviderAdapter, type OpenAIProviderOptions } from "@/providers/openai-provider-adapter";
import { runMissionWithFailover } from "@/runtime/provider-failover-engine";

/** Shape of runtime/config/provider-policy.json (only the fields this seam reads). */
export interface ProviderPolicy {
  mode?: string;
  externalProvidersEnabled?: boolean;
  defaultProvider?: string;
  fallbackProvider?: string;
  /**
   * LOCAL_FIRST posture (default). The Runtime runs the local deterministic pipeline + local recovery
   * first and reaches a provider ONLY when local execution is proven impossible; providers stay
   * registered for that last-resort case. Enforced behaviourally by AutonomyRuntimeAdapter.runPipeline.
   */
  executionPolicy?: "LOCAL_FIRST" | "PROVIDER_FIRST";
  /** Fraction of missions expected to execute entirely locally (evidence target, default 0.95). */
  localExecutionTarget?: number;
  /** When a provider may be used under LOCAL_FIRST (surfaced as evidence). */
  providerUse?: string;
  /** Optional explicit provider table; defaults to the built-in Claude(primary)/OpenAI(failover). */
  providers?: Array<{ id: string; priority: number; capabilities?: string[] }>;
}

/** The mission the Runtime hands to the activation seam (a superset of RoutableMission). */
export interface ActivationMission extends RoutableMission {
  mission?: string;
  priority?: string;
  objectives?: Array<{ id?: string; goal?: string; done_when?: string[] }>;
  definitionOfDone?: string[];
}

export interface ActivationOptions {
  policy?: ProviderPolicy;
  /** Availability view (which env vars / binaries exist). Defaults to the real environment. */
  env?: AvailabilityEnv;
  /**
   * When true, actually invoke the selected provider (spawns the real CLI — may cost money / block).
   * DEFAULT false: the Runtime resolves + reports readiness without an unsolicited paid call. Set
   * true only when the operator explicitly asks for a live run.
   */
  execute?: boolean;
  /**
   * Pin the provider to execute, bypassing the deterministic failover chain. The chain selects Claude
   * (primary) whenever Claude is AVAILABLE, so the OpenAI SDK — though AVAILABLE — is otherwise never
   * the executed provider. Setting this to "openai" is the explicit PROVE_OPENAI_PROVIDER_EXECUTION
   * proof path: it runs the OpenAI adapter directly (a live call). Selection architecture is untouched;
   * this is an operator override, never the default. Unset ⇒ normal Claude→OpenAI failover.
   */
  forceProvider?: "openai";
  /** Injected adapter options (test hook: a fake process runner exercises the real .execute() path). */
  claude?: ClaudeProviderOptions;
  openai?: OpenAIProviderOptions;
}

/** The single evidence object — the proof of a real, orchestrated provider call. */
export interface ActivationEvidence {
  capability: "Provider Activation";
  ranAt: string;
  policy: {
    mode: string;
    externalProvidersEnabled: boolean;
    defaultProvider: string;
    fallbackProvider: string;
    /** LOCAL_FIRST posture surfaced from runtime/config/provider-policy.json (default LOCAL_FIRST). */
    executionPolicy: string;
    localExecutionTarget: number;
    providerUse: string;
    enforced: true;
  };
  registry: { contractVersion: string; registered: string[] };
  orchestration: {
    contractVersion: string;
    decision: string;
    capability: string | null;
    selectedProvider: string | null;
    considered: string[];
  };
  execution: {
    attempted: boolean;
    executed: boolean;
    providerExecuted: boolean;
    classification: string | null;
    /** The normalized provider result on a real response; null otherwise. */
    response: { status: string; objectivesAddressed: string[]; changedFiles: string[]; notes: string | null } | null;
    /** The precise cause of failure / non-execution; null on success. */
    blocker: string | null;
  };
  failover: { selectedProvider: string | null; canContinue: boolean; providerLines: string[] };
  secretsExposed: false;
}

const DEFAULT_PROVIDERS: Array<{ id: string; priority: number }> = [
  { id: "claude", priority: 100 }, // primary
  { id: "openai", priority: 50 }, // failover
];

/** Build the provider descriptors from the policy (enablement gated by externalProvidersEnabled). */
function descriptorsFromPolicy(policy: ProviderPolicy): ProviderAdapterDescriptor[] {
  const enabled = policy.externalProvidersEnabled === true;
  const table = Array.isArray(policy.providers) && policy.providers.length > 0 ? policy.providers : DEFAULT_PROVIDERS;
  return table.map((p) => ({
    id: p.id,
    capabilities: [ENGINEERING_CAPABILITY],
    priority: p.priority,
    enabled,
  }));
}

/** Assemble a valid ProviderMission from the Runtime's mission shape (pure). */
function toProviderRequest(mission: ActivationMission): ProviderRequest {
  const providerMission: ProviderMission = {
    mission: mission.mission ?? "PROVIDER_ACTIVATION",
    priority: mission.priority ?? "P1",
    mode: (mission.mode ?? "ENGINEERING").toUpperCase(),
    objectives: (mission.objectives ?? []).map((o, i) => ({
      id: o.id ?? `OBJ-${i + 1}`,
      goal: o.goal ?? "",
      done_when: Array.isArray(o.done_when) ? o.done_when : [],
    })),
    definitionOfDone: Array.isArray(mission.definitionOfDone) ? mission.definitionOfDone : [],
    completion: [],
    authorizedPaths: Array.isArray(mission.authorizedPaths) ? mission.authorizedPaths : [],
    context: {
      repoRoot: process.cwd(),
      branch: "",
      headCommit: "",
      masterPlanObjectives: [],
      missingCapabilities: [],
    },
  };
  return { providerContractVersion: PROVIDER_CONTRACT_VERSION, mission: providerMission, model: "", maxTurns: 8 };
}

/**
 * Activate the Provider Registry + Orchestrator and, per the decision, run the selected provider.
 * Returns a single evidence object. Never throws on the mission path.
 */
export function activateAndExecute(mission: ActivationMission, opts: ActivationOptions = {}): ActivationEvidence {
  const policy: ProviderPolicy = opts.policy ?? {};
  const mode = policy.mode ?? "LOCAL_ONLY";
  const externalProvidersEnabled = policy.externalProvidersEnabled === true;
  const defaultProvider = policy.defaultProvider ?? "claude";
  const fallbackProvider = policy.fallbackProvider ?? "openai";
  // LOCAL_FIRST is the default posture: a provider is only ever the last resort behind local
  // execution + local recovery (enforced by AutonomyRuntimeAdapter.runPipeline). Surface it as
  // evidence on every activation so the posture is machine-visible, not just documented.
  const executionPolicy = policy.executionPolicy ?? "LOCAL_FIRST";
  const localExecutionTarget = typeof policy.localExecutionTarget === "number" ? policy.localExecutionTarget : 0.95;
  const providerUse = policy.providerUse ?? "ONLY_WHEN_LOCAL_IMPOSSIBLE";

  // 1) REGISTRY: register the concrete providers, then snapshot into the ORCHESTRATOR. This is the
  //    activation — Registry is the source of truth for discovery, Orchestrator owns selection.
  const registry = new ProviderRegistry();
  const orchestrator = new ProviderOrchestrator();
  const descriptors = descriptorsFromPolicy(policy);
  for (const d of descriptors) {
    registry.register({ providerRegistryContractVersion: PROVIDER_REGISTRY_CONTRACT_VERSION, descriptor: d });
  }
  for (const d of registry.list()) {
    orchestrator.register({ id: d.id, capabilities: [...d.capabilities], priority: d.priority, enabled: d.enabled });
  }

  // 2) ORCHESTRATE: capability FIRST, then deterministic provider selection.
  const orch = orchestrator.orchestrate({
    providerOrchestratorContractVersion: PROVIDER_ORCHESTRATOR_CONTRACT_VERSION,
    mission,
  });

  const base = {
    capability: "Provider Activation" as const,
    ranAt: new Date().toISOString(),
    policy: { mode, externalProvidersEnabled, defaultProvider, fallbackProvider, executionPolicy, localExecutionTarget, providerUse, enforced: true as const },
    registry: {
      contractVersion: PROVIDER_REGISTRY_CONTRACT_VERSION,
      registered: registry.list().map((d) => `${d.id}(priority=${d.priority}, enabled=${d.enabled})`),
    },
    secretsExposed: false as const,
  };

  if (!orch.ok) {
    return {
      ...base,
      orchestration: { contractVersion: PROVIDER_ORCHESTRATOR_CONTRACT_VERSION, decision: "MALFORMED", capability: null, selectedProvider: null, considered: [] },
      execution: { attempted: false, executed: false, providerExecuted: false, classification: null, response: null, blocker: orch.error.message },
      failover: { selectedProvider: null, canContinue: false, providerLines: [] },
    };
  }

  const outcome = orch.outcome;
  const orchestration = {
    contractVersion: PROVIDER_ORCHESTRATOR_CONTRACT_VERSION,
    decision: outcome.decision,
    capability: outcome.capability,
    selectedProvider: outcome.provider ? outcome.provider.id : null,
    considered: outcome.considered.map((d) => d.id),
  };

  // No provider needed (read-only / audit mission) — capability-before-provider honoured; done.
  if (outcome.decision === "NO_PROVIDER_NEEDED") {
    return {
      ...base,
      orchestration,
      execution: { attempted: false, executed: false, providerExecuted: false, classification: null, response: null, blocker: null },
      failover: { selectedProvider: null, canContinue: true, providerLines: ["no provider needed — Runtime handles this mission locally"] },
    };
  }

  // A capability was needed but no enabled provider serves it — precise cause (e.g. policy disabled).
  if (outcome.decision === "NO_PROVIDER_AVAILABLE") {
    const blocker = externalProvidersEnabled
      ? "No enabled provider serves the required engineering capability."
      : `Policy denies external providers (mode=${mode}, externalProvidersEnabled=false). Enable them in runtime/config/provider-policy.json to allow real calls.`;
    return {
      ...base,
      orchestration,
      execution: { attempted: false, executed: false, providerExecuted: false, classification: "BLOCKED", response: null, blocker },
      failover: { selectedProvider: null, canContinue: false, providerLines: [blocker] },
    };
  }

  // 3) PROVIDER_SELECTED → hand to the real execution bridge. execute:false resolves + reports
  //    readiness WITHOUT an unsolicited paid call; execute:true spawns the real provider CLI.
  const request = toProviderRequest(mission);
  const env = opts.env ?? defaultAvailabilityEnv();

  // 3a) EXPLICIT OpenAI proof path (PROVE_OPENAI_PROVIDER_EXECUTION). The failover chain would select
  //     Claude (primary) since Claude is AVAILABLE, so a real OpenAI call would never occur. When the
  //     operator pins "openai", execute the OpenAI adapter directly — a live SDK call — and record a
  //     secret-free real-call proof. No selection/failover/orchestrator code is changed.
  if (opts.forceProvider === "openai") {
    const adapter = new OpenAIProviderAdapter({
      ...opts.openai,
      proofPath: opts.openai?.proofPath ?? path.join("runtime", "generated", "openai-provider-execution.json"),
    });
    const outcome = adapter.execute(request);
    const res = outcome.result;
    return {
      ...base,
      orchestration,
      execution: {
        attempted: true,
        executed: true,
        providerExecuted: outcome.providerExecuted,
        classification: outcome.classification,
        response: res ? { status: res.status, objectivesAddressed: res.objectivesAddressed, changedFiles: res.changedFiles, notes: res.notes ?? null } : null,
        blocker: res ? res.blocker : null,
      },
      failover: {
        selectedProvider: outcome.provider,
        canContinue: outcome.classification !== "BLOCKED",
        providerLines: [`${outcome.provider}: ${outcome.classification}${outcome.sessionId ? ` (id=${outcome.sessionId})` : ""}`, ...outcome.diagnostics],
      },
    };
  }

  const run = runMissionWithFailover(request, {
    env,
    claude: opts.claude,
    openai: opts.openai,
    execute: opts.execute === true,
  });

  const res = run.outcome ? run.outcome.result : null;
  return {
    ...base,
    orchestration,
    execution: {
      attempted: true,
      executed: run.executed,
      providerExecuted: run.outcome ? run.outcome.providerExecuted : false,
      classification: run.outcome ? run.outcome.classification : (run.report.canContinue ? "READY" : "BLOCKED"),
      response: res ? { status: res.status, objectivesAddressed: res.objectivesAddressed, changedFiles: res.changedFiles, notes: res.notes ?? null } : null,
      blocker: run.outcome ? (res ? res.blocker : null) : (run.report.canContinue ? null : run.report.haltNextAction),
    },
    failover: {
      selectedProvider: run.report.selectedProvider,
      canContinue: run.report.canContinue,
      providerLines: run.report.providerLines,
    },
  };
}

/** Read + parse the runtime provider policy (best-effort; returns {} when absent/unreadable). */
export function readProviderPolicy(policyPath = path.join("runtime", "config", "provider-policy.json")): ProviderPolicy {
  try {
    return JSON.parse(fs.readFileSync(policyPath, "utf8")) as ProviderPolicy;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Direct invocation (the Business-Capability socle spawns this via tsx):
//   tsx src/runtime/provider-activation.ts <mission.json> <out-evidence.json> [--execute]
// Writes the evidence JSON and exits 0 (evidence written) / 1 (could not write).
// ---------------------------------------------------------------------------
const invokedDirectly =
  typeof process !== "undefined" && Array.isArray(process.argv) && typeof process.argv[1] === "string" && /provider-activation\.(ts|js)$/.test(process.argv[1]);

if (invokedDirectly) {
  const missionArg = process.argv[2];
  const outArg = process.argv[3] || path.join("runtime", "generated", "provider-activation.json");
  const execute = process.argv.includes("--execute");
  // `--provider openai` (or `--openai`) pins the OpenAI adapter for an explicit live proof; pinning
  // implies execution (a pinned proof is inherently a live run).
  const provIdx = process.argv.indexOf("--provider");
  const forceProvider = process.argv.includes("--openai") || process.argv[provIdx + 1] === "openai" ? "openai" : undefined;
  let mission: ActivationMission = { mode: "ENGINEERING", requiresEngineering: true, mission: "PROVIDER_ACTIVATION_SMOKE" };
  try {
    if (missionArg && fs.existsSync(missionArg)) mission = JSON.parse(fs.readFileSync(missionArg, "utf8")) as ActivationMission;
  } catch {
    /* fall back to the default smoke mission */
  }
  const evidence = activateAndExecute(mission, { policy: readProviderPolicy(), execute: execute || forceProvider === "openai", forceProvider });
  try {
    fs.mkdirSync(path.dirname(outArg), { recursive: true });
    fs.writeFileSync(outArg, JSON.stringify(evidence, null, 2));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`provider-activation: could not write evidence: ${String((err as Error)?.message ?? err)}\n`);
    process.exit(1);
  }
}
