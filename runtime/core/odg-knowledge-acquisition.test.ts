#!/usr/bin/env node
"use strict";
/* V227 §2/§3 — knowledge acquisition. Proves: the REAL executed cycle (SWE-bench Verified, 2 independent accessible
 * sources + 2 inaccessible 403) ⇒ FACT_CORROBORATED (not official); single source ⇒ not verified; contradiction ⇒
 * CONTESTED; opinion/hypothesis never promoted to fact; 403 never counted/circumvented; reuses V221; deterministic. */
const K = require("./odg-knowledge-acquisition.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // the REAL executed research cycle
  const r = K.acquire(K.REAL_CYCLE);
  const swe = r.knowledge.find((x: any) => /500-instance/.test(x.claim));
  check("REAL cycle: SWE-bench '500 tasks' CORROBORATED by 2 INDEPENDENT accessible sources ⇒ FACT_CORROBORATED + verified", swe && swe.classification === "FACT_CORROBORATED" && swe.independentSupportCount === 2 && swe.verifiedKnowledge === true);
  check("REAL cycle: corroboration is NOT official (primary openai.com was 403) — honest", swe.officialCorroboration === false && /official primary not confirmed/.test(swe.note));
  check("REAL cycle: 2 INACCESSIBLE 403 sources recorded, never counted as support, never circumvented", r.inaccessibleCount === 2 && r.inaccessible.every((s: any) => s.httpStatus === 403 && /not circumvented/.test(s.note)) && r.accessibleCount === 2);
  check("REAL cycle: query + capability (P6 eval) carried; exactly 1 verified fact", r.query && /P6/.test(r.capability) && r.verifiedCount === 1);

  // a SINGLE accessible source ⇒ NOT verified knowledge
  const single = K.acquire({ query: "q", sources: [{ url: "https://a.test/x", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "some fact", type: "FACT" }] }] });
  check("single accessible source ⇒ CLAIM_SINGLE_SOURCE, NOT verified", single.knowledge[0].classification === "CLAIM_SINGLE_SOURCE" && single.knowledge[0].verifiedKnowledge === false && r.verifiedCount >= 0);

  // a contradiction across sources ⇒ CONTESTED
  const contested = K.acquire({ query: "q", sources: [
    { url: "https://a.test/x", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "X is 500", type: "FACT", stance: "SUPPORTS" }] },
    { url: "https://b.test/y", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "X is 500", type: "FACT", stance: "CONTRADICTS" }] },
  ] });
  check("contradicting sources ⇒ CONTESTED, not recorded as fact", contested.knowledge[0].classification === "CONTESTED" && contested.knowledge[0].verifiedKnowledge === false);

  // opinion/hypothesis are kept as type, never promoted to fact even if corroborated by 2 sources
  const opinion = K.acquire({ query: "q", sources: [
    { url: "https://a.test/x", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "approach Z is best", type: "OPINION" }] },
    { url: "https://b.test/y", status: "RETRIEVED", consultedDate: "2026-11-16", claims: [{ text: "approach Z is best", type: "OPINION" }] },
  ] });
  check("an OPINION corroborated by 2 sources is still OPINION_RECORDED, NEVER a verified fact", opinion.knowledge[0].classification === "OPINION_RECORDED" && opinion.knowledge[0].verifiedKnowledge === false);

  check("contract: ≥2 independent for fact, 403 never counted, opinion≠fact, reuses corroboration", K.KNOWLEDGE_ACQUISITION_CONTRACT.invariants.some((i: string) => /≥2 INDEPENDENT/.test(i)) && K.KNOWLEDGE_ACQUISITION_CONTRACT.invariants.some((i: string) => /NEVER circumvented/.test(i)) && K.KNOWLEDGE_ACQUISITION_CONTRACT.invariants.some((i: string) => /no second radar/.test(i)));
  check("deterministic + frozen", JSON.stringify(K.acquire(K.REAL_CYCLE)) === JSON.stringify(r) && Object.isFrozen(r) && Object.isFrozen(K.REAL_CYCLE));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — knowledge-acquisition (V227 §2/§3: REAL autonomous cycle discover→access→extract→corroborate→classify; SWE-bench '500' FACT_CORROBORATED by 2 independent sources [not official]; 403 recorded/not circumvented; single≠verified; contradiction⇒CONTESTED; opinion≠fact; reuses V221)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
