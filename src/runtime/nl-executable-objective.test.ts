/*
 * NL EXECUTABLE OBJECTIVE — genuine Mission → Capability → Execution → Evidence for natural intent.
 *
 * Proves the seam that makes a natural-language ODG intent GENUINELY executable (not merely routed):
 *   (1) the gateway binds an objective's RESOLVED capability to its EXISTING evidence probe, so the
 *       synthesized contract declares a real, machine-checkable evidence requirement (verify + proof);
 *   (2) ONLY read-only, non-self-authorizing capabilities are auto-bound (a consequential capability is
 *       excluded — no-self-authorization — so a sentence can never auto-execute it);
 *   (3) mission-cli routes a capability-backed NL mission to the EXISTING route that actually executes
 *       capabilities (RuntimeExecutor), not the local-pipeline (which never dispatches them);
 *   (4) the odg-objective seam recognises the probe binding, so SUCCESS becomes reachable with evidence.
 *
 * Run: node_modules/.bin/tsx src/runtime/nl-executable-objective.test.ts
 */
import path from "node:path";
import { createRequire } from "node:module";
import { nlMissionResolvesCapability } from "./mission-cli";

const require_ = createRequire(import.meta.url);
const REPO = process.cwd();
const gateway = require_(path.join(REPO, "runtime", "core", "nl-objective-gateway.js")) as {
  compile: (raw: string, opts?: unknown) => { status: string; contract: { verify?: { capability: string; evidence: string }[]; objectives: { id: string; goal: string; proof?: string }[] } };
  probeForCapability: (cap: string) => string | null;
};
const seam = require_(path.join(REPO, "runtime", "bin", "odg-objective.js")) as {
  contractHasEvidenceBinding: (c: unknown) => boolean;
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("NL EXECUTABLE OBJECTIVE — INTENT → CAPABILITY → EXECUTION → EVIDENCE");

// === 1. A capability-backed NL intent binds the resolved capability to its EXISTING probe. =========
{
  const r = gateway.compile("audit the connectivity");
  check(r.status === "READY_DRY_RUN", "capability-backed read-only intent compiles READY_DRY_RUN");
  const verify = r.contract.verify || [];
  check(verify.length === 1 && verify[0].capability === "Connectivity Audit" && verify[0].evidence === "internet-reachable", "contract.verify binds Connectivity Audit → internet-reachable (existing probe)");
  check(r.contract.objectives[0].proof === "internet-reachable", "the objective carries the per-objective proof binding");
  check(seam.contractHasEvidenceBinding(r.contract) === true, "the seam now sees a REAL evidence binding (SUCCESS reachable)");
}

// === 2. A capability WITHOUT a registered probe stays unbound (honestly PARTIAL, not false SUCCESS). =
{
  const r = gateway.compile("audit the runtime state"); // → self-diagnostic (no registered probe)
  check(r.status === "READY_DRY_RUN", "no-probe capability intent still compiles READY");
  check((r.contract.verify || []).length === 0, "no probe ⇒ no verify binding (left honestly unprovable)");
  check(!r.contract.objectives[0].proof, "no probe ⇒ no objective proof");
  check(seam.contractHasEvidenceBinding(r.contract) === false, "unbound objective ⇒ no evidence binding ⇒ seam will report PARTIAL");
}

// === 3. No-self-authorization: a consequential capability is NEVER auto-bound. ====================
{
  check(gateway.probeForCapability("Connectivity Audit") === "internet-reachable", "read-only capability is auto-bound");
  check(gateway.probeForCapability("Governed Git Branch Integration") === null, "consequential git capability is NOT auto-bound (needs human authorization)");
  check(gateway.probeForCapability("Governed Bash/Linux Command") === null, "consequential bash capability is NOT auto-bound");
  check(gateway.probeForCapability("External Research Acquisition") === null, "consequential external-research capability is NOT auto-bound");
}

// === 4. mission-cli routes a capability-backed NL mission to the capability-executing route. =======
{
  const connSpec = { objectives: [{ id: "NL_ANALYZE_ABCD1234_1", goal: "audit the connectivity" }] };
  check(nlMissionResolvesCapability("NL_ANALYZE_ABCD1234", connSpec) === true, "NL_ mission whose objective resolves to a capability executor ⇒ route to RuntimeExecutor");
  check(nlMissionResolvesCapability("AUDIT_THE_CONNECTIVITY", connSpec) === false, "a non-NL_ mission keeps its existing routing (bounded blast radius)");
  const noCap = { objectives: [{ id: "NL_ANALYZE_DEADBEEF_1", goal: "do something unmatched by any executor" }] };
  check(nlMissionResolvesCapability("NL_ANALYZE_DEADBEEF", noCap) === false, "an NL_ mission with no capability-matching objective falls through to local-pipeline");
  check(nlMissionResolvesCapability("NL_ANALYZE_X", null) === false, "a missing spec ⇒ fail closed to the unchanged route");
}

console.log(failures === 0 ? "ALL PASS — NL EXECUTABLE OBJECTIVE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
