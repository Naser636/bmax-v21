#!/usr/bin/env node
"use strict";
/* V221 §2.1/§5.3 — claim corroboration. Proves: ≥2 independent supports ⇒ CORROBORATED; 1 source (even official) ⇒
 * SINGLE_SOURCE (not corroboration); any contradiction ⇒ CONTESTED; neutral/non-URL never counts; official backing bounds
 * confidence; reuses V218; real EUR-Lex retrieval used as a genuine corroboration example; deterministic + frozen. */
const C = require("./odg-claim-corroboration.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

// REAL retrieval (WebFetch, 2026-11-16, official source eur-lex.europa.eu):
//   EAA = Directive (EU) 2019/882, applies 28 June 2025; CRA = Regulation (EU) 2024/2847 (Cyber Resilience Act).
const OFFICIAL_EAA = "https://eur-lex.europa.eu/eli/dir/2019/882/oj/eng";
const BLOG_EAA_1 = "https://alokai.com/blog/european-accessibility-act-2025";
const BLOG_EAA_2 = "https://www.disabilityworld.org/articles/eaa-first-year-enforcement-report/";

function main() {
  // single source (even official) is NOT corroboration
  const single = C.corroborate({ claim: "EAA applies 2025", evidence: [{ url: OFFICIAL_EAA, stance: "SUPPORTS" }] });
  check("one source only (even official) ⇒ SINGLE_SOURCE, not corroboration (confidence LOW)", single.level === "SINGLE_SOURCE" && single.confidence === "LOW" && /is NOT corroboration/.test(single.note));

  // two independent blogs ⇒ CORROBORATED but NOT officially
  const twoBlogs = C.corroborate({ claim: "EAA 2025", evidence: [{ url: BLOG_EAA_1, stance: "SUPPORTS" }, { url: BLOG_EAA_2, stance: "SUPPORTS" }] });
  check("2 independent (distinct-host) supports ⇒ CORROBORATED, officialCorroboration false (both unregistered)", twoBlogs.level === "CORROBORATED" && twoBlogs.independentSupportCount === 2 && twoBlogs.officialCorroboration === false && twoBlogs.confidence === "MEDIUM");

  // real example: blog + OFFICIAL EUR-Lex ⇒ CORROBORATED + official (HIGH), the genuine retrieved parcours
  const withOfficial = C.corroborate({ claim: "EAA applies 28 June 2025", evidence: [{ url: BLOG_EAA_1, stance: "SUPPORTS" }, { url: OFFICIAL_EAA, stance: "SUPPORTS" }] });
  check("blog + official EUR-Lex ⇒ CORROBORATED with officialCorroboration true (HIGH) — real retrieved parcours", withOfficial.level === "CORROBORATED" && withOfficial.officialCorroboration === true && withOfficial.confidence === "HIGH" && withOfficial.independentSupportHosts.includes("eur-lex.europa.eu"));

  // same host twice is NOT independent corroboration
  const sameHost = C.corroborate({ claim: "x", evidence: [{ url: "https://alokai.com/blog/a", stance: "SUPPORTS" }, { url: "https://alokai.com/blog/b", stance: "SUPPORTS" }] });
  check("two URLs from the SAME host ⇒ only 1 independent support ⇒ SINGLE_SOURCE (not corroborated)", sameHost.independentSupportCount === 1 && sameHost.level === "SINGLE_SOURCE");

  // any contradiction ⇒ CONTESTED, surfaced
  const contested = C.corroborate({ claim: "x", evidence: [{ url: BLOG_EAA_1, stance: "SUPPORTS" }, { url: OFFICIAL_EAA, stance: "SUPPORTS" }, { url: "https://news.example/retraction", stance: "CONTRADICTS" }] });
  check("any contradicting source ⇒ CONTESTED (DISPUTED), conflict surfaced, never silently corroborated", contested.level === "CONTESTED" && contested.confidence === "DISPUTED" && contested.contradictions.length === 1 && /conflict is surfaced/.test(contested.note));

  // neutral / non-URL never counts as support
  const neutral = C.corroborate({ claim: "x", evidence: [{ url: BLOG_EAA_1, stance: "NEUTRAL" }, { url: "(a portal, not a url)", stance: "SUPPORTS" }] });
  check("NEUTRAL stance and non-URL source never count as independent support", neutral.independentSupportCount === 0 && neutral.level === "UNCORROBORATED");
  check("no evidence ⇒ UNCORROBORATED (never a fact)", C.corroborate({ claim: "x", evidence: [] }).level === "UNCORROBORATED");

  // composes a radar opportunity: its cited sources (SUPPORTS) + an extra official source
  const oppCorr = C.corroborateOpportunity({ id: "eaa-accessibility-eu", provenance: "OBSERVED_EVIDENCE", sources: [BLOG_EAA_1, BLOG_EAA_2] }, [{ url: OFFICIAL_EAA, stance: "SUPPORTS" }]);
  check("corroborateOpportunity: radar blogs + official ⇒ CORROBORATED + official, id preserved", oppCorr.id === "eaa-accessibility-eu" && oppCorr.level === "CORROBORATED" && oppCorr.officialCorroboration === true);

  // ---- V222 TEMPORAL qualification: dates de consultation, obsolescence, contradiction temporelle ----
  const ASOF = Date.UTC(2026, 10, 16); // 2026-11-16 (injected, deterministic)
  const freshCase = C.corroborate({ claim: "x", asOfEpochMs: ASOF, freshnessDays: 365, evidence: [{ url: BLOG_EAA_1, stance: "SUPPORTS", date: "2026-11-01" }, { url: OFFICIAL_EAA, stance: "SUPPORTS", date: "2026-11-10" }] });
  check("recent dated supports ⇒ freshness FRESH (CORROBORATED), per-item ageDays computed", freshCase.freshness === "FRESH" && freshCase.level === "CORROBORATED" && freshCase.evidence[0].ageDays >= 0);
  const staleCase = C.corroborate({ claim: "x", asOfEpochMs: ASOF, freshnessDays: 365, evidence: [{ url: BLOG_EAA_1, stance: "SUPPORTS", date: "2023-01-01" }, { url: OFFICIAL_EAA, stance: "SUPPORTS", date: "2023-02-01" }] });
  check("supports older than the freshness window ⇒ CORROBORATED but STALE (re-verify), surfaced in note", staleCase.freshness === "STALE" && staleCase.level === "CORROBORATED" && /possibly OUTDATED; re-verify/.test(staleCase.note));
  const undated = C.corroborate({ claim: "x", evidence: [{ url: BLOG_EAA_1, stance: "SUPPORTS" }, { url: OFFICIAL_EAA, stance: "SUPPORTS" }] });
  check("no asOf/dates ⇒ freshness UNDATED (not assessed); level logic unchanged", undated.freshness === "UNDATED" && undated.level === "CORROBORATED" && /freshness NOT assessed/.test(undated.note));
  const superseded = C.corroborate({ claim: "x", asOfEpochMs: ASOF, evidence: [{ url: BLOG_EAA_1, stance: "SUPPORTS", date: "2024-01-01" }, { url: "https://news.example/update", stance: "CONTRADICTS", date: "2026-10-01" }] });
  check("a NEWER contradiction than the supports ⇒ CONTESTED + supersededByNewerContradiction flag", superseded.level === "CONTESTED" && superseded.supersededByNewerContradiction === true && /may be SUPERSEDED/.test(superseded.note));

  check("contract: ≥2 independent for corroboration, contradiction⇒CONTESTED, single≠corroboration, temporal, reuses V218", C.CLAIM_CORROBORATION_CONTRACT.invariants.some((i: string) => /≥2 INDEPENDENT/.test(i)) && C.CLAIM_CORROBORATION_CONTRACT.invariants.some((i: string) => /ANY contradicting source ⇒ CONTESTED/.test(i)) && C.CLAIM_CORROBORATION_CONTRACT.invariants.some((i: string) => /SUPERSEDED/.test(i)) && C.CLAIM_CORROBORATION_CONTRACT.invariants.some((i: string) => /no second provenance\/registry/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.corroborate({ claim: "EAA applies 28 June 2025", evidence: [{ url: BLOG_EAA_1, stance: "SUPPORTS" }, { url: OFFICIAL_EAA, stance: "SUPPORTS" }] })) === JSON.stringify(withOfficial) && Object.isFrozen(withOfficial));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — claim-corroboration (V221 §2.1/§5.3: ≥2 independent supports⇒CORROBORATED; 1 source [even official]⇒SINGLE_SOURCE; any contradiction⇒CONTESTED; neutral/non-URL never counts; official bounds confidence; reuses V218; real EUR-Lex retrieval example)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
