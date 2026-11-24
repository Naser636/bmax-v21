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
const AUTHOR_SID = G.revisionHistory[G.revisionHistory.length - 1].revisionAuthorSessionId;
/* V16.9 R7 — LABELLED TEST FIXTURE (not git): the fixture head HEAD = 'a'×40 is DECLARED present in git and an ancestor
 * of main, file hashes come from the real tree. Before R7 these tests passed WITHOUT any probe (the old behaviour accepted
 * an unchecked head); they now inject this fixture explicitly. Real-git tests are in the R7 block at the end. */
const OCUR = require("./odg-observation-currency.js");
const FIXTURE_PROBES = Object.freeze({ label: "TEST FIXTURE — commit 'a'×40 declared present + ancestor of main", mainRef: "fixture-main",
  commitExists: (s: string) => s === HEAD, isAncestorOfMain: (s: string) => s === HEAD,
  fileSha256: (rel: string) => { try { return require("crypto").createHash("sha256").update(fs.readFileSync(path.join(ROOT, rel))).digest("hex"); } catch { return null; } } });
const derive = (c: any, ev: any = {}) => AS.deriveAuthorizationScope(c, { probes: FIXTURE_PROBES, ...ev });
const inspection = (o: any = {}) => ({ scenario: "G", verdict: "ACCEPT", contractSha256: SHA, inspector: "independent inspector (fresh session)", inspectorSessionId: "inspector-sid-0001", authorSessionId: AUTHOR_SID, inspectedHeadSha: HEAD, inspectedPr: 999, ...o });

// committed state
{
  const s = derive(G, {});
  check("committed G: owner authorization recognized (by OWNER…, source V165)", s.applicable === true && /^OWNER/.test(s.owner.by) && /V165/.test(s.owner.source));
  check("committed G: contract state not rewritten (AUTHORIZED_FOR_REVISION)", G.state === "AUTHORIZED_FOR_REVISION" && s.contractStateRewritten === false && s.selfAuthorized === false);
  check("committed G: REVISE_CONTRACT validated by the revision record (revisionHistory + preRegistration)", s.validatedSteps.map((v: any) => v.step).join(",") === "REVISE_CONTRACT");
  check("no inspection record ⇒ current INSPECT_REVISED_CONTRACT (authorized, inspection work), experiments NOT authorized", s.currentStep === "INSPECT_REVISED_CONTRACT" && s.currentStepAuthorized === true && s.currentStepKind === "INDEPENDENT_INSPECTION" && s.nextStep === "RUN_CONTROLLED_EXPERIMENTS" && s.nextStepAuthorized === false && s.executionAuthorized === false && !AS.isStepAuthorized(s, "RUN_CONTROLLED_EXPERIMENTS"));
  check("contractSha256 = sha256(canon(entry)), 64 hex, stable", /^[0-9a-f]{64}$/.test(SHA) && SHA === AS.contractSha256(clone(G)) && s.contractSha256 === SHA);
}
// ACCEPT + matching sha ⇒ experiments authorized (derived), execution authorized for the current step
{
  const s = derive(G, { inspection: inspection() });
  check("ACCEPT record, matching sha, distinct inspector, head SHA ⇒ INSPECT validated", s.validatedSteps.map((v: any) => v.step).join(",") === "REVISE_CONTRACT,INSPECT_REVISED_CONTRACT" && s.validatedSteps[1].evidence.inspectedHeadSha === HEAD);
  check("⇒ RUN_CONTROLLED_EXPERIMENTS authorized (R4 derived from the owner's prior authorization) and is the current execution step", s.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && s.executionAuthorized === true && AS.isStepAuthorized(s, "RUN_CONTROLLED_EXPERIMENTS") && s.derivedSteps.some((d: any) => d.step === "RUN_CONTROLLED_EXPERIMENTS" && d.rule === "R4" && /V165/.test(d.coveredBy)));
  check("⇒ VALIDATE_CRITERIA NOT yet authorized (no experiment record)", !AS.isStepAuthorized(s, "VALIDATE_CRITERIA") && s.nextStepAuthorized === false);
  const e = derive(G, { inspection: inspection(), experiment: { contractSha256: SHA, outcome: "FAIL" } });
  check("experiment record (any outcome, here FAIL) ⇒ step DONE, VALIDATE_CRITERIA current, authorized, NEVER auto-validated, no execution", e.currentStep === "VALIDATE_CRITERIA" && e.currentStepAuthorized === true && e.executionAuthorized === false && e.validatedSteps.find((v: any) => v.step === "RUN_CONTROLLED_EXPERIMENTS").evidence.outcome === "FAIL" && !e.validatedSteps.some((v: any) => v.step === "VALIDATE_CRITERIA"));
}
// refusals
{
  const edited = clone(G); edited.WORK_ITEM_CONTRACT.acceptance_criteria[0] += " (edited after inspection)";
  const s1 = derive(edited, { inspection: inspection() });
  check("contract edited after inspection (sha mismatch) ⇒ experiments NOT authorized", s1.executionAuthorized === false && !AS.isStepAuthorized(s1, "RUN_CONTROLLED_EXPERIMENTS") && s1.currentStep === "INSPECT_REVISED_CONTRACT" && /sha256/.test(s1.reason));
  const s2 = derive(G, { inspection: inspection({ verdict: "REJECT" }) });
  check("REJECT verdict ⇒ NOT authorized", s2.executionAuthorized === false && !AS.isStepAuthorized(s2, "RUN_CONTROLLED_EXPERIMENTS"));
  check("committed revision records revisionAuthorSessionId a2c8b4b6fcc582da1", AUTHOR_SID === "a2c8b4b6fcc582da1");
  const s3 = derive(G, { inspection: inspection({ inspectorSessionId: AUTHOR_SID }) });
  check("equal session ids (inspector = author) ⇒ NOT authorized", s3.executionAuthorized === false && /not independent/.test(s3.reason));
  const author = G.revisionHistory[G.revisionHistory.length - 1].author;
  const w1 = derive(G, { inspection: inspection({ inspector: "PROVIDER (Claude Code)" }) });
  const w2 = derive(G, { inspection: inspection({ inspector: author }) });
  check("inspector WORDING never decides (colliding or identical name text): result depends on session ids only", w1.executionAuthorized === true && w2.executionAuthorized === true && w1.independenceLevel === "DECLARED_SESSION_INDEPENDENCE" && w1.validatedSteps[1].evidence.independenceLevel === "DECLARED_SESSION_INDEPENDENCE");
  const m1 = derive(G, { inspection: inspection({ inspectorSessionId: undefined }) });
  const m2 = derive(G, { inspection: inspection({ authorSessionId: undefined }) });
  check("missing inspectorSessionId or authorSessionId ⇒ NOT authorized", m1.executionAuthorized === false && m2.executionAuthorized === false);
  const m3 = derive(G, { inspection: inspection({ authorSessionId: "some-other-sid-99" }) });
  check("authorSessionId not equal to the contract's revisionAuthorSessionId (inspector-picked) ⇒ NOT authorized", m3.executionAuthorized === false && /revisionAuthorSessionId/.test(m3.reason));
  const noSid = clone(G); delete noSid.revisionHistory[noSid.revisionHistory.length - 1].revisionAuthorSessionId;
  const m4 = derive(noSid, { inspection: inspection({ contractSha256: AS.contractSha256(noSid) }) });
  check("revision without revisionAuthorSessionId ⇒ REVISE not validated, nothing executable", m4.currentStep === "REVISE_CONTRACT" && m4.executionAuthorized === false);
  const s4 = derive(G, { inspection: inspection({ inspectedHeadSha: "abc" }) });
  check("no inspected head SHA ⇒ NOT authorized", s4.executionAuthorized === false);
  const s5 = derive(G, { inspection: inspection({ scenario: "J" }) });
  check("inspection record of another scenario ⇒ NOT authorized", s5.executionAuthorized === false);
  const noRev = clone(G); delete noRev.revisionHistory;
  const s6 = derive(noRev, { inspection: inspection({ contractSha256: AS.contractSha256(noRev) }) });
  check("no revision record ⇒ REVISE current, inspection cannot validate, nothing executable", s6.currentStep === "REVISE_CONTRACT" && s6.executionAuthorized === false && s6.validatedSteps.length === 0);
}
// owner first
{
  const notOwner = clone(G); notOwner.authorization.by = "ODG";
  const s = derive(notOwner, { inspection: inspection({ contractSha256: AS.contractSha256(notOwner) }) });
  check("authorization.by not OWNER ⇒ nothing derived (ODG never self-authorizes)", s.applicable === false && s.authorizedSteps.length === 0 && s.executionAuthorized === false && /R0/.test(s.reason));
  const noSrc = clone(G); noSrc.authorization.source = "self";
  const t = derive(noSrc, { inspection: inspection({ contractSha256: AS.contractSha256(noSrc) }) });
  check("source not citing V165 ⇒ nothing derived", t.applicable === false && t.executionAuthorized === false);
  const noBlock = clone(G); delete noBlock.authorization;
  check("no authorization block ⇒ not applicable (plain-state semantics)", derive(noBlock, {}).applicable === false);
  check("unknown scenario ⇒ not applicable", derive({ ...clone(G), scenario: "Z" }, {}).applicable === false);
}
// out-of-scope steps never derived
{
  const s = derive(G, { inspection: inspection(), experiment: { contractSha256: SHA, outcome: "PASS" } });
  check("out-of-scope steps (PROVIDER_SPEND, GOVERNANCE_CHANGE, MERGE) never authorized", ["PROVIDER_SPEND", "GOVERNANCE_CHANGE", "MERGE", "DEPLOY"].every((x) => !AS.isStepAuthorized(s, x)) && s.authorizedSteps.every((x: string) => AS.STEP_SEQUENCES.G.includes(x)));
  const injected = clone(G); injected.authorization.scope = [...injected.authorization.scope, "PROVIDER_SPEND", "RUN_CONTROLLED_EXPERIMENTS"];
  const u = derive(injected, {});
  check("a declared out-of-sequence step is ignored; a declared execution step needs executionAuthorized true", !AS.isStepAuthorized(u, "PROVIDER_SPEND") && !AS.isStepAuthorized(u, "RUN_CONTROLLED_EXPERIMENTS") && u.executionAuthorized === false);
  check("derivation is frozen (no mutation path)", Object.isFrozen(s) && Object.isFrozen(s.authorizedSteps));
}
// R5b — VALIDATE_CRITERIA validated only by a bound criteria-validation record; never an upgrade
{
  const exp = { contractSha256: SHA, outcome: "PARTIAL" };
  const xs = AS.experimentSha256(exp);
  const val = (o: any = {}) => ({ contractSha256: SHA, experimentEvidence: { experimentSha256: xs }, experimentInspection: { verdict: "ACCEPT", inspectorSessionId: "insp-session-0002", authorSessionId: "exp-author-0003" }, scenarioGrade: "PARTIAL", ...o });
  const run = (v: any, e: any = exp) => derive(G, { inspection: inspection(), experiment: e, validation: v });
  check("R5b: no validation record ⇒ VALIDATE_CRITERIA current, not validated", run(null).currentStep === "VALIDATE_CRITERIA");
  check("R5b: bound record (contract + experiment sha, ACCEPT, distinct ids, grade ≤ outcome) ⇒ all steps validated", run(val()).currentStep === null && run(val()).validatedSteps.some((x: any) => x.step === "VALIDATE_CRITERIA" && x.evidence.scenarioGrade === "PARTIAL"));
  check("R5b: upgrade refused (PASS on a PARTIAL experiment)", run(val({ scenarioGrade: "PASS" })).currentStep === "VALIDATE_CRITERIA");
  check("R5b: downgrade allowed (FAIL ≤ PARTIAL)", run(val({ scenarioGrade: "FAIL" })).currentStep === null);
  check("R5b: NOT_MEASURED grade on a measured experiment refused", run(val({ scenarioGrade: "NOT_MEASURED" })).currentStep === "VALIDATE_CRITERIA");
  check("R5b: experiment edited after validation ⇒ not validated", run(val(), { ...exp, outcome: "PASS" }).currentStep === "VALIDATE_CRITERIA");
  check("R5b: reader-added recordPath does not change experimentSha256", AS.experimentSha256({ ...exp, recordPath: "x" }) === xs);
  check("R5b: contract sha mismatch ⇒ not validated", run(val({ contractSha256: "0".repeat(64) })).currentStep === "VALIDATE_CRITERIA");
  check("R5b: inspection REJECT ⇒ not validated", run(val({ experimentInspection: { verdict: "REJECT", inspectorSessionId: "insp-session-0002", authorSessionId: "exp-author-0003" } })).currentStep === "VALIDATE_CRITERIA");
  check("R5b: same inspector/author session ⇒ not validated", run(val({ experimentInspection: { verdict: "ACCEPT", inspectorSessionId: "same-session-01", authorSessionId: "same-session-01" } })).currentStep === "VALIDATE_CRITERIA");
  check("R5b: missing session ids ⇒ not validated", run(val({ experimentInspection: { verdict: "ACCEPT" } })).currentStep === "VALIDATE_CRITERIA");
}
// V16.8 — per-scenario owner source (G ⇒ V165, H ⇒ V168) + STEP_SEQUENCES.H derived exactly like G
{
  const H = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8")).contracts.find((c: any) => c.scenario === "H");
  const HSHA = AS.contractSha256(H);
  const HSID = H.revisionHistory[H.revisionHistory.length - 1].revisionAuthorSessionId;
  const hInsp = (o: any = {}) => ({ scenario: "H", verdict: "ACCEPT", contractSha256: HSHA, inspector: "independent inspector (fixture)", inspectorSessionId: "inspector-sid-h-0001", authorSessionId: HSID, inspectedHeadSha: HEAD, inspectedPr: 998, ...o });
  check("STEP_SEQUENCES.H = the same 4 steps as G", AS.STEP_SEQUENCES.H.join(",") === AS.STEP_SEQUENCES.G.join(","));
  const s0 = derive(H, {});
  check("committed H: owner authorization recognized (by OWNER…, source V168_OWNER_AUTHORIZATION_H.json)", s0.applicable === true && /^OWNER/.test(s0.owner.by) && /V168_OWNER_AUTHORIZATION_H\.json/.test(s0.owner.source));
  check("committed H: REVISE_CONTRACT validated (revisionHistory + preRegistration), INSPECT current, experiments NOT authorized", s0.validatedSteps.map((v: any) => v.step).join(",") === "REVISE_CONTRACT" && s0.currentStep === "INSPECT_REVISED_CONTRACT" && s0.executionAuthorized === false && !AS.isStepAuthorized(s0, "RUN_CONTROLLED_EXPERIMENTS"));
  check("committed H: revisionAuthorSessionId recorded, state not rewritten", HSID === "h-reviser-v168" && H.state === "AUTHORIZED_FOR_REVISION" && s0.contractStateRewritten === false);
  const s1 = derive(H, { inspection: hInsp() });
  check("H: inspection ACCEPT sha-bound ⇒ RUN_CONTROLLED_EXPERIMENTS derived (R4, covered by V168), execution authorized", s1.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && s1.executionAuthorized === true && s1.derivedSteps.some((d: any) => d.step === "RUN_CONTROLLED_EXPERIMENTS" && d.rule === "R4" && /V168/.test(d.coveredBy)));
  const edited = clone(H); edited.WORK_ITEM_CONTRACT.preRegistration.thresholds.PASS += " (edited)";
  check("H: contract edited after inspection ⇒ experiments NOT authorized", derive(edited, { inspection: hInsp() }).executionAuthorized === false);
  check("H: inspection record of scenario G ⇒ NOT authorized", derive(H, { inspection: hInsp({ scenario: "G" }) }).executionAuthorized === false);
  const exp = { contractSha256: HSHA, outcome: "FAIL" }; const xs = AS.experimentSha256(exp);
  const s2 = derive(H, { inspection: hInsp(), experiment: exp });
  check("H: experiment record ⇒ VALIDATE_CRITERIA current, never auto-validated", s2.currentStep === "VALIDATE_CRITERIA" && s2.currentStepAuthorized === true && !s2.validatedSteps.some((v: any) => v.step === "VALIDATE_CRITERIA"));
  const val = (o: any = {}) => ({ contractSha256: HSHA, experimentEvidence: { experimentSha256: xs }, experimentInspection: { verdict: "ACCEPT", inspectorSessionId: "insp-session-h-02", authorSessionId: "exp-author-h-03" }, scenarioGrade: "FAIL", ...o });
  check("H R5b: bound validation record ⇒ all steps validated; upgrade (PASS on FAIL) refused", derive(H, { inspection: hInsp(), experiment: exp, validation: val() }).currentStep === null && derive(H, { inspection: hInsp(), experiment: exp, validation: val({ scenarioGrade: "PASS" }) }).currentStep === "VALIDATE_CRITERIA");
  // an authorization is never reused for another mission
  const hV165 = clone(H); hV165.authorization.source = "docs/odg/V165_OWNER_AUTHORIZATION.json#missionG";
  const r1 = derive(hV165, { inspection: hInsp({ contractSha256: AS.contractSha256(hV165) }) });
  check("H with a V165 source ⇒ refused (nothing derived)", r1.applicable === false && r1.executionAuthorized === false && /R0/.test(r1.reason) && /V168/.test(r1.reason));
  const hBoth = clone(H); hBoth.authorization.source = "docs/odg/V168_OWNER_AUTHORIZATION_H.json + V165";
  check("H source citing BOTH V168 and V165 ⇒ refused (foreign directive)", derive(hBoth, {}).applicable === false);
  const gV168 = clone(G); gV168.authorization.source = "docs/odg/V168_OWNER_AUTHORIZATION_H.json (V168)";
  const r2 = derive(gV168, { inspection: inspection({ contractSha256: AS.contractSha256(gV168) }) });
  check("G with a V168 source ⇒ refused (nothing derived)", r2.applicable === false && r2.executionAuthorized === false && /R0/.test(r2.reason));
  const gBoth = clone(G); gBoth.authorization.source = "docs/odg/V165_OWNER_AUTHORIZATION.json#missionG; docs/odg/V168_OWNER_AUTHORIZATION_H.json";
  check("G source citing BOTH ⇒ refused", derive(gBoth, {}).applicable === false);
  check("ownerSourceCheck: unknown scenario ⇒ refused", AS.ownerSourceCheck("J", "V165 V168_OWNER_AUTHORIZATION_H.json").ok === false);
  check("G unchanged: committed G still derives with its V165 source", derive(G, { inspection: inspection() }).executionAuthorized === true);
  check("H frozen dataset: committed file sha256 = preRegistration.dataset.sha256", require("crypto").createHash("sha256").update(fs.readFileSync(path.join(ROOT, H.WORK_ITEM_CONTRACT.preRegistration.dataset.file))).digest("hex") === H.WORK_ITEM_CONTRACT.preRegistration.dataset.sha256);
  check("H declares dispatchTargets.RUN_CONTROLLED_EXPERIMENTS with command + writeSet ⊆ write_set", (() => { const t = H.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS; const ws = H.WORK_ITEM_CONTRACT.write_set; return ws.includes(t.command) && t.writeSet.length > 0 && t.writeSet.every((x: string) => ws.includes(x)); })());
}
// V17.2 — NEW contracts G2 (owner V170) and J2 (owner V171): same 4-step sequence, derived exactly like H; per-scenario
// owner-source binding never cross-usable; G and H bindings unchanged.
{
  const CF = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8"));
  const by = (id: string) => CF.contracts.find((c: any) => c.scenario === id);
  const H = by("H");
  for (const [id, own, other] of [["G2", /V170_OWNER_AUTHORIZATION_HG\.json/, "J2"], ["J2", /V171_OWNER_AUTHORIZATION_PORTFOLIO\.json/, "G2"]] as any) {
    const X = by(id);
    const XSHA = AS.contractSha256(X);
    const XSID = X.revisionHistory[X.revisionHistory.length - 1].revisionAuthorSessionId;
    const xInsp = (o: any = {}) => ({ scenario: id, verdict: "ACCEPT", contractSha256: XSHA, inspector: "independent inspector (fixture)", inspectorSessionId: `inspector-sid-${id}-0001`, authorSessionId: XSID, inspectedHeadSha: HEAD, inspectedPr: 997, ...o });
    check(`STEP_SEQUENCES.${id} = the same 4 steps as G and H`, AS.STEP_SEQUENCES[id].join(",") === AS.STEP_SEQUENCES.H.join(",") && AS.STEP_SEQUENCES[id].join(",") === AS.STEP_SEQUENCES.G.join(","));
    const s0 = derive(X, {});
    check(`committed ${id}: owner authorization recognized (by OWNER…, its own bound source)`, s0.applicable === true && /^OWNER/.test(s0.owner.by) && own.test(s0.owner.source));
    check(`committed ${id}: REVISE_CONTRACT validated, INSPECT current, experiments NOT authorized, state not rewritten`, s0.validatedSteps.map((v: any) => v.step).join(",") === "REVISE_CONTRACT" && s0.currentStep === "INSPECT_REVISED_CONTRACT" && s0.executionAuthorized === false && X.state === "AUTHORIZED_FOR_REVISION" && s0.contractStateRewritten === false && X.authorization.executionAuthorized === false);
    check(`committed ${id}: FIRST revision records the PARENT criteria verbatim + session id g2j2-reviser-v172 (later revisions, e.g. J2 V173 coordinator-v173-j2r2, are appended after it)`, X.revisionHistory[0].revisionAuthorSessionId === "g2j2-reviser-v172" && X.revisionHistory[0].originalCriteria.length > 0 && JSON.stringify(X.revisionHistory[0].originalCriteria) === JSON.stringify(by(id[0]).WORK_ITEM_CONTRACT.acceptance_criteria));
    const s1 = derive(X, { inspection: xInsp() });
    check(`${id}: inspection ACCEPT sha-bound ⇒ RUN_CONTROLLED_EXPERIMENTS derived (R4), execution authorized`, s1.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && s1.executionAuthorized === true && s1.derivedSteps.some((d: any) => d.step === "RUN_CONTROLLED_EXPERIMENTS" && d.rule === "R4" && own.test(d.coveredBy)));
    const edited = clone(X); edited.WORK_ITEM_CONTRACT.preRegistration.thresholds.PASS += " (edited)";
    check(`${id}: contract edited after inspection ⇒ experiments NOT authorized`, derive(edited, { inspection: xInsp() }).executionAuthorized === false);
    check(`${id}: inspection record of another scenario (H, ${other}) ⇒ NOT authorized`, derive(X, { inspection: xInsp({ scenario: "H" }) }).executionAuthorized === false && derive(X, { inspection: xInsp({ scenario: other }) }).executionAuthorized === false);
    const exp = { contractSha256: XSHA, outcome: "PARTIAL" }; const xs = AS.experimentSha256(exp);
    const val = (o: any = {}) => ({ contractSha256: XSHA, experimentEvidence: { experimentSha256: xs }, experimentInspection: { verdict: "ACCEPT", inspectorSessionId: `insp-session-${id}-02`, authorSessionId: `exp-author-${id}-03` }, scenarioGrade: "PARTIAL", ...o });
    check(`${id} R5b: bound validation ⇒ all validated; upgrade (PASS on PARTIAL) refused`, derive(X, { inspection: xInsp(), experiment: exp, validation: val() }).currentStep === null && derive(X, { inspection: xInsp(), experiment: exp, validation: val({ scenarioGrade: "PASS" }) }).currentStep === "VALIDATE_CRITERIA");
    check(`${id} declares dispatchTargets.RUN_CONTROLLED_EXPERIMENTS with command + writeSet ⊆ write_set`, (() => { const t = X.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS; const ws = X.WORK_ITEM_CONTRACT.write_set; return ws.includes(t.command) && t.args.length === 1 && t.writeSet.includes(t.args[0]) && t.writeSet.length > 0 && t.writeSet.every((x: string) => ws.includes(x)); })());
  }
  // cross-binding refused (never cross-usable), in every direction
  const G2 = by("G2"), J2 = by("J2");
  const SRC: any = { G: "docs/odg/V165_OWNER_AUTHORIZATION.json#missionG", H: "docs/odg/V168_OWNER_AUTHORIZATION_H.json (V168)", G2: "docs/odg/V170_OWNER_AUTHORIZATION_HG.json#G (V170)", J2: "docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json (V171)" };
  const CON: any = { G, H, G2, J2 };
  for (const a of Object.keys(CON)) for (const b of Object.keys(SRC)) if (a !== b) {
    const c = clone(CON[a]); c.authorization.source = SRC[b];
    const r = derive(c, {});
    check(`cross-binding: ${a} with ${b}'s owner source ⇒ refused (R0, nothing derived)`, r.applicable === false && r.executionAuthorized === false && /R0/.test(r.reason));
  }
  const g2both = clone(G2); g2both.authorization.source = SRC.G2 + " + " + SRC.J2;
  check("G2 source citing BOTH V170 and V171 ⇒ refused (foreign directive)", derive(g2both, {}).applicable === false);
  const j2both = clone(J2); j2both.authorization.source = SRC.J2 + "; V165";
  check("J2 source also citing V165 ⇒ refused (foreign directive)", derive(j2both, {}).applicable === false);
  check("ownerSourceCheck: G2 ⇔ V170 only, J2 ⇔ V171 only", AS.ownerSourceCheck("G2", SRC.G2).ok === true && AS.ownerSourceCheck("J2", SRC.J2).ok === true && AS.ownerSourceCheck("G2", SRC.J2).ok === false && AS.ownerSourceCheck("J2", SRC.G2).ok === false);
  check("G and H bindings unchanged (sources still own-bound; committed G/H entries derive as before)", AS.ownerSourceCheck("G", SRC.G).ok === true && AS.ownerSourceCheck("H", SRC.H).ok === true && derive(G, { inspection: inspection() }).executionAuthorized === true && derive(H, {}).currentStep === derive(clone(H), {}).currentStep && /V165/.test(AS.OWNER_SOURCES.G.re.source) && /V168/.test(AS.OWNER_SOURCES.H.re.source));
  check("G and J contract entries untouched by V17.2 (G sha pinned in its records; J has no authorization block)", AS.contractSha256(G) === "ac79b1744bf4978b768d7909a312d28eefb3e8e005a0ed60a8f7ac821c87a8cd" && AS.contractSha256(H) === "8436885a2d483c4f26db3753de6fdbc6dd42296602ede9be7d4b9860c8e672e2" && !!by("J").authorization && AS.ownerSourceCheck("J", by("J").authorization.source).ok === true);
  // V17.6 — J bound to its OWN owner record (V176 « DÉBLOCAGE FINAL » item 2); J2's V171 record never covers J and vice versa.
  const JC = by("J"); const SRC_J = "docs/odg/V176_OWNER_AUTHORIZATION_J.json (V176)";
  const dj = derive(JC, {});
  check("J (V17.6): scoped, bound to V176 only; current step REVISE_CONTRACT (no preRegistration ⇒ R2 not validated); execution NOT authorized", JC.state === "AUTHORIZED_FOR_REVISION" && dj.applicable === true && dj.currentStep === "REVISE_CONTRACT" && dj.currentStepAuthorized === true && dj.executionAuthorized === false && /preRegistration/.test(dj.reason) && JC.authorization.executionAuthorized === false && !JC.authorization.dispatchTargets);
  check("J (V17.6): an ACCEPT inspection cannot validate while R2 fails (no derived experiments)", derive(JC, { inspection: { scenario: "J", verdict: "ACCEPT", contractSha256: AS.contractSha256(JC), inspectorSessionId: "inspector-x-0001", authorSessionId: "j-authorize-v176", inspectedHeadSha: "a".repeat(40) } }).executionAuthorized === false);
  check("J ⇔ V176 only: J with V171 (J2's) source refused; J2 with V176 refused; unknown 'J3' refused", AS.ownerSourceCheck("J", SRC_J).ok === true && AS.ownerSourceCheck("J", SRC.J2).ok === false && AS.ownerSourceCheck("J2", SRC_J).ok === false && (() => { const c = clone(JC); c.authorization.source = SRC.J2; return derive(c, {}).applicable === false; })() && AS.ownerSourceCheck("J3", SRC.J2).ok === false);
  check("J (V17.6): owner quote verbatim in authorizedBy; prior result V161_SCENARIO_J.json untouched", /autoriser son passage de PROPOSED à AUTHORIZED\. GO peut le sélectionner et l'exécuter selon son contrat, dès que les conditions requises sont conformes\. Une seule exécution initiale, avec résultat enregistré honnêtement\./.test(JC.authorizedBy) && require("crypto").createHash("sha256").update(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V161_SCENARIO_J.json"))).digest("hex") === "11245ce051234b4218b8859e159307eef3652ebc59ce00e32b8782371e461bff");
}
// V17.5 — V175-NB1 (owner V175, first ODG-native build): same 4-step sequence; bound ONLY to its own owner record.
{
  const CF = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8"));
  const by = (id: string) => CF.contracts.find((c: any) => c.scenario === id);
  const X = by("V175-NB1"); const J2 = by("J2"); const H = by("H");
  const XSHA = AS.contractSha256(X);
  const XSID = X.revisionHistory[X.revisionHistory.length - 1].revisionAuthorSessionId;
  const xInsp = (o: any = {}) => ({ scenario: "V175-NB1", verdict: "ACCEPT", contractSha256: XSHA, inspector: "independent inspector (fixture)", inspectorSessionId: "inspector-sid-nb1-0001", authorSessionId: XSID, inspectedHeadSha: HEAD, inspectedPr: 997, ...o });
  const SRC_NB1 = "docs/odg/V175_OWNER_AUTHORIZATION_NATIVE_BUILD.json (V175)";
  check("STEP_SEQUENCES.V175-NB1 = the same 4 steps as H", AS.STEP_SEQUENCES["V175-NB1"].join(",") === AS.STEP_SEQUENCES.H.join(","));
  const s0 = derive(X, {});
  check("committed V175-NB1: owner V175 recognized, REVISE validated, INSPECT current, nothing executable", s0.applicable === true && /V175_OWNER_AUTHORIZATION_NATIVE_BUILD\.json/.test(s0.owner.source) && s0.currentStep === "INSPECT_REVISED_CONTRACT" && s0.executionAuthorized === false && X.authorization.executionAuthorized === false && XSID === "nb1-go-path-v175");
  const s1 = derive(X, { inspection: xInsp() });
  check("V175-NB1: inspection ACCEPT sha-bound ⇒ RUN_CONTROLLED_EXPERIMENTS derived (R4, covered by V175)", s1.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && s1.executionAuthorized === true && s1.derivedSteps.some((d: any) => d.rule === "R4" && /V175_OWNER_AUTHORIZATION_NATIVE_BUILD/.test(d.coveredBy)));
  const edited = clone(X); edited.WORK_ITEM_CONTRACT.preRegistration.thresholds.PASS += " (edited)";
  check("V175-NB1: contract edited after inspection ⇒ NOT authorized; inspection of J2 ⇒ NOT authorized", derive(edited, { inspection: xInsp() }).executionAuthorized === false && derive(X, { inspection: xInsp({ scenario: "J2" }) }).executionAuthorized === false);
  for (const [lbl, src] of [["V171 (J2)", "docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json (V171)"], ["V168 (H)", "docs/odg/V168_OWNER_AUTHORIZATION_H.json (V168)"], ["V165 (G)", "docs/odg/V165_OWNER_AUTHORIZATION.json#missionG"]] as any) {
    const c = clone(X); c.authorization.source = src;
    check(`cross-binding: V175-NB1 with ${lbl} source ⇒ refused (R0)`, derive(c, {}).applicable === false);
  }
  const both = clone(X); both.authorization.source = SRC_NB1 + " + docs/odg/V171_OWNER_AUTHORIZATION_PORTFOLIO.json";
  check("V175-NB1 source also citing V171 ⇒ refused (foreign directive)", derive(both, {}).applicable === false);
  const j2nb = clone(J2); j2nb.authorization.source = SRC_NB1;
  const hnb = clone(H); hnb.authorization.source = SRC_NB1;
  check("V175 record cannot authorize J2 or H (R0)", derive(j2nb, {}).applicable === false && derive(hnb, {}).applicable === false && AS.ownerSourceCheck("V175-NB1", SRC_NB1).ok === true && AS.ownerSourceCheck("J2", SRC_NB1).ok === false);
  const t = X.authorization.dispatchTargets.RUN_CONTROLLED_EXPERIMENTS; const ws = X.WORK_ITEM_CONTRACT.write_set;
  check("V175-NB1 dispatch target = the runner, writeSet = the result record only, ⊆ write_set; native patch write set = 2 files", t.command === "runtime/bin/odg-v175-native-build-run.ts" && JSON.stringify(t.writeSet) === JSON.stringify(["docs/odg/evidence/V175_NATIVE_BUILD_RESULT.json"]) && ws.includes(t.command) && t.writeSet.every((x: string) => ws.includes(x)) && X.WORK_ITEM_CONTRACT.nativePatchWriteSet.length === 2);
  check("V175-NB1 declares its inspection record path (GO AUTH_EVIDENCE)", X.authorization.inspectionRecord === "docs/odg/evidence/V175_NB1_CONTRACT_INSPECTION.json");
}
// V16.9 Phase 1b — R7 proof currency on the REAL committed H records with the REAL local-git probes + labelled mutations
{
  const CF = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8"));
  const H = CF.contracts.find((c: any) => c.scenario === "H");
  const rd = (rel: string) => ({ ...JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")), recordPath: rel });
  const ev = { inspection: rd("docs/odg/evidence/V168_H_CONTRACT_INSPECTION.json"), experiment: rd("docs/odg/evidence/V168_H_EXPERIMENT.json"), validation: rd("docs/odg/evidence/V168_H_CRITERIA_VALIDATION.json") };
  const real = OCUR.localGitProbes(ROOT);
  const gitOk = real.commitExists(ev.inspection.inspectedHeadSha);
  if (!gitOk) process.stdout.write("skip - R7 real-git block: inspected head absent from this clone (shallow?) — real-git assertions not run\n");
  else {
    const s = AS.deriveAuthorizationScope(H, { ...ev, probes: real });
    check("R7 real: committed H chain with local-git probes ⇒ 4/4 steps validated, each with proofCurrency usableAsProof", s.currentStep === null && s.validatedSteps.length === 4 && s.validatedSteps.slice(1).every((v: any) => v.evidence.proofCurrency && v.evidence.proofCurrency.usableAsProof === true));
    const ghost = "deadbeef".repeat(5);
    const g = AS.deriveAuthorizationScope(H, { ...ev, probes: real, inspection: { ...ev.inspection, inspectedHeadSha: ghost } });
    check("R7: well-formed but NON-EXISTENT inspectedHeadSha ⇒ WRONG_COMMIT ⇒ INSPECT not validated, experiments NOT authorized", g.currentStep === "INSPECT_REVISED_CONTRACT" && g.executionAuthorized === false && /R7 proof currency WRONG_COMMIT/.test(g.reason));
    const noProbe = AS.deriveAuthorizationScope(H, ev);
    check("R7: no probe injected ⇒ head not verifiable ⇒ refused (fail-closed, never assumed)", noProbe.currentStep === "INSPECT_REVISED_CONTRACT" && /NO_PROBE/.test(noProbe.reason));
    const notAnc = { ...real, isAncestorOfMain: () => false };
    check("R7: commit exists but is NOT an ancestor of main ⇒ refused", AS.deriveAuthorizationScope(H, { ...ev, probes: notAnc }).currentStep === "INSPECT_REVISED_CONTRACT");
    const ds = ev.experiment.inputs.dataset.path;
    const staleDs = { ...real, fileSha256: (rel: string) => (rel === ds ? "0".repeat(64) : real.fileSha256(rel)) };
    const st = AS.deriveAuthorizationScope(H, { ...ev, probes: staleDs });
    check("R7: cited dataset changed since the experiment (labelled probe mutation) ⇒ experiment STALE ⇒ RUN_CONTROLLED_EXPERIMENTS not validated", st.currentStep === "RUN_CONTROLLED_EXPERIMENTS" && /R7 proof currency STALE/.test(st.reason));
    const xp = ev.validation.experimentEvidence.path;
    const staleX = { ...real, fileSha256: (rel: string) => (rel === xp ? "1".repeat(64) : real.fileSha256(rel)) };
    check("R7: graded experiment file changed since the validation ⇒ VALIDATE_CRITERIA not validated", AS.deriveAuthorizationScope(H, { ...ev, probes: staleX }).currentStep === "VALIDATE_CRITERIA");
  }
}
if (failures) { process.stdout.write(`${failures} FAILED\n`); process.exit(1); }
process.stdout.write("all odg-authorization-scope tests passed\n");
export {};
