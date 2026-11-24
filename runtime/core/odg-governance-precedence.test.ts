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

  // CTR-4 — ordering continuity-first vs Radar-first; three numberings
  const po = G.phaseOrder();
  const o = G.checkOrdering(rec).concat(G.checkMatrix(rec, "CTR-4"));
  check("CTR-4: continuity no later than Radar in V14.4/addendum/V15.0; all numberings mapped onto V14.4; matrix cites the record", o.length === 0 && po.V14_4.continuity === 0 && po.V14_4.radar === 1 && po.ADDENDUM.continuity === 1 && po.ADDENDUM.radar === 5 && po.V15_0.continuity === 2 && po.V15_0.radar === 10, { o, po });

  process.stdout.write(failures ? `\n${failures} FAILED\n` : "\nall passed\n");
  if (failures) process.exit(1);
}
main();
export {};
