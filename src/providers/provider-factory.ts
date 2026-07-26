/*
 * Provider Factory — deterministic engineering-provider selection with failover (contract §10)
 *
 * ODG owns the decision of WHICH provider executes a mission. Today that is a fixed, ordered
 * preference — Claude first, OpenAI as the failover — resolved by probing each provider's
 * availability (provider-availability.ts) BEFORE any paid call:
 *
 *   1. Probe every candidate in preference order (pure function of the injected env).
 *   2. Select the first AVAILABLE candidate and hand it back, already constructed.
 *   3. If Claude is unavailable, fail over to OpenAI (mission objective 1).
 *   4. If NO candidate is available, return a structured halt that names — for the failover target —
 *      the exact blocking component, the exact missing configuration, and the single next action,
 *      so the Runtime stops ONLY when no provider can continue and can say precisely why (objectives
 *      3–7). No exception is ever thrown: the decision is always returned as data.
 *
 * This module imports only sibling provider code (never src/core / src/contracts), so it preserves
 * the port's zero-coupling discipline. Selection is deterministic — same env ⇒ same decision.
 */

import { spawnSync } from "node:child_process";

import { createClaudeProvider } from "./claude-provider-adapter";
import { createOpenAIProvider, OpenAIProviderAdapter } from "./openai-provider-adapter";
import type { ClaudeProviderOptions, ProviderProcessRunner } from "./claude-provider-adapter";
import type { OpenAIProviderOptions } from "./openai-provider-adapter";
import {
  available,
  unavailable,
  type AvailabilityCheck,
  type AvailabilityEnv,
  type ProviderAvailability,
} from "./provider-availability";
import type { EngineeringProviderPort } from "./provider-port";

/** The role a candidate plays in the ordered chain. */
export type ProviderRole = "primary" | "failover";

/** A provider ODG may select — its availability probe and its lazy constructor. */
export interface FailoverCandidate {
  name: string;
  role: ProviderRole;
  /** Pure availability verdict for the injected env — never spawns a paid call. */
  probe: (env: AvailabilityEnv) => ProviderAvailability;
  /** Construct the provider port. Called ONLY after the candidate is selected (cost minimization). */
  create: () => EngineeringProviderPort;
}

/** Actionable halt payload — populated only when no provider can continue (objectives 3–7). */
export interface FailoverHalt {
  /** Why the Runtime must stop — one line per exhausted provider. */
  explanation: string;
  /** The precise component that blocks the failover target (objective 4). */
  blockingComponent: string;
  /** The exact configuration / resource missing on the failover target (objective 5). */
  missingConfiguration: string;
  /** The single next action required to restore a usable provider (objective 6). */
  nextAction: string;
}

/** The result of resolving the provider chain — always data, never thrown. */
export interface FailoverDecision {
  /** The selected provider port, or null when none can continue. */
  selected: EngineeringProviderPort | null;
  /** Name of the selected provider, or null. */
  selectedProvider: string | null;
  /** Role of the selected provider, or null. */
  selectedRole: ProviderRole | null;
  /** True when a provider was selected — i.e. the engineering mission CAN continue (objective 2/7). */
  canContinue: boolean;
  /** Every candidate's availability verdict, in preference order (evidence). */
  attempts: ProviderAvailability[];
  /**
   * Availability of the designated OpenAI failover target — ALWAYS present, whether or not it was
   * needed. This is what answers objectives 3–6 ("if OpenAI cannot be used, explain exactly why")
   * even on the happy path where Claude is available and OpenAI is never invoked.
   */
  failoverTarget: ProviderAvailability | null;
  /** Halt payload when `canContinue` is false; null otherwise. */
  halt: FailoverHalt | null;
}

// --- credential / binary constants -----------------------------------------

/** Claude authenticates via one of these (an API key or a logged-in Claude Code session token). */
export const CLAUDE_CREDENTIAL_ENVS = ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"] as const;
const CLAUDE_BIN = "claude";

// --- availability probes ----------------------------------------------------

/** Default env probe used at the Runtime edge: reads process.env and resolves binaries via PATH. */
export function defaultAvailabilityEnv(runner: ProviderProcessRunner = defaultRunner): AvailabilityEnv {
  return {
    env: process.env,
    hasBinary: (bin) => {
      // `command -v` is a SHELL BUILTIN, not an executable — spawning it directly (as
      // `runner("command", …)` did) fails with ENOENT and made EVERY binary look absent, so the
      // Claude provider was always reported UNAVAILABLE even with `claude` on PATH. Run it through
      // a shell so PATH resolution actually happens. `bin` is a controlled constant (claude/codex).
      const r = runner("sh", ["-c", `command -v ${bin}`], { cwd: process.cwd() });
      return r.status === 0 && r.stdout.trim().length > 0;
    },
  };
}

/**
 * Claude availability probe. The Claude adapter itself is not modified; its two prerequisites — the
 * `claude` CLI and a credential (API key OR Claude Code session token) — are inspected here.
 */
export function claudeAvailability(env: AvailabilityEnv): ProviderAvailability {
  const name = "claude-code";
  const credentialEnv = CLAUDE_CREDENTIAL_ENVS.find((k) => {
    const v = env.env[k];
    return typeof v === "string" && v !== "";
  });
  const hasCredential = credentialEnv !== undefined;
  const hasBin = env.hasBinary(CLAUDE_BIN);
  const checks: AvailabilityCheck[] = [
    {
      requirement: `env:${CLAUDE_CREDENTIAL_ENVS.join("|")}`,
      satisfied: hasCredential,
      detail: hasCredential ? `${credentialEnv} is set` : `none of ${CLAUDE_CREDENTIAL_ENVS.join(", ")} is set`,
    },
    {
      requirement: `binary:${CLAUDE_BIN}`,
      satisfied: hasBin,
      detail: hasBin ? `\`${CLAUDE_BIN}\` found on PATH` : `\`${CLAUDE_BIN}\` not found on PATH`,
    },
  ];
  if (hasCredential && hasBin) return available(name, checks);
  if (!hasBin) {
    return unavailable(name, {
      blockingComponent: `${name} engineering-CLI preflight`,
      missingConfiguration: `executable \`${CLAUDE_BIN}\` (Claude Code CLI) on PATH`,
      nextAction: `Install the Claude Code CLI so \`${CLAUDE_BIN}\` resolves on PATH.`,
      checks,
    });
  }
  return unavailable(name, {
    blockingComponent: `${name} credential preflight`,
    missingConfiguration: `a Claude credential (${CLAUDE_CREDENTIAL_ENVS.join(" or ")})`,
    nextAction: `Authenticate Claude Code or export ${CLAUDE_CREDENTIAL_ENVS[0]}.`,
    checks,
  });
}

// --- chain construction ------------------------------------------------------

export interface FailoverChainOptions {
  claude?: ClaudeProviderOptions;
  openai?: OpenAIProviderOptions;
}

/**
 * The default ordered chain: Claude (primary) → OpenAI (failover). Mirrors mission objective 1
 * ("use the OpenAI provider if Claude is unavailable"). Probes are lazy constructors so no paid
 * client is built until a provider is actually selected.
 */
export function createDefaultFailoverChain(opts: FailoverChainOptions = {}): FailoverCandidate[] {
  const openaiProbe = new OpenAIProviderAdapter(opts.openai);
  return [
    {
      name: "claude-code",
      role: "primary",
      probe: claudeAvailability,
      create: () => createClaudeProvider(opts.claude),
    },
    {
      name: openaiProbe.name,
      role: "failover",
      probe: (env) => openaiProbe.checkAvailability(env),
      create: () => createOpenAIProvider(opts.openai),
    },
  ];
}

// --- selection ---------------------------------------------------------------

/**
 * Resolve the chain: probe in order, select the first available, and — when none is available —
 * assemble the halt payload from the designated failover target. Pure w.r.t. the injected env.
 */
export function selectProviderWithFailover(
  candidates: FailoverCandidate[],
  env: AvailabilityEnv,
): FailoverDecision {
  const attempts = candidates.map((c) => c.probe(env));
  const failoverIndex = candidates.findIndex((c) => c.role === "failover");
  const failoverTarget = failoverIndex >= 0 ? attempts[failoverIndex] : (attempts[attempts.length - 1] ?? null);

  const selectedIndex = attempts.findIndex((a) => a.available);
  if (selectedIndex >= 0) {
    const chosen = candidates[selectedIndex];
    return {
      selected: chosen.create(),
      selectedProvider: chosen.name,
      selectedRole: chosen.role,
      canContinue: true,
      attempts,
      failoverTarget,
      halt: null,
    };
  }

  // No provider can continue → stop (objective 7) with the precise, actionable reason. The single
  // next action targets the failover provider (OpenAI) — the designated continuation path — while
  // the explanation enumerates every exhausted provider.
  const target = failoverTarget ?? attempts[attempts.length - 1] ?? null;
  const explanation = attempts
    .map((a) => `${a.provider}: ${a.missingConfiguration ?? "available"} (${a.blockingComponent ?? "n/a"})`)
    .join(" | ");
  const halt: FailoverHalt = {
    explanation: `No engineering provider can continue. ${explanation}`,
    blockingComponent: target?.blockingComponent ?? "unknown",
    missingConfiguration: target?.missingConfiguration ?? "unknown",
    nextAction: target?.nextAction ?? "Provision at least one engineering provider.",
  };
  return {
    selected: null,
    selectedProvider: null,
    selectedRole: null,
    canContinue: false,
    attempts,
    failoverTarget,
    halt,
  };
}

/** Convenience: build the default chain and resolve it against the (optionally injected) env. */
export function resolveEngineeringProvider(
  opts: FailoverChainOptions = {},
  env: AvailabilityEnv = defaultAvailabilityEnv(),
): FailoverDecision {
  return selectProviderWithFailover(createDefaultFailoverChain(opts), env);
}

const defaultRunner: ProviderProcessRunner = (bin, args, o) => {
  const r = spawnSync(bin, args, { cwd: o.cwd, timeout: o.timeoutMs, encoding: "utf8" });
  return {
    status: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    signal: r.signal ?? null,
  };
};
