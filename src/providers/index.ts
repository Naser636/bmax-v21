/*
 * Providers — public surface for the ODG engineering-provider boundary.
 *
 * ODG depends only on EngineeringProviderPort + missionRequiresProvider. Adding OpenAI / Gemini /
 * Codex (contract §10) means adding a class that implements the port and re-exporting it here —
 * nothing in src/core or src/contracts changes.
 */

export {
  PROVIDER_CONTRACT_VERSION,
  FROZEN_ROOTS,
  GUARDRAIL_SYSTEM_PROMPT,
  isFrozenPath,
  missionRequiresProvider,
  renderMissionPrompt,
  toPipelineFailure,
  toPipelineOutcome,
} from "./provider-port";

export type {
  EngineeringProviderPort,
  PipelineFailureData,
  ProviderClassification,
  ProviderContext,
  ProviderDescription,
  ProviderMission,
  ProviderObjective,
  ProviderOutcome,
  ProviderRequest,
  ProviderResult,
  RoutableMission,
} from "./provider-port";

export {
  ClaudeProviderAdapter,
  createClaudeProvider,
} from "./claude-provider-adapter";

export type {
  ClaudeProviderOptions,
  ProviderProcessResult,
  ProviderProcessRunner,
} from "./claude-provider-adapter";
