import { ProviderRegistry } from "@/core/provider-registry";
import { PROVIDER_REGISTRY_CONTRACT_VERSION } from "@/contracts/provider-registry";
import { ENGINEERING_CAPABILITY } from "@/contracts/provider-capability";
import type { ProviderAdapterDescriptor } from "@/contracts/provider-adapter";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const V = PROVIDER_REGISTRY_CONTRACT_VERSION;
const reg = (descriptor: ProviderAdapterDescriptor) => ({ providerRegistryContractVersion: V, descriptor });
const dereg = (id: string) => ({ providerRegistryContractVersion: V, id });

const claude: ProviderAdapterDescriptor = { id: "claude", capabilities: [ENGINEERING_CAPABILITY], priority: 10, enabled: true };
const alt: ProviderAdapterDescriptor = { id: "alt", capabilities: [ENGINEERING_CAPABILITY], priority: 5, enabled: true };
const lint: ProviderAdapterDescriptor = { id: "lint", capabilities: ["lint"], priority: 1, enabled: true };
const off: ProviderAdapterDescriptor = { id: "off", capabilities: [ENGINEERING_CAPABILITY], priority: 99, enabled: false };

// describe / initialize — owner RUNTIME
const r = new ProviderRegistry();
const d = r.describe();
check(d.class === "capability" && d.owner === "Runtime", "describe: capability OWNED BY RUNTIME");
check(d.providerRegistryContractVersion === "1.0.0", "describe: contract version 1.0.0");
check(r.initialize().ready === true, "initialize ready");

// register multiple
check(r.register(reg(claude)).ok === true, "register: first provider accepted");
check(r.register(reg(alt)).ok === true, "register: second provider accepted");
check(r.register(reg(lint)).ok === true, "register: third provider accepted");
check(r.register(reg(off)).ok === true, "register: disabled provider accepted");
check(r.list().length === 4, "register: four providers registered");

// unique ids (item 4)
const dup = r.register(reg({ ...claude, priority: 1 }));
check(dup.ok === false && dup.error.code === "DUPLICATE_PROVIDER", "unique: duplicate id rejected");

// malformed / version
check(r.register(reg({ id: "", capabilities: [], priority: 0, enabled: true })).ok === false, "malformed: empty id rejected");
const badVer = r.register({ providerRegistryContractVersion: "2.0.0", descriptor: claude });
check(badVer.ok === false && badVer.error.code === "PROVIDER_REGISTRY_CONTRACT_INCOMPATIBLE", "version: major mismatch rejected");

// get / has / list ordering
check(r.has("claude") === true && r.has("nope") === false, "has: membership check");
check(r.get("claude")?.priority === 10 && r.get("nope") === null, "get: returns descriptor or null");
check(r.list().map((x) => x.id).join(",") === "alt,claude,lint,off", "list: providers ordered by id");

// immutability of public outputs (item 5)
const got = r.get("claude")!;
check(Object.isFrozen(got) === true && Object.isFrozen(got.capabilities) === true, "immutable: returned descriptor and its capabilities are frozen");
let threw = false;
try { (got as { priority: number }).priority = 999; } catch { threw = true; }
check(threw === true && r.get("claude")?.priority === 10, "immutable: mutating a returned descriptor throws and does not affect the registry");

// registry not affected by mutating the ORIGINAL input object after registration
const mutable: ProviderAdapterDescriptor = { id: "mut", capabilities: [ENGINEERING_CAPABILITY], priority: 7, enabled: true };
r.register(reg(mutable));
mutable.priority = -1;
mutable.capabilities.push("injected");
check(r.get("mut")?.priority === 7 && r.get("mut")?.capabilities.length === 1, "immutable: later mutation of the caller's object does not change registry state");

// discovery: filter by capability, enabled only, id order, NO ranking (returns all matches)
const eng = r.discover(ENGINEERING_CAPABILITY);
check(eng.map((x) => x.id).join(",") === "alt,claude,mut", "discover: enabled engineering providers by id, disabled 'off' excluded, 'lint' excluded");
check(eng.length === 3, "discover: returns ALL matches (no single winner — registry never decides)");

// deregister
check(r.deregister(dereg("lint")).ok === true, "deregister: existing provider removed");
check(r.has("lint") === false, "deregister: provider no longer present");
check(r.deregister(dereg("lint")).ok === false, "deregister: removing again ⇒ not found");
const notFound = r.deregister(dereg("ghost"));
check(notFound.ok === false && notFound.error.code === "PROVIDER_NOT_FOUND", "deregister: unknown id ⇒ PROVIDER_NOT_FOUND");
// re-register after removal is allowed (id freed)
check(r.register(reg(lint)).ok === true, "deregister: id is freed and can be re-registered");

// determinism: two registries, opposite insertion order → identical list
const a = new ProviderRegistry(); a.register(reg(claude)); a.register(reg(alt));
const b = new ProviderRegistry(); b.register(reg(alt)); b.register(reg(claude));
check(JSON.stringify(a.list()) === JSON.stringify(b.list()), "determinism: insertion order does not affect the listing");

if (failures > 0) { console.error(`\nProvider Registry: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nProvider Registry OK");
