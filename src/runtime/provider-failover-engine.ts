/*
 * Provider Failover Engine — Runtime-side orchestration of provider selection + failover
 *
 * Mission PROVIDER_FAILOVER_TO_OPENAI. The Runtime, not the provider, decides which engineering
 * provider executes a mission. This engine sits at the Runtime edge and turns the provider chain's
 * availability verdict (src/providers/provider-factory.ts) into a mission-level decision:
 *
 *   - Claude is the primary provider; OpenAI is the failover (objective 1).
 *   - When a provider is available, the engineering mission CONTINUES on it (objective 2) — the
 *     engine hands the mission to `selected.execute()`.
 *   - When OpenAI is the only remaining option and it too cannot run, the engine surfaces the EXACT
 *     reason: the blocking component, the missing configuration/resource, and the single next action
 *     (objectives 3–6) — always, even on the happy path, so the OpenAI status is never a mystery.
 *   - The Runtime STOPS only when NO provider can continue (objective 7).
 *
 * Everything is returned as data (no throws). The report is a pure function of the decision, so the
 * same environment yields byte-identical output (DETERMINISM_FIRST). This module imports only the
 * provider surface (never src/core / src/contracts), keeping the frozen foundation untouched.
 */

import {
  defaultAvailabilityEnv,
  resolveEngineeringProvider,
  type FailoverChainOptions,
  type FailoverDecision,
} from "@/providers/provider-factory";
import type { AvailabilityEnv, ProviderAvailability } from "@/providers/provider-availability";
import type { ProviderOutcome, ProviderRequest } from "@/providers/provider-port";

/**
 * Provider identity stamped on a synthesized outcome when the Runtime itself must stop because NO
 * port could run. It is deliberately not a real provider name — no port was invoked — so evidence
 * consumers can tell a Runtime-level halt apart from a provider-reported BLOCKED.
 */
export const RUNTIME_FAILOVER_HALT_PROVIDER = "runtime-failover";

/** Mission-level failover report — the human/machine-readable answer to objectives 3–7. */
export interface FailoverMissionReport {
  mission: string;
  /** Provider that will (or did) execute, or null when the Runtime must stop. */
  selectedProvider: string | null;
  /** True when the engineering mission can proceed (objective 2/7). */
  canContinue: boolean;
  /** Whether OpenAI — the failover target — is usable right now (objective 3 framing). */
  openaiUsable: boolean;
  /** If OpenAI is unusable: the precise blocking component (objective 4). Null when usable. */
  openaiBlockingComponent: string | null;
  /** If OpenAI is unusable: the exact missing configuration / resource (objective 5). Null when usable. */
  openaiMissingConfiguration: string | null;
  /** If OpenAI is unusable: the single next action to make it usable (objective 6). Null when usable. */
  openaiNextAction: string | null;
  /** When the whole chain is exhausted: the single next action to restore ANY provider (objective 7). */
  haltNextAction: string | null;
  /** One line per provider probed, in preference order (evidence, not narrative). */
  providerLines: string[];
}

/** The full result of running a mission through the failover engine. */
export interface FailoverRunResult {
  mission: string;
  decision: FailoverDecision;
  report: FailoverMissionReport;
  /** The provider outcome when the mission was executed; null on a dry run or when stopped. */
  outcome: ProviderOutcome | null;
  /** Whether a provider was actually invoked (false on dry run / halt). */
  executed: boolean;
}

export interface FailoverRunOptions extends FailoverChainOptions {
  /** Injected availability view. Defaults to the real environment at the edge. */
  env?: AvailabilityEnv;
  /**
   * When false, resolve + report WITHOUT invoking the selected provider (no paid call). Useful for
   * planning, health checks, and evidence capture. Defaults to true (execute the mission).
   */
  execute?: boolean;
}

/** Build the mission-level report from a resolved decision. Pure. */
export function buildFailoverReport(mission: string, decision: FailoverDecision): FailoverMissionReport {
  const target: ProviderAvailability | null = decision.failoverTarget;
  const openaiUsable = target?.available === true;
  const providerLines = decision.attempts.map((a) =>
    a.available
      ? `${a.provider}: AVAILABLE`
      : `${a.provider}: UNAVAILABLE — ${a.missingConfiguration} (${a.blockingComponent}); next: ${a.nextAction}`,
  );
  return {
    mission,
    selectedProvider: decision.selectedProvider,
    canContinue: decision.canContinue,
    openaiUsable,
    openaiBlockingComponent: openaiUsable ? null : target?.blockingComponent ?? null,
    openaiMissingConfiguration: openaiUsable ? null : target?.missingConfiguration ?? null,
    openaiNextAction: openaiUsable ? null : target?.nextAction ?? null,
    haltNextAction: decision.halt?.nextAction ?? null,
    providerLines,
  };
}

/** Render the report as a deterministic markdown block (for evidence / halt logs). */
export function renderFailoverReport(report: FailoverMissionReport): string {
  const lines: string[] = [];
  lines.push(`# Provider Failover Report — ${report.mission}`);
  lines.push("");
  lines.push(`- can_continue: ${report.canContinue}`);
  lines.push(`- selected_provider: ${report.selectedProvider ?? "(none — Runtime must stop)"}`);
  lines.push(`- openai_usable: ${report.openaiUsable}`);
  if (!report.openaiUsable) {
    lines.push(`- openai_blocking_component: ${report.openaiBlockingComponent}`);
    lines.push(`- openai_missing_configuration: ${report.openaiMissingConfiguration}`);
    lines.push(`- openai_next_action: ${report.openaiNextAction}`);
  }
  if (!report.canContinue) {
    lines.push(`- halt_next_action: ${report.haltNextAction}`);
  }
  lines.push("");
  lines.push("## Providers probed (preference order)");
  for (const l of report.providerLines) lines.push(`- ${l}`);
  return lines.join("\n");
}

/**
 * Synthesize a BLOCKED `ProviderOutcome` for the case where NO provider could continue (objective 7).
 * No port was invoked (`providerExecuted: false`), so the outcome carries — drawn straight from the
 * failover report — the precise blocking component (objective 4), the exact missing configuration
 * (objective 5) and the single next action (objective 6). This lets the Runtime halt with an
 * actionable reason through the SAME `ProviderOutcome → PipelineOutcome` seam a provider stop uses,
 * instead of a bare boolean. Pure: identical report ⇒ identical outcome.
 */
export function haltOutcome(request: ProviderRequest, report: FailoverMissionReport): ProviderOutcome {
  const blockingComponent = report.openaiBlockingComponent ?? "unknown";
  const missingConfiguration = report.openaiMissingConfiguration ?? "unknown";
  const nextAction = report.haltNextAction ?? report.openaiNextAction ?? "Provision at least one engineering provider.";
  const blocker = [
    "No engineering provider can continue.",
    `Blocking component: ${blockingComponent}.`,
    `Missing configuration: ${missingConfiguration}.`,
    `Next action: ${nextAction}`,
  ].join(" ");
  return {
    provider: RUNTIME_FAILOVER_HALT_PROVIDER,
    classification: "BLOCKED",
    providerExecuted: false,
    fromCache: false,
    result: {
      mission: request.mission.mission,
      providerContractVersion: request.providerContractVersion,
      status: "BLOCKED",
      objectivesAddressed: [],
      changedFiles: [],
      commandsRun: [],
      blocker,
      notes: report.providerLines.join(" | "),
    },
    sessionId: null,
    changedFiles: [],
    unauthorizedChanges: [],
    raw: { exitCode: null, stdout: "", stderr: "" },
    diagnostics: report.providerLines,
  };
}

/**
 * Resolve the provider chain for a mission and, unless a dry run is requested, execute it on the
 * selected provider. Always returns the decision + report; NEVER throws.
 */
export function runMissionWithFailover(
  request: ProviderRequest,
  opts: FailoverRunOptions = {},
): FailoverRunResult {
  const env = opts.env ?? defaultAvailabilityEnv();
  const decision = resolveEngineeringProvider({ claude: opts.claude, openai: opts.openai }, env);
  const report = buildFailoverReport(request.mission.mission, decision);

  const shouldExecute = opts.execute !== false;
  if (decision.canContinue && decision.selected && shouldExecute) {
    const outcome = decision.selected.execute(request);
    return { mission: request.mission.mission, decision, report, outcome, executed: true };
  }
  return { mission: request.mission.mission, decision, report, outcome: null, executed: false };
}
