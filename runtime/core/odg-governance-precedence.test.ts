#!/usr/bin/env node
"use strict";
/* V17.5 — regression guard for the reconciliation contradictions resolved at source by
 * docs/odg/evidence/V175_GOVERNANCE_PRECEDENCE.json. One test per contradiction; each FAILS if the contradiction reappears
 * (a quote drifts from its owner source, a layer status changes without re-evaluation, a V15.0-campaign contract writes the
 * Radar, an ordering flips, or the reconciliation matrix re-encodes the resolved CONTRADICTION reading). Read-only, offline. */
const G = require("./odg-governance-precedence.js");
let failures = 0; function check(n: string, c: boolean, detail?: any) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + (c || detail === undefined ? "" : " :: " + JSON.stringify(detail)) + "\n"); if (!c) failures++; }

function main() {
  const rec = G.loadRecord();
  const bad = G.verifyQuotes(rec).filter((q: any) => !q.ok);
  check("every quote of the precedence record is verbatim in its cited source", bad.length === 0, bad);

  // CTR-1 — §51 rule 1 'directive unique de cette campagne' vs V14.4 ADOPTED
  const p = G.checkPrecedence(rec).concat(G.checkMatrix(rec, "CTR-1"));
  check("CTR-1: a PROPOSED V15.0 never outranks V12.4/V14.4/addendum; §51 rule 1 campaign-scoped; matrix cites the record", p.length === 0, p);

  // CTR-2 — §38/§47 'Radar unchanged' vs V14.4 phase 1 / V12.4 I Radar extensions
  check("CTR-2 classifier: Radar stage vs knowledge stage (#911 file is KNOWLEDGE_STAGE)", G.classifyPath(rec, "runtime/core/odg-radar-gate-chain.ts") === "RADAR_STAGE" && G.classifyPath(rec, "runtime/core/research-governor.ts") === "RADAR_STAGE" && G.classifyPath(rec, "docs/odg/V372_RESEARCH_GRANT.json") === "RADAR_STAGE" && G.classifyPath(rec, "runtime/core/odg-knowledge-intelligence.ts") === "KNOWLEDGE_STAGE");
  const cs = G.campaignContracts(rec);
  const r = G.checkRadarScope(rec).concat(G.checkMatrix(rec, "CTR-2"));
  check("CTR-2: no V15.0-campaign contract writes the Radar; Radar-stage writes only under V12.4 I / V14.4 phase-1 anchors; matrix cites the record", r.length === 0 && cs.filter((c: any) => c.v150Campaign).length >= 17 && cs.some((c: any) => !c.v150Campaign && c.anchored), r);
  // the guard is live: the contradiction re-introduced synthetically is flagged (V15.0 item writing the Radar / unanchored Radar write)
  const reintro = G.checkRadarScope(rec, undefined, [
    { id: "synthetic-v150", v150Campaign: true, scope: "internal only", writeSet: ["runtime/core/odg-radar-collection-adapter.ts"], anchored: false },
    { id: "synthetic-unanchored", v150Campaign: false, scope: "", writeSet: ["runtime/core/research-governor.ts"], anchored: false },
  ]);
  check("CTR-2 guard is not vacuous (re-introduced contradiction ⇒ 3 violations)", reintro.length === 3, reintro);
  // Q-CTR2 history: the BLOCK rule still works when unanswered (record copy with answer null); non-campaign unaffected
  const kw = { id: "synthetic-v150-knowledge", v150Campaign: true, scope: "internal only; no Radar code/grant change", writeSet: ["runtime/core/odg-knowledge-intelligence.ts"], anchored: false };
  const withQ = (patch: any) => ({ ...rec, ownerQuestions: rec.ownerQuestions.map((q: any) => (q.id === "Q-CTR2" ? { ...q, ...patch } : q)) });
  const unanswered = withQ({ answer: null, answerReading: undefined, blocking: true });
  const blocked = G.checkRadarScope(unanswered, undefined, [kw]);
  const nonCampaign = G.checkRadarScope(unanswered, undefined, [{ ...kw, id: "synthetic-v124", v150Campaign: false }]);
  check("CTR-2 Q-CTR2-BLOCK (history): V15.0-campaign knowledge-stage write BLOCKED while unanswered; non-campaign unaffected", blocked.length === 1 && /BLOCKED by Q-CTR2/.test(blocked[0]) && nonCampaign.length === 0, { blocked, nonCampaign });
  // V176 (owner item 1) — Q-CTR2 ANSWERED = STAGE: part A coherent; part B resolved by PREC-1 (stage reading rests on V12.4/V14.4,
  // function reading only on the addendum / PROPOSED V15.0) ⇒ block lifted, the resolved reading is enforced
  const q2 = rec.ownerQuestions.find((q: any) => q.id === "Q-CTR2");
  const d = q2.v176Derivation;
  const qd = G.checkQctr2Derivation(rec);
  check("V176 Q-CTR2 answered STAGE by PREC-1: cites V176 owner record + resolvedBy; blocking=false; history kept; FUNCTION reading disclosed", qd.length === 0 && q2.answer !== null && q2.answerReading === "STAGE" && q2.blocking === false && q2.blockingBefore === undefined && d.blockingBefore === true && d.answerBefore === null && typeof q2.residualQuestionBefore === "string" && d.partA.coherent === true && d.partB.coherentBefore === false && d.partB.resolution.rule === "PREC-1" && d.partB.readingFunction.quotes.length > 0 && /^PROVIDER applying owner V176 item 1/.test(q2.resolvedBy), qd);
  check("V176 resolved reading enforced: a V15.0-campaign contract writing odg-knowledge-* is now evaluated by the STAGE rule (allowed; #911 legitimate)", G.checkRadarScope(rec, undefined, [kw]).length === 0 && G.classifyPath(rec, "runtime/core/odg-knowledge-intelligence.ts") === "KNOWLEDGE_STAGE");
  const fnOverride = G.checkRadarScope(withQ({ answerReading: "FUNCTION" }), undefined, [kw]);
  const noReading = G.checkRadarScope(withQ({ answerReading: undefined }), undefined, [kw]);
  check("V176 answered reading drives the rule: owner override FUNCTION ⇒ knowledge-stage write is a Radar modification; unknown reading ⇒ refused (fail-closed)", fnOverride.length === 1 && /answer FUNCTION/.test(fnOverride[0]) && noReading.length === 1, { fnOverride, noReading });
  const newAdds = G.checkRadarScope(rec, undefined, [
    { id: "synthetic-v150-new-grant", v150Campaign: true, scope: "internal only; no Radar code/grant change", writeSet: ["docs/odg/V999_RESEARCH_GRANT.json"], anchored: false },
    { id: "synthetic-v150-new-radar-module", v150Campaign: true, scope: "internal only; no Radar code/grant change", writeSet: ["runtime/core/odg-radar-new-stage.ts"], anchored: false },
  ]);
  check("V176 part A enforced: a NEW grant file / NEW Radar module in a V15.0-campaign item is a Radar modification", newAdds.length === 2 && newAdds.every((x: string) => /writes Radar-stage paths/.test(x)), newAdds);
  // premature-lift guard: the answer is refused when PREC-1 does not actually resolve part B (alternative on an equal/higher layer)
  const pbWith = (fq: any[]) => withQ({ v176Derivation: { ...d, partB: { ...d.partB, readingFunction: { ...d.partB.readingFunction, quotes: fq } } } });
  const higherAlt = pbWith(d.partB.readingFunction.quotes.concat([{ source: "V12_4", path: "docs/odg/v124-consolidated-roadmap.json", text: "odg-global-opportunity-radar" }]));
  const noRes = withQ({ v176Derivation: { ...d, partB: { ...d.partB, resolution: undefined, coherent: false } } });
  check("V176 guard: Q-CTR2 answer refused when PREC-1 does not resolve part B (alternative as high as V12.4) or part B unresolved", G.checkQctr2Derivation(higherAlt).some((x: string) => /PREC-1 does not resolve/.test(x)) && G.checkQctr2Derivation(noRes).length >= 1);
  const r2 = rec.resolutions.find((x: any) => x.id === "CTR-2");
  check("CTR-2 RESOLVED (no longer INTERIM), history kept, matrix row V150-S38 no longer CONTRADICTION", r2.ownerChoiceNeeded === false && r2.ownerChoiceNeededBefore === true && /^RESOLVED_BY_SCOPE \+ RESOLVED_BY_PRECEDENCE/.test(r2.status) && r2.statusBefore === "RESOLVED_BY_SCOPE + INTERIM pending Q-CTR2" && !/INTERIM/.test(r2.status) && rec.authority.record === "docs/odg/V175_OWNER_DIRECTIVE_REPRISE_IMMEDIATE.json" && rec.authority.quotes.length === 4 && G.checkMatrix(rec, "CTR-2").length === 0);

  // CTR-4 — ordering continuity-first vs Radar-first; three numberings
  const po = G.phaseOrder();
  const o = G.checkOrdering(rec).concat(G.checkMatrix(rec, "CTR-4"));
  check("CTR-4: continuity no later than Radar in V14.4/addendum/V15.0; all numberings mapped onto V14.4; matrix cites the record", o.length === 0 && po.V14_4.continuity === 0 && po.V14_4.radar === 1 && po.ADDENDUM.continuity === 1 && po.ADDENDUM.radar === 5 && po.V15_0.continuity === 2 && po.V15_0.radar === 10, { o, po });

  process.stdout.write(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
  if (failures) process.exit(1);
}
main();
export {};
