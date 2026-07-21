import { ProviderOrchestrator } from "@/core/provider-orchestrator";
import { PROVIDER_ORCHESTRATOR_CONTRACT_VERSION } from "@/contracts/provider-orchestrator";
import { ENGINEERING_CAPABILITY } from "@/contracts/provider-capability";
import type { ProviderAdapterDescriptor } from "@/contracts/provider-adapter";
import type { RoutableMission } from "@/providers";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const V = PROVIDER_ORCHESTRATOR_CONTRACT_VERSION;
const req = (mission: RoutableMission) => ({ providerOrchestratorContractVersion: V, mission });

// FAKE descriptors only — no real provider is integrated in Mission 3.
const claude: ProviderAdapterDescriptor = { id: "claude", capabilities: [ENGINEERING_CAPABILITY], priority: 10, enabled: true };
const alt: ProviderAdapterDescriptor = { id: "alt", capabilities: [ENGINEERING_CAPABILITY], priority: 10, enabled: true };
const local: ProviderAdapterDescriptor = { id: "local-lint", capabilities: ["lint"], priority: 99, enabled: true };
const disabled: ProviderAdapterDescriptor = { id: "z-disabled", capabilities: [ENGINEERING_CAPABILITY], priority: 999, enabled: false };

// describe / initialize — owner is the RUNTIME (decisions stay Runtime-owned).
const cap = new ProviderOrchestrator();
const d = cap.describe();
check(d.class === "capability" && d.owner === "Runtime", "describe: capability OWNED BY RUNTIME");
check(cap.initialize().ready === true, "initialize ready");

// registration of MULTIPLE providers (item 5)
check(cap.register(claude).ok === true, "register: first provider accepted");
check(cap.register(alt).ok === true, "register: second provider accepted");
check(cap.register(local).ok === true, "register: third provider (other capability) accepted");
check(cap.register(disabled).ok === true, "register: disabled provider accepted (registered, not selectable)");
check(cap.listProviders().length === 4, "register: four providers registered");

// duplicate id rejected — no duplicate
const dup = cap.register({ ...claude });
check(dup.ok === false && dup.error.code === "DUPLICATE_PROVIDER", "register: duplicate id rejected");

// malformed descriptor rejected
const badReg = cap.register({ id: "", capabilities: [], priority: 1, enabled: true });
check(badReg.ok === false && badReg.error.code === "INPUTS_MALFORMED", "register: malformed descriptor rejected");

// resolveCapability — capability resolved FIRST
check(cap.resolveCapability({ requiresEngineering: true }).capability === ENGINEERING_CAPABILITY, "capability: engineering mission resolves to ENGINEERING");
check(cap.resolveCapability({ mode: "AUDIT" }).needed === false, "capability: a read-only mission needs no provider");

// capability BEFORE provider (item 6): a local mission selects NO provider even though providers exist
const localOutcome = cap.orchestrate(req({ mode: "AUDIT" }));
check(
  localOutcome.ok === true && localOutcome.outcome.decision === "NO_PROVIDER_NEEDED" &&
    localOutcome.outcome.capability === null && localOutcome.outcome.provider === null &&
    localOutcome.outcome.considered.length === 0,
  "order: no capability needed ⇒ NO provider is ever considered (capability-before-provider)",
);

// PROVIDER_SELECTED — highest priority wins
const highWins = cap.orchestrate(req({ requiresEngineering: true }));
check(highWins.ok === true && highWins.outcome.decision === "PROVIDER_SELECTED", "select: an engineering mission selects a provider");
// claude and alt both priority 10 → tie broken by id asc ⇒ "alt"
check(highWins.ok === true && highWins.outcome.provider?.id === "alt", "select: equal priority tie broken deterministically by id (asc)");
check(
  highWins.ok === true && !highWins.outcome.considered.some((p) => p.id === "z-disabled" || p.id === "local-lint"),
  "select: disabled and non-matching-capability providers are excluded",
);

// higher priority beats id tie-break
const cap2 = new ProviderOrchestrator();
cap2.register({ id: "b-top", capabilities: [ENGINEERING_CAPABILITY], priority: 50, enabled: true });
cap2.register({ id: "a-low", capabilities: [ENGINEERING_CAPABILITY], priority: 5, enabled: true });
const byPrio = cap2.orchestrate(req({ requiresEngineering: true }));
check(byPrio.ok === true && byPrio.outcome.provider?.id === "b-top", "select: higher priority wins over id order");

// NO_PROVIDER_AVAILABLE — capability needed but nobody serves it
const cap3 = new ProviderOrchestrator();
cap3.register({ id: "lintonly", capabilities: ["lint"], priority: 1, enabled: true });
const none = cap3.orchestrate(req({ requiresEngineering: true }));
check(none.ok === true && none.outcome.decision === "NO_PROVIDER_AVAILABLE" && none.outcome.capability === ENGINEERING_CAPABILITY, "select: capability needed but no serving provider ⇒ NO_PROVIDER_AVAILABLE");

// determinism — registration order does not change the selection
const capA = new ProviderOrchestrator();
capA.register(claude); capA.register(alt);
const capB = new ProviderOrchestrator();
capB.register(alt); capB.register(claude);
const rA = capA.orchestrate(req({ requiresEngineering: true }));
const rB = capB.orchestrate(req({ requiresEngineering: true }));
check(rA.ok && rB.ok && JSON.stringify(rA.outcome) === JSON.stringify(rB.outcome), "determinism: registration order does not affect the outcome");

// version incompatibility
const ver = cap.orchestrate({ providerOrchestratorContractVersion: "2.0.0", mission: { requiresEngineering: true } });
check(ver.ok === false && ver.error.code === "PROVIDER_ORCHESTRATOR_CONTRACT_INCOMPATIBLE", "version: major mismatch rejected");

if (failures > 0) { console.error(`\nProvider Orchestrator: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nProvider Orchestrator OK");
