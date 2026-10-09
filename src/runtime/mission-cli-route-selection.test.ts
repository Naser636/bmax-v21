/*
 * mission-cli route-selection contract — verify-only capability-PROOF missions route LOCAL, not PROVIDER.
 *
 * DEFECT (reproduced below): `EXTERNAL_RESEARCH_DRYRUN_PROBE` is a verify-only capability-proof mission
 * (requires_engineering:true, mode ENGINEERING, authorized_paths, NO concrete edits). The route order in
 * mission-cli `main()` reached `missionRequiresProvider` — which is true for it — and sent it to the
 * provider (RuntimeAutonomy → ClaudeProviderAdapter = external call) BEFORE the only local route that
 * dispatches capability-executors (bounded to the NL_ namespace). So its governed DRY-RUN plan could
 * never be produced locally, and launching it risked a provider call.
 *
 * FIX: a namespace-agnostic predicate `missionIsLocalCapabilityProof` routes to the EXISTING runLocalRoute
 * a mission that (a) carries no concrete edits, (b) DECLARES a `verify` capability→evidence probe, and
 * (c) resolves each declared capability — via one of its objectives — to an EXISTING local
 * capability-executor of EXACTLY that capability. It is checked BEFORE the provider gate and is strictly
 * narrower than it, so ordinary engineering (provider-authored) missions and NL_ missions are unchanged.
 *
 * This test exercises the REAL exported predicates in the REAL order main() uses (no provider invoked:
 * predicates are pure; capability-executors.resolve() only matches, it never runs/fetches).
 *
 * Run directly: node_modules/.bin/tsx src/runtime/mission-cli-route-selection.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import {
  missionIsLocalCapabilityProof,
  missionIsPreAuthoredEngineering,
  nlMissionResolvesCapability,
} from "./mission-cli";
import { missionRequiresProvider, type RoutableMission } from "@/providers";
import { isMigratedMission } from "./mission-migration";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

interface RawMission {
  mode?: string;
  authorized_paths?: unknown;
  authorizedPaths?: unknown;
  requires_engineering?: boolean;
  requiresEngineering?: boolean;
  objectives?: { id?: string; goal?: string; patch?: unknown }[];
  verify?: { capability?: unknown; evidence?: unknown }[];
}

/** Mirror of mission-cli's (non-exported) toRoutable mapping, so missionRequiresProvider sees the same
 *  shape main() feeds it. */
function toRoutable(spec: RawMission): RoutableMission {
  const paths = spec.authorized_paths ?? spec.authorizedPaths;
  return {
    mode: spec.mode,
    authorizedPaths: Array.isArray(paths) ? paths.filter((p): p is string => typeof p === "string") : [],
    requiresEngineering: spec.requires_engineering ?? spec.requiresEngineering,
  };
}

type Route = "convergence" | "migrated-local" | "local-pipeline" | "local-capability" | "provider" | "local-capability-nl";

/** Faithful mirror of mission-cli main()'s route-selection order for a NON-convergence mission. Calls the
 *  REAL exported predicates in the REAL order so the asserted route == the route main() would choose. */
function decide(mission: string, spec: RawMission): Route {
  if (isMigratedMission(mission)) return "migrated-local";
  if (missionIsPreAuthoredEngineering(spec)) return "local-pipeline";
  if (missionIsLocalCapabilityProof(spec)) return "local-capability"; // NEW guard — before the provider gate
  if (missionRequiresProvider(toRoutable(spec))) return "provider";
  if (nlMissionResolvesCapability(mission, spec)) return "local-capability-nl";
  return "local-pipeline";
}

console.log("MISSION-CLI ROUTE-SELECTION CONTRACT");

// ── The real mission contract under repair ──────────────────────────────────────────────────────────
const ERDP = "EXTERNAL_RESEARCH_DRYRUN_PROBE";
const erdp = JSON.parse(
  fs.readFileSync(path.join("runtime", "missions", `${ERDP}.json`), "utf8"),
) as RawMission;

// 0 — DEFECT reproduced: WITHOUT the new guard, this mission matches the provider gate.
check(missionRequiresProvider(toRoutable(erdp)) === true,
  "DEFECT: EXTERNAL_RESEARCH_DRYRUN_PROBE matches missionRequiresProvider (would route PROVIDER pre-fix)");
check(isMigratedMission(ERDP) === false,
  "DEFECT precondition: mission is not migrated (so the migrated-local guard does not catch it)");
check(missionIsPreAuthoredEngineering(erdp) === false,
  "DEFECT precondition: mission carries no concrete edits (not pre-authored engineering)");

// 1 — FIX: the new predicate selects it, and because it is checked BEFORE the provider gate, the route
//     is LOCAL without invoking the provider.
check(missionIsLocalCapabilityProof(erdp) === true,
  "FIX: missionIsLocalCapabilityProof(EXTERNAL_RESEARCH_DRYRUN_PROBE) === true");
check(decide(ERDP, erdp) === "local-capability",
  "FIX: EXTERNAL_RESEARCH_DRYRUN_PROBE selects the LOCAL capability route (provider NOT invoked)");

// 2 — PRESERVED: an ordinary engineering mission that genuinely needs a provider to AUTHOR (no verify
//     probe, no edits) still routes to the provider.
const engineering: RawMission = {
  mode: "ENGINEERING",
  requires_engineering: true,
  authorized_paths: ["src/**"],
  objectives: [{ id: "IMPL_1", goal: "implement the new settings page" }],
};
check(missionIsLocalCapabilityProof(engineering) === false,
  "PRESERVED: ordinary engineering mission is NOT a local capability-proof mission");
check(decide("IMPLEMENT_SETTINGS_PAGE", engineering) === "provider",
  "PRESERVED: ordinary engineering mission still routes PROVIDER");

// 2b — PRESERVED (adversarial): an engineering mission whose GOAL text merely mentions a capability word
//      ("provider") but declares NO verify probe must NOT be stolen to the local route.
const textMatch: RawMission = {
  mode: "ENGINEERING",
  requires_engineering: true,
  authorized_paths: ["src/**"],
  objectives: [{ id: "X1", goal: "improve the provider adapter error handling" }],
};
check(missionIsLocalCapabilityProof(textMatch) === false,
  "PRESERVED: goal text-matching a capability (no verify probe) still routes PROVIDER");
check(decide("IMPROVE_PROVIDER_ADAPTER", textMatch) === "provider",
  "PRESERVED: adversarial text-match mission routes PROVIDER");

// 3 — PRESERVED: NL_ capability-backed missions keep their existing route (nlMissionResolvesCapability),
//     because without a declared verify probe the new guard does not fire.
const nlSpec: RawMission = {
  objectives: [{ id: "EXTERNAL_RESEARCH_1", goal: "do governed external research" }],
};
check(missionIsLocalCapabilityProof(nlSpec) === false,
  "PRESERVED: NL_ mission without a verify probe is not caught by the new guard");
check(decide("NL_ANALYZE_ABCD1234", nlSpec) === "local-capability-nl",
  "PRESERVED: NL_ capability-backed mission still routes via the existing NL_ local path");

// 4 — NECESSITY of each sub-condition (the rule is a conjunction, not "verify-only" alone):
// 4a — concrete edits present ⇒ NOT selected (pre-authored-engineering route owns it).
const withEdit: RawMission = {
  ...erdp,
  objectives: [{ id: "EXTERNAL_RESEARCH_1", goal: erdp.objectives?.[0]?.goal, patch: { target: "x.ts", content: "y" } }],
};
check(missionIsLocalCapabilityProof(withEdit) === false,
  "NECESSITY: a mission carrying concrete edits is NOT a local capability-proof mission");

// 4b — no verify probe ⇒ NOT selected.
const noVerify: RawMission = { ...erdp, verify: [] };
check(missionIsLocalCapabilityProof(noVerify) === false,
  "NECESSITY: without a declared verify capability→evidence probe, the guard does not fire");

// 4c — verify capability does NOT match the resolved executor ⇒ fail closed.
const mismatch: RawMission = { ...erdp, verify: [{ capability: "Provider Activation", evidence: "x" }] };
check(missionIsLocalCapabilityProof(mismatch) === false,
  "NECESSITY: a verify capability that mismatches the resolved executor fails closed (PROVIDER)");

// 5 — NAMESPACE-AGNOSTIC / NOT a name hardcode: the same rule fires for a DIFFERENT real capability
//     (Connectivity Audit) declared by a non-NL, non-EXTERNAL_RESEARCH mission with no edits.
const connectivity: RawMission = {
  mode: "ENGINEERING",
  requires_engineering: true,
  authorized_paths: ["runtime/**"],
  objectives: [{ id: "CONN_1", goal: "run a connectivity audit of the runtime" }],
  verify: [{ capability: "Connectivity Audit", evidence: "connectivity-verified" }],
};
check(missionIsLocalCapabilityProof(connectivity) === true,
  "GENERAL: the rule fires for another real capability (Connectivity Audit) — not a mission-name hardcode");
check(decide("PROVE_CONNECTIVITY", connectivity) === "local-capability",
  "GENERAL: a different capability-proof mission also selects the LOCAL route");

console.log(failures === 0 ? "ALL PASS — ROUTE-SELECTION CONTRACT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
