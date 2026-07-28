/*
 * VNext — Resource configuration catalog (ADDITIVE, declaration-only)
 *
 * The declared extension points for every execution resource the Runtime is being prepared to
 * use. This module CONNECTS NOTHING: each entry is a `ResourceDescriptor` that is DISABLED by
 * default and references its credential only by env-var NAME. Enabling a resource is a config
 * action (registry.enable / edit runtime/config/resources.json), not a code change.
 *
 * Mirrors the frozen local-first posture in runtime/config/runtime-mode.json
 * (`providersEnabled: false`, `providerActivation: MANUAL_ONLY`).
 */

import fs from "node:fs";
import path from "node:path";
import type { ResourceDescriptor } from "./resource-registry";

export const RESOURCE_CONFIG_VERSION = "RESOURCE_CONFIG_V1";

/** Default on-disk config location (repo-relative). Declarative; safe to commit (no secrets). */
export const DEFAULT_RESOURCE_CONFIG_PATH = "runtime/config/resources.json";

/**
 * Built-in catalog of supported resources. All DISABLED. `apiKeyEnv` is the env var NAME the
 * resource would read at run time — never a value. Local/internal resources need no key.
 */
export const SUPPORTED_RESOURCES: readonly ResourceDescriptor[] = [
  { id: "anthropic", kind: "PROVIDER", type: "anthropic", enabled: false, priority: 50, config: { apiKeyEnv: "ANTHROPIC_API_KEY", model: "claude-opus-4-8" } },
  { id: "openai", kind: "PROVIDER", type: "openai", enabled: false, priority: 40, config: { apiKeyEnv: "OPENAI_API_KEY", model: "" } },
  { id: "gemini", kind: "PROVIDER", type: "gemini", enabled: false, priority: 30, config: { apiKeyEnv: "GOOGLE_API_KEY", model: "" } },
  { id: "mistral", kind: "PROVIDER", type: "mistral", enabled: false, priority: 30, config: { apiKeyEnv: "MISTRAL_API_KEY", model: "" } },
  { id: "azure-openai", kind: "PROVIDER", type: "azure-openai", enabled: false, priority: 30, config: { apiKeyEnv: "AZURE_OPENAI_API_KEY", baseUrl: "", model: "" } },
  { id: "ollama", kind: "LOCAL", type: "ollama", enabled: false, priority: 60, config: { baseUrl: "http://localhost:11434", model: "" } },
  { id: "local", kind: "LOCAL", type: "local", enabled: false, priority: 70, config: { command: "" } },
  { id: "internal", kind: "TOOL", type: "internal", enabled: false, priority: 80, config: { command: "" } },
];

/** The IDs the catalog supports (for validation / docs). */
export const SUPPORTED_RESOURCE_IDS: readonly string[] = SUPPORTED_RESOURCES.map((r) => r.id);

/** The persisted config file shape. */
export interface ResourceConfigFile {
  version: number;
  /** Overall posture; mirrors runtime-mode.json. Advisory to the allocation engine. */
  mode?: string;
  resources: ResourceDescriptor[];
}

/**
 * Load the resource config from disk, resilient: when the file is absent or unreadable it returns
 * the built-in catalog (all disabled) so the Runtime always has a valid, safe default. Never throws.
 */
export function loadResourceConfig(
  cwd: string = process.cwd(),
  file: string = DEFAULT_RESOURCE_CONFIG_PATH,
): ResourceConfigFile {
  try {
    const raw = fs.readFileSync(path.resolve(cwd, file), "utf8");
    const parsed = JSON.parse(raw) as ResourceConfigFile;
    if (Array.isArray(parsed?.resources)) {
      return { version: parsed.version ?? 1, mode: parsed.mode, resources: parsed.resources };
    }
  } catch {
    /* fall through to the safe built-in default */
  }
  return { version: 1, mode: "LOCAL", resources: [...SUPPORTED_RESOURCES] };
}

/** Deterministic JSON rendering of the built-in catalog — used to author runtime/config/resources.json. */
export function renderDefaultResourceConfig(): string {
  const file: ResourceConfigFile = { version: 1, mode: "LOCAL", resources: [...SUPPORTED_RESOURCES] };
  return JSON.stringify(file, null, 2);
}
