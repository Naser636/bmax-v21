/*
 * NL CONSEQUENTIAL DISPATCH — natural intent → resolution → capability objectiveId/probe → execution.
 *
 * Proves the seam that lets an EXPLICITLY-human-authorized consequential capability requested via
 * natural language reach its EXISTING executor: ODG resolves the capability (existing decision-rules),
 * and — only under a valid human grant — assigns the executor's dispatch objectiveId (its prefix,
 * derived from the capability IDENTITY, never the sentence) and binds the probe that verifies real
 * evidence (the capability's SAFE dry-run probe when it has one). No grant ⇒ nothing is bound (fail-
 * closed). The capability's concrete scope comes from the human grant, never invented from the sentence.
 *
 * Run: node_modules/.bin/tsx src/runtime/nl-consequential-dispatch.test.ts
 */
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const REPO = process.cwd();
type Obj = { id: string; proof?: string; authorization?: { mode?: string } };
type Decision = { mission?: string; contract?: { objectives: Obj[]; verify?: { capability: string; evidence: string }[] } };
const seam = require_(path.join(REPO, "runtime", "bin", "odg-objective.js")) as {
  decide: (raw: string) => Decision;
  applyAuthorization: (d: unknown, grant: unknown, now: number) => { authorizations: { boundProbe: string; dispatchObjectiveId: string }[]; blockers: { code: string }[] };
};
const gateway = require_(path.join(REPO, "runtime", "core", "nl-objective-gateway.js")) as {
  compile: (raw: string) => { status: string; objectives: { capability: { chosen: { capability: string } } }[] };
};
const authz = require_(path.join(REPO, "runtime", "core", "capability-authorization.js")) as {
  authorizeCapability: (req: unknown, grant: unknown, ctx: unknown) => { decision: string; executorPrefix?: string; safeProbe?: string | null; probe?: string };
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const NOW = 3_000_000_000_000;
const RESEARCH = "acquire external research on pricing";
function grant(mission: string, over?: Record<string, unknown>) {
  return { capability: "External Research Acquisition", mission, scope: { objective: "pricing", planned_sources: ["https://example.org"] }, expiresAt: NOW + 60_000, execute: true, human: true, issuer: "akabi@algonaser.fr", ...(over || {}) };
}

console.log("NL CONSEQUENTIAL DISPATCH — INTENT → RESOLUTION → AUTHORIZED OBJECTIVEID/PROBE → EXECUTOR");

// === 1. The EXISTING resolver now maps a natural-language research intent to the capability. =======
{
  const r = gateway.compile(RESEARCH);
  check(r.status === "READY_DRY_RUN", "research intent compiles READY (resolver gap repaired)");
  check(r.objectives[0].capability.chosen.capability === "External Research Acquisition", "resolver maps NL research intent → External Research Acquisition (existing capability)");
}

// === 2. Valid human grant ⇒ ODG assigns the executor dispatch objectiveId + binds the SAFE probe. ==
{
  const d = seam.decide(RESEARCH);
  const res = seam.applyAuthorization(d, grant(d.mission as string), NOW);
  check(res.blockers.length === 0 && res.authorizations.length === 1, "authorized consequential objective is bound");
  const obj = d.contract!.objectives[0];
  check(obj.id === "EXTERNAL_RESEARCH_1", "objectiveId is the EXISTING executor's dispatch prefix (capability identity, not the sentence)");
  check(obj.proof === "external-research-dry-run-planned", "bound to the capability's SAFE dry-run probe (non-destructive, real evidence)");
  check(obj.authorization?.mode === "SAFE_DRY_RUN", "authorization records SAFE_DRY_RUN mode");
  check((d.contract!.verify || []).some((v) => v.capability === "External Research Acquisition" && v.evidence === "external-research-dry-run-planned"), "contract.verify carries the probe binding (objective-evidence gate)");
  check(res.authorizations[0].dispatchObjectiveId === "EXTERNAL_RESEARCH_1" && res.authorizations[0].boundProbe === "external-research-dry-run-planned", "authorization evidence records the dispatch id + bound probe");
}

// === 3. No grant ⇒ nothing is bound; the consequential objective stays unresolved (fail-closed). ===
{
  const d = seam.decide(RESEARCH);
  const res = seam.applyAuthorization(d, null, NOW);
  check(res.authorizations.length === 0 && res.blockers.some((b) => b.code === "NO_AUTHORIZATION"), "no grant ⇒ NO_AUTHORIZATION, nothing bound");
  check(!/^EXTERNAL_RESEARCH_/.test(d.contract!.objectives[0].id) && !d.contract!.objectives[0].proof, "no grant ⇒ objective keeps its bounded NL id and no probe (never dispatched)");
}

// === 4. Dispatch-prefix derivation is capability-identity driven for every consequential capability. =
{
  const live = authz.authorizeCapability(
    { capability: "Governed Git Branch Integration", mission: "NL_X", requestedScope: {} },
    { capability: "Governed Git Branch Integration", mission: "NL_X", scope: { target: "t" }, expiresAt: NOW + 1000, execute: true, human: true },
    { now: NOW },
  );
  check(live.decision === "ALLOW" && live.executorPrefix === "GIT_BRANCH_INTEGRATION", "git capability ⇒ executorPrefix GIT_BRANCH_INTEGRATION");
  check(live.safeProbe === null && live.probe === "git-branch-integrated", "git has NO safe dry-run probe ⇒ safe-mode cannot reach SUCCESS (honest)");
  const research = authz.authorizeCapability(
    { capability: "External Research Acquisition", mission: "NL_X", requestedScope: {} },
    { capability: "External Research Acquisition", mission: "NL_X", scope: { objective: "x" }, expiresAt: NOW + 1000, execute: true, human: true },
    { now: NOW },
  );
  check(research.executorPrefix === "EXTERNAL_RESEARCH" && research.safeProbe === "external-research-dry-run-planned", "research capability exposes its dispatch prefix + safe probe");
}

console.log(failures === 0 ? "ALL PASS — NL CONSEQUENTIAL DISPATCH" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
