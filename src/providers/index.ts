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

export {
  OpenAIProviderAdapter,
  createOpenAIProvider,
  OPENAI_API_KEY_ENV,
} from "./openai-provider-adapter";

export type { OpenAIProviderOptions } from "./openai-provider-adapter";

export {
  available,
  unavailable,
  isAvailabilityAware,
} from "./provider-availability";

export type {
  AvailabilityAware,
  AvailabilityCheck,
  AvailabilityEnv,
  ProviderAvailability,
} from "./provider-availability";

export {
  CLAUDE_CREDENTIAL_ENVS,
  claudeAvailability,
  createDefaultFailoverChain,
  defaultAvailabilityEnv,
  resolveEngineeringProvider,
  selectProviderWithFailover,
} from "./provider-factory";

export type {
  FailoverCandidate,
  FailoverChainOptions,
  FailoverDecision,
  FailoverHalt,
  ProviderRole,
} from "./provider-factory";
