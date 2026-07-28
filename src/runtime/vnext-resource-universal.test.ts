/*
 * VNext Universal Resource preparation — deterministic unit test.
 *
 * Run directly with tsx (no repository, provider or network — every effect is offline/injected):
 *   node_modules/.bin/tsx src/runtime/vnext-resource-universal.test.ts
 *
 * Asserts the ADDITIVE contract of the universal-resource layer:
 *   - The Resource Registry declares resources by config; enable/disable/replace need no code.
 *   - The config catalog declares OpenAI/Anthropic/Gemini/Ollama/Mistral/Azure/local/internal,
 *     all DISABLED, with credentials referenced by env-var NAME only (no keys, no network).
 *   - ConfiguredResource availability is deterministic + offline (disabled / missing-env / granted).
 *   - The Resource Allocation Engine selects by constraints/policy/strategy; the Resource never decides.
 */

import { ProviderResource } from "./vnext/resource";
import {
  ResourceRegistry,
  ConfiguredResource,
  type ResourceDescriptor,
} from "./vnext/resource-registry";
import {
  SUPPORTED_RESOURCES,
  SUPPORTED_RESOURCE_IDS,
  loadResourceConfig,
} from "./vnext/resource-config";
import { ResourceAllocationEngine } from "./vnext/resource-allocation-engine";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}

// 1. Config catalog — the declared extension points.
{
  console.log("Config catalog (declaration only)");
  for (const id of ["openai", "anthropic", "gemini", "ollama", "mistral", "azure-openai", "local", "internal"]) {
    check(SUPPORTED_RESOURCE_IDS.includes(id), `catalog declares '${id}'`);
  }
  check(SUPPORTED_RESOURCES.every((r) => r.enabled === false), "every catalog resource is DISABLED by default");
  // No key VALUES anywhere — credentials are referenced by env-var NAME only.
  const serialized = JSON.stringify(SUPPORTED_RESOURCES);
  check(!/sk-|api[_-]?key"\s*:\s*"[^"]+"/i.test(serialized), "no hardcoded key values in the catalog");
  check(SUPPORTED_RESOURCES.filter((r) => r.config?.apiKeyEnv).every((r) => /_API_KEY$|_KEY$/.test(r.config!.apiKeyEnv!)), "credentials referenced by env-var NAME only");
  // On-disk config loads (or falls back to the safe catalog) without throwing.
  const cfg = loadResourceConfig();
  check(Array.isArray(cfg.resources) && cfg.resources.length >= 8, "resource config loads with the full catalog");
  check(cfg.resources.every((r) => r.enabled === false), "on-disk config keeps every resource disabled");
}

// 2. Registry — declare / enable / disable / replace by config, no code.
{
  console.log("Resource Registry (config-driven lifecycle)");
  const reg = new ResourceRegistry({ /* empty env — nothing available */ });
  reg.loadDescriptors([...SUPPORTED_RESOURCES]);
  check(reg.list().length === SUPPORTED_RESOURCES.length, "loads the full catalog");
  check(reg.listEnabled().length === 0, "nothing enabled ⇒ nothing resolves (Local First / manual)");

  check(reg.enable("ollama") === true, "enable('ollama') succeeds");
  check(reg.listEnabled().some((d) => d.id === "ollama"), "ollama now enabled");
  check(reg.resolveEnabled().length === 1, "exactly one resource resolves when one is enabled");

  check(reg.disable("ollama") === true && reg.listEnabled().length === 0, "disable('ollama') removes it from allocation");

  // Replace = swap implementation without code.
  const swapped: ResourceDescriptor = { id: "ollama", kind: "LOCAL", type: "local", enabled: true, config: { command: "llamafile" } };
  reg.replace(swapped);
  check(reg.descriptor("ollama")?.type === "local", "replace() swaps a resource in place");

  // Duplicate id guarded; replace is the intentional override.
  let threw = false;
  try {
    reg.register(swapped);
  } catch {
    threw = true;
  }
  check(threw, "register() rejects a duplicate id (use replace)");
}

// 3. ConfiguredResource — deterministic, offline availability.
{
  console.log("ConfiguredResource (offline availability)");
  const disabled = new ConfiguredResource({ id: "openai", kind: "PROVIDER", type: "openai", enabled: false, config: { apiKeyEnv: "OPENAI_API_KEY" } }, {});
  check(disabled.allocate().granted === false && disabled.allocate().reason === "resource disabled", "disabled resource is not granted");

  const noKey = new ConfiguredResource({ id: "openai", kind: "PROVIDER", type: "openai", enabled: true, config: { apiKeyEnv: "OPENAI_API_KEY" } }, {});
  const v = noKey.allocate();
  check(v.granted === false && v.reason === "missing credential env var OPENAI_API_KEY", "enabled-but-no-key names the missing env var (not its value)");

  const present = new ConfiguredResource({ id: "openai", kind: "PROVIDER", type: "openai", enabled: true, config: { apiKeyEnv: "OPENAI_API_KEY" } }, { OPENAI_API_KEY: "x" });
  check(present.allocate().granted === true, "enabled + env-var present ⇒ granted (presence only, value never read)");

  const local = new ConfiguredResource({ id: "local", kind: "LOCAL", type: "local", enabled: true, config: { command: "run.sh" } }, {});
  check(local.allocate().granted === true, "a local resource with no key requirement is granted when enabled");
}

// 4. Resource Allocation Engine — Runtime decides, Resource never does.
{
  console.log("Resource Allocation Engine (policy/constraints/strategy)");
  const engine = new ResourceAllocationEngine();
  const env = { OPENAI_API_KEY: "x", ANTHROPIC_API_KEY: "x" };
  const openai = new ConfiguredResource({ id: "openai", kind: "PROVIDER", type: "openai", enabled: true, config: { apiKeyEnv: "OPENAI_API_KEY" } }, env);
  const anthropic = new ConfiguredResource({ id: "anthropic", kind: "PROVIDER", type: "anthropic", enabled: true, config: { apiKeyEnv: "ANTHROPIC_API_KEY" } }, env);
  const localLlm = new ConfiguredResource({ id: "ollama", kind: "LOCAL", type: "ollama", enabled: true }, env);
  const resources = [openai, anthropic, localLlm];
  const request = { mission: "M1" };

  // Local First (default): the LOCAL resource wins over hosted PROVIDERs.
  const d1 = engine.allocate({ request, resources });
  check(d1.selectedResourceId === "ollama", "Local First selects the LOCAL resource over PROVIDERs");
  check(d1.considered.length === 3, "every resource is considered (evidence)");

  // Strategy preference overrides Local First.
  const d2 = engine.allocate({ request, resources, strategy: { preferredResourceIds: ["anthropic"] } });
  check(d2.selectedResourceId === "anthropic", "strategy preference selects the preferred PROVIDER");

  // Constraint: only PROVIDER kind eligible.
  const d3 = engine.allocate({ request, resources, constraints: { allowedKinds: ["PROVIDER"] } });
  check(d3.selectedResourceId === "openai" || d3.selectedResourceId === "anthropic", "allowedKinds restricts selection to PROVIDERs");

  // Policy offlineOnly forbids hosted PROVIDERs.
  const d4 = engine.allocate({ request, resources: [openai, anthropic], policy: { offlineOnly: true } });
  check(d4.selected === null && /no eligible/.test(d4.reason), "offlineOnly with only PROVIDERs ⇒ nothing eligible");

  // Nothing granted ⇒ decision null with an actionable reason (no throw — data only).
  const blocked = new ConfiguredResource({ id: "gemini", kind: "PROVIDER", type: "gemini", enabled: true, config: { apiKeyEnv: "GOOGLE_API_KEY" } }, {});
  const d5 = engine.allocate({ request, resources: [blocked] });
  check(d5.selected === null && d5.considered[0].allocation.reason === "missing credential env var GOOGLE_API_KEY", "blocked resource surfaces exact reason, engine returns null");
}

// 5. Existing ProviderResource still works as a Resource (no regression to the previous layer).
{
  console.log("Compatibility with existing ProviderResource");
  const engine = new ResourceAllocationEngine();
  const claude = new ProviderResource({ provider: "claude", available: true });
  const d = engine.allocate({ request: { mission: "M1" }, resources: [claude] });
  check(d.selectedResourceId === "provider:claude", "a ProviderResource is a first-class Resource to the engine");
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
