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
  // Q-CTR2 is BLOCKING: a future V15.0-campaign contract writing the knowledge stage is refused while unanswered; not otherwise
  const kw = { id: "synthetic-v150-knowledge", v150Campaign: true, scope: "internal only; no Radar code/grant change", writeSet: ["runtime/core/odg-knowledge-intelligence.ts"], anchored: false };
  const blocked = G.checkRadarScope(rec, undefined, [kw]);
  const answered = { ...rec, ownerQuestions: rec.ownerQuestions.map((q: any) => (q.id === "Q-CTR2" ? { ...q, answer: "owner answer (synthetic)" } : q)) };
  const nonCampaign = G.checkRadarScope(rec, undefined, [{ ...kw, id: "synthetic-v124", v150Campaign: false }]);
  check("CTR-2 Q-CTR2-BLOCK: V15.0-campaign knowledge-stage write BLOCKED while unanswered; lifted once answered; non-campaign unaffected", blocked.length === 1 && /BLOCKED by Q-CTR2/.test(blocked[0]) && G.checkRadarScope(answered, undefined, [kw]).length === 0 && nonCampaign.length === 0, { blocked, nonCampaign });
  const r2 = rec.resolutions.find((x: any) => x.id === "CTR-2");
  check("CTR-2 interim is never presented as plainly RESOLVED (status INTERIM pending Q-CTR2, Q-CTR2 blocking, owner record quoted)", r2.ownerChoiceNeeded === true && r2.status === "RESOLVED_BY_SCOPE + INTERIM pending Q-CTR2" && rec.ownerQuestions[0].blocking === true && rec.authority.record === "docs/odg/V175_OWNER_DIRECTIVE_REPRISE_IMMEDIATE.json" && rec.authority.quotes.length === 4);

  // CTR-4 — ordering continuity-first vs Radar-first; three numberings
  const po = G.phaseOrder();
  const o = G.checkOrdering(rec).concat(G.checkMatrix(rec, "CTR-4"));
  check("CTR-4: continuity no later than Radar in V14.4/addendum/V15.0; all numberings mapped onto V14.4; matrix cites the record", o.length === 0 && po.V14_4.continuity === 0 && po.V14_4.radar === 1 && po.ADDENDUM.continuity === 1 && po.ADDENDUM.radar === 5 && po.V15_0.continuity === 2 && po.V15_0.radar === 10, { o, po });

  process.stdout.write(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
  if (failures) process.exit(1);
}
main();
export {};
