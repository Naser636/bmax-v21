#!/usr/bin/env node
"use strict";
/* V218 §2/§3 — radar source-provenance resolver. Proves: cross-checks radar-cited URLs vs the canonical source-registry;
 * UNREGISTERED never upgraded; REGISTERED_OFFICIAL doesn't make a claim true; reuses source-registry (no 2nd registry);
 * wires the previously-unconsumed registry; deterministic + frozen. */
const P = require("./odg-radar-source-provenance.js");
const REG = require("./source-registry.js");
const RADAR = require("./odg-global-opportunity-radar.js");
function RADARLEN(): number { return RADAR.OPPORTUNITIES.length; }
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // a registered OFFICIAL feed (TED) resolves; an ad-hoc blog does NOT.
  const ted = P.classifySource("https://api.ted.europa.eu/v3/notices/search");
  check("a registered OFFICIAL source (TED) is classified REGISTERED_OFFICIAL with verified access/cost", ted.registered === true && ted.provenanceClass === "REGISTERED_OFFICIAL" && ted.sourceId === "TED" && typeof ted.costEurPerMonth === "number");
  const blog = P.classifySource("https://alokai.com/blog/european-accessibility-act-2025");
  check("an ad-hoc blog URL is UNREGISTERED — provenance AS-DECLARED, never upgraded", blog.registered === false && blog.provenanceClass === "UNREGISTERED" && /NOT cross-verified as official/.test(blog.note));
  check("a non-URL string is NOT_A_URL (no fabricated host match)", P.classifySource("(vendor supplier portals)").provenanceClass === "NOT_A_URL" && P.classifySource(null).registered === false);
  check("host match is www-stripped + subdomain-tolerant but a different host never matches", P.classifySource("https://www.api.ted.europa.eu/x").registered === true && P.classifySource("https://evil-ted.europa.eu.attacker.com/x").sourceId !== "TED");
  // parent/bare domains must NOT be upgraded to a specific official source (never-upgrade invariant; fixes inspection finding)
  check("a PARENT/bare domain of a registry host stays UNREGISTERED (not upgraded to official)", P.classifySource("https://europa.eu/some-page").registered === false && P.classifySource("https://opendatasoft.com/anything").registered === false && P.classifySource("https://eu/x").registered === false);
  check("a true SUBDOMAIN of a registry host still matches", P.classifySource("https://notices.api.ted.europa.eu/x").sourceId === "TED");

  // per-opportunity qualification over a synthetic opp
  const q = P.qualifyOpportunity({ id: "t1", metier: "M5", provenance: "OBSERVED_EVIDENCE", sources: ["https://api.ted.europa.eu/v3/notices/search", "https://alokai.com/blog/x"] });
  check("qualifyOpportunity counts registered vs unregistered and labels PARTIAL (1 official + 1 ad-hoc)", q.citedCount === 2 && q.officialCount === 1 && q.unregisteredCount === 1 && q.sourceVerification === "PARTIAL");
  check("OBSERVED_EVIDENCE with an unregistered source stays a declared observation (not official-cross-verified)", /OBSERVED_EVIDENCE with UNREGISTERED sources stays a declared observation/.test(q.note));
  const none = P.qualifyOpportunity({ id: "t2", metier: "M3", provenance: "HYPOTHESIS", sources: [] });
  check("no sources ⇒ NO_SOURCES (not fabricated as verified)", none.sourceVerification === "NO_SOURCES" && none.registeredCount === 0);

  // full audit over the REAL radar opportunities — reveals the honest finding
  const a = P.audit();
  check("audits the REAL radar opportunities (opportunity count) and classifies each", a.total >= 1 && a.total === RADARLEN() && a.opportunities.every((r: any) => typeof r.sourceVerification === "string"));
  check("finding: most OBSERVED opportunities cite UNREGISTERED ad-hoc sources (separate silo), honestly surfaced", /UNREGISTERED ad-hoc web sources/.test(a.finding) && a.registry.count === REG.SOURCES.length && typeof a.registry.ownerDecision !== "undefined");
  check("honesty: UNREGISTERED never upgraded; official≠true-claim; yields dated V38/V39; reuses source-registry", /NEVER upgraded to official/.test(a.honesty) && /VERIFIED facts dated V38\/V39/.test(a.honesty) && /no second registry/.test(a.honesty));

  check("contract: reuses source-registry, no 2nd registry, UNREGISTERED not upgraded, read-only", P.RADAR_SOURCE_PROVENANCE_CONTRACT.invariants.some((i: string) => /no second registry/.test(i)) && P.RADAR_SOURCE_PROVENANCE_CONTRACT.invariants.some((i: string) => /NEVER upgraded to official/.test(i)));
  check("deterministic + frozen", JSON.stringify(P.audit().opportunities) === JSON.stringify(a.opportunities) && Object.isFrozen(a) && Object.isFrozen(ted));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — radar-source-provenance (V218 §2/§3: cross-checks radar-cited URLs vs canonical source-registry; REGISTERED_OFFICIAL/AGGREGATOR/UNREGISTERED; never upgrades unregistered; official≠true-claim; reuses the previously-unconsumed registry; read-only)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
