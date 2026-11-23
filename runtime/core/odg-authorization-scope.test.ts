#!/usr/bin/env node
"use strict";
/* V16.6 — tests of runtime/core/odg-authorization-scope.ts on the COMMITTED contract G (docs/odg/evidence/
 * V160_AP_WORK_ITEM_CONTRACTS.json) plus explicit fixtures. PURE: no write, no network. */
const fs = require("fs");
const path = require("path");
const AS = require("./odg-authorization-scope.js");
const ROOT = path.resolve(__dirname, "..", "..");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const clone = (o: any) => JSON.parse(JSON.stringify(o));
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8")).contracts.find((c: any) => c.scenario === "G");
const SHA = AS.contractSha256(G);
const HEAD = "a".repeat(40);
const inspection = (o: any = {}) => ({ scenario: "G", verdict: "ACCEPT", contractSha256: SHA, inspector: "independent inspector (fresh session)", inspectedHeadSha: HEAD, inspectedPr: 999, ...o });

// committed state
{
  const s = AS.deriveAuthorizationScope(G, {});
  check("committed G: owner authorization recognized (by OWNER…, source V165)", s.applicable === true && /^OWNER/.test(s.owner.by) && /V165/.test(s.owner.source));
  check("committed G: contract state not rewritten (AUTHORIZED_FOR_REVISION)", G.state === "AUTHORIZED_FOR_REVISION" && s.contractStateRewritten === false && s.selfAuthorized === false);
  check("committed G: REVISE_CONTRACT validated by the revision record (revisionHistory + preRegistration)", s.validatedSteps.map((v: any) => v.step).join(",") === "REVISE_CONTRACT");
  check("no inspection record ⇒ current INSPECT_REVISED_CONTRACT (authorized, inspection work), experiments NOT authorized", s.currentStep === "INSPECT_REVISED_CONTRACT" && s.currentStepAuthorized === true && s.currentStepKind === "INDEPENDENT_INSPECTION" && s.nextStep === "RUN_CONTROLLED_EXPERIMENTS" && s.nextStepAuthorized === false && s.executionAuthorized === false && !AS.isStepAuthorized(s, "RUN_CONTROLLED_EXPERIMENTS"));
  check("contractSha256 = sha256(canon(entry)), 64 hex, stable", /^[0-9a-f]{64}$/.test(SHA) && SHA === AS.contractSha256(clone(G)) && s.contractSha256 === SHA);
}
// ACCEPT + matching sha ⇒ experiments authorized (derived), execution authorized for the current step
{
  const s = AS.deriveAuthorizationScope(G, { inspection: inspection() });
  check("ACCEPT record, matching sha, distinct inspector, head SHA ⇒ INSPECT validated", s.validatedSteps.map((v: any) => v.step).join(",") === "REVISE_CONTRACT,INSPECT_REVISED_CONTRACT" && s.validatedSteps[1].evidence.inspectedHeadSha === HEAD);
  check("⇒ RUN_CONTROLLED_EXPERIMENTS authorized (R4 derived from the owner's prior authorization) and is the current execution step", s.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && s.executionAuthorized === true && AS.isStepAuthorized(s, "RUN_CONTROLLED_EXPERIMENTS") && s.derivedSteps.some((d: any) => d.step === "RUN_CONTROLLED_EXPERIMENTS" && d.rule === "R4" && /V165/.test(d.coveredBy)));
  check("⇒ VALIDATE_CRITERIA NOT yet authorized (no experiment record)", !AS.isStepAuthorized(s, "VALIDATE_CRITERIA") && s.nextStepAuthorized === false);
  const e = AS.deriveAuthorizationScope(G, { inspection: inspection(), experiment: { contractSha256: SHA, outcome: "FAIL" } });
  check("experiment record (any outcome, here FAIL) ⇒ step DONE, VALIDATE_CRITERIA current, authorized, NEVER auto-validated, no execution", e.currentStep === "VALIDATE_CRITERIA" && e.currentStepAuthorized === true && e.executionAuthorized === false && e.validatedSteps.find((v: any) => v.step === "RUN_CONTROLLED_EXPERIMENTS").evidence.outcome === "FAIL" && !e.validatedSteps.some((v: any) => v.step === "VALIDATE_CRITERIA"));
}
// refusals
{
  const edited = clone(G); edited.WORK_ITEM_CONTRACT.acceptance_criteria[0] += " (edited after inspection)";
  const s1 = AS.deriveAuthorizationScope(edited, { inspection: inspection() });
  check("contract edited after inspection (sha mismatch) ⇒ experiments NOT authorized", s1.executionAuthorized === false && !AS.isStepAuthorized(s1, "RUN_CONTROLLED_EXPERIMENTS") && s1.currentStep === "INSPECT_REVISED_CONTRACT" && /sha256/.test(s1.reason));
  const s2 = AS.deriveAuthorizationScope(G, { inspection: inspection({ verdict: "REJECT" }) });
  check("REJECT verdict ⇒ NOT authorized", s2.executionAuthorized === false && !AS.isStepAuthorized(s2, "RUN_CONTROLLED_EXPERIMENTS"));
  const author = G.revisionHistory[G.revisionHistory.length - 1].author;
  const s3 = AS.deriveAuthorizationScope(G, { inspection: inspection({ inspector: `  ${author.toUpperCase()} ` }) });
  check("inspector = revision author (case/space-insensitive) ⇒ NOT authorized", s3.executionAuthorized === false && /independent/.test(s3.reason));
  const s4 = AS.deriveAuthorizationScope(G, { inspection: inspection({ inspectedHeadSha: "abc" }) });
  check("no inspected head SHA ⇒ NOT authorized", s4.executionAuthorized === false);
  const s5 = AS.deriveAuthorizationScope(G, { inspection: inspection({ scenario: "J" }) });
  check("inspection record of another scenario ⇒ NOT authorized", s5.executionAuthorized === false);
  const noRev = clone(G); delete noRev.revisionHistory;
  const s6 = AS.deriveAuthorizationScope(noRev, { inspection: inspection({ contractSha256: AS.contractSha256(noRev) }) });
  check("no revision record ⇒ REVISE current, inspection cannot validate, nothing executable", s6.currentStep === "REVISE_CONTRACT" && s6.executionAuthorized === false && s6.validatedSteps.length === 0);
}
// owner first
{
  const notOwner = clone(G); notOwner.authorization.by = "ODG";
  const s = AS.deriveAuthorizationScope(notOwner, { inspection: inspection({ contractSha256: AS.contractSha256(notOwner) }) });
  check("authorization.by not OWNER ⇒ nothing derived (ODG never self-authorizes)", s.applicable === false && s.authorizedSteps.length === 0 && s.executionAuthorized === false && /R0/.test(s.reason));
  const noSrc = clone(G); noSrc.authorization.source = "self";
  const t = AS.deriveAuthorizationScope(noSrc, { inspection: inspection({ contractSha256: AS.contractSha256(noSrc) }) });
  check("source not citing V165 ⇒ nothing derived", t.applicable === false && t.executionAuthorized === false);
  const noBlock = clone(G); delete noBlock.authorization;
  check("no authorization block ⇒ not applicable (plain-state semantics)", AS.deriveAuthorizationScope(noBlock, {}).applicable === false);
  check("unknown scenario ⇒ not applicable", AS.deriveAuthorizationScope({ ...clone(G), scenario: "Z" }, {}).applicable === false);
}
// out-of-scope steps never derived
{
  const s = AS.deriveAuthorizationScope(G, { inspection: inspection(), experiment: { contractSha256: SHA, outcome: "PASS" } });
  check("out-of-scope steps (PROVIDER_SPEND, GOVERNANCE_CHANGE, MERGE) never authorized", ["PROVIDER_SPEND", "GOVERNANCE_CHANGE", "MERGE", "DEPLOY"].every((x) => !AS.isStepAuthorized(s, x)) && s.authorizedSteps.every((x: string) => AS.STEP_SEQUENCES.G.includes(x)));
  const injected = clone(G); injected.authorization.scope = [...injected.authorization.scope, "PROVIDER_SPEND", "RUN_CONTROLLED_EXPERIMENTS"];
  const u = AS.deriveAuthorizationScope(injected, {});
  check("a declared out-of-sequence step is ignored; a declared execution step needs executionAuthorized true", !AS.isStepAuthorized(u, "PROVIDER_SPEND") && !AS.isStepAuthorized(u, "RUN_CONTROLLED_EXPERIMENTS") && u.executionAuthorized === false);
  check("derivation is frozen (no mutation path)", Object.isFrozen(s) && Object.isFrozen(s.authorizedSteps));
}
if (failures) { process.stdout.write(`${failures} FAILED\n`); process.exit(1); }
process.stdout.write("all odg-authorization-scope tests passed\n");
export {};
