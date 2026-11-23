#!/usr/bin/env node
"use strict";
/* V373 KI-V2 Lot 1 — four independent dimensions, publisher-family identity, structured claims grounded PER SOURCE.
 * Includes the independent inspector's attacks as regression tests. */
const K = require("./odg-knowledge-intelligence.js");
const ATT = require("./odg-knowledge-attestation.js");
const REG = ATT.createRegistry(); const ID = ATT.ephemeralIdentity("odg-test"); ATT.registerIssuer(REG, ID);
const att = (rec: any, n: string) => ({ attestation: ATT.createAttestation({ purpose: "KNOWLEDGE_RECORD", identity: ID, payload: rec, issuedAt: Date.UTC(2026, 10, 22, 12), expiresAt: Date.UTC(2026, 10, 22, 12) + 30 * 86400000, nonce: n }), registry: REG, allowRepeatVerification: true });
/* test helper: wrap recorded pages as a collection whose digest is PINNED (the authenticated path) */
function C(pages: any): any { const collection = { sources: Object.keys(pages).map((url) => ({ url, ...pages[url] })) }; return K.attestCollection(collection, { pinnedDigests: [ATT.contentSha256(collection)] }); }
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ASOF = Date.UTC(2026, 10, 22, 12);
const SRE = "https://sre.google/workbook/error-budget-policy/", NIST = "https://www.nist.gov/itl/x", TG = "https://global.toyota/en/x", TE = "https://www.toyota-europe.com/y";
const EBQ = "An error budget is 1 minus the SLO of the service.";
const byUrl: any = {
  [SRE]: { title: "Google SRE - Error Budget Policy", quotes: [EBQ] },
  [TG]: { title: "Toyota Production System", quotes: ["Jidoka in the TPS is \"automation with a human touch,\" where human wisdom is added"] },
  [TE]: { title: "Quality everywhere, in everything | Toyota Europe", quotes: ["automation with a human touch"] },
  [NIST]: { title: "NIST page", quotes: ["the error budget equals one minus the service level objective", "is intended for voluntary use"] },
};
const EBK = { subject: "error budget", relation: "equals", value: "1 minus the SLO", scope: "a service" };
const NISTK = { subject: "error budget", relation: "equals", value: "one minus the service level objective", scope: "a service" };
const eb = { ...EBK, nature: "OFFICIAL_DOCUMENTATION", text: "An error budget is 1 minus the SLO of the service", sources: [{ url: SRE, citation: "An error budget is 1 minus the SLO of the service", structured: EBK }] };

// 1. single official source ⇒ SUPPORTED, kept, never a fact.
const a1 = K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl) });
check("single verified OFFICIAL source with a GROUNDED own key ⇒ SUPPORTED, isFact=false", a1.dimensions.epistemic === "SUPPORTED" && a1.isFact === false);
check("four dimensions are separate fields", a1.dimensions.maturity === "USABLE" && a1.dimensions.authorization === "READ_ONLY_ANALYSIS" && a1.dimensions.risk === "LOW");
const m1 = K.toMemory(a1, ASOF);
check("V374: SUPPORTED is KEPT (retention) but NOT admitted as fact by the existing trust gate", m1.retention === "KEPT" && m1.status === "UNVERIFIED" && K.admissible(m1, ASOF).trusted === false && m1.isFact === false);
check("V374: usableFor caps at the record's own authorization and the contract request", K.usableFor(m1, "INTERNAL_INTEGRATION", ASOF, { assessment: a1 }).authorization === "READ_ONLY_ANALYSIS" && K.usableFor(m1, "READ_ONLY_ANALYSIS", ASOF, { assessment: a1 }).authorization === "READ_ONLY_ANALYSIS");
let mr = m1; for (let i = 0; i < 5; i++) { const u = K.usableFor(mr, "INTERNAL_INTEGRATION", ASOF + i * 86400000, { assessment: a1 }); mr = Object.assign({}, mr); if (u.epistemic !== "SUPPORTED" || u.isFact) mr = null as any; }
check("V374: repeated reuse NEVER elevates confidence (epistemic stays SUPPORTED, never a fact)", mr !== null);
check("V374: raw caller-supplied pages (unattested) ⇒ capped at CANDIDATE", K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl }).dimensions.epistemic === "CANDIDATE");

// 2. same organization on two domains ⇒ ONE family.
const TK = { subject: "Toyota automation principle", relation: "is described as", value: "automation with a human touch" };
const toy = { ...TK, nature: "OFFICIAL_DOCUMENTATION", text: "Toyota describes its automation principle as automation with a human touch",
  sources: [{ url: TG, citation: "\"automation with a human touch,\"", structured: TK }, { url: TE, citation: "automation with a human touch", structured: TK }] };
const a2 = K.assessClaim(toy, { asOfEpochMs: ASOF, collection: C(byUrl) });
check("two Toyota domains = ONE publisher family ⇒ SUPPORTED, NOT corroborated", a2.dimensions.epistemic === "SUPPORTED" && a2.independentFamilies.length === 1 && a2.reasons.some((r: string) => /NOT independent/.test(r)));

// 6. two INDEPENDENT publishers with DIFFERENT wordings: compared on (subject, relation, value, scope) — no silent merge.
const both = { ...eb, sources: [eb.sources[0], { url: NIST, text: "NIST states: the error budget equals one minus the service level objective", citation: "the error budget equals one minus the service level objective", structured: NISTK }] };
const aDiff = K.assessClaim(both, { asOfEpochMs: ASOF, collection: C(byUrl) });
check("different VALUE wording ⇒ keys differ ⇒ kept as divergence, NOT silently merged (still SUPPORTED)", aDiff.dimensions.epistemic === "SUPPORTED" && aDiff.reasons.some((r: string) => /DIFFERENT structured key/.test(r)));
const NIST2 = "https://www.nist.gov/sp";
const byU2 = { ...byUrl, [NIST2]: { title: "NIST SLO note", quotes: ["An error budget is 1 minus the SLO of a service, as SRE defines it"] } };
const corro = { ...eb, sources: [eb.sources[0], { url: NIST2, text: "NIST states an error budget is 1 minus the SLO of a service, as SRE defines it", citation: "An error budget is 1 minus the SLO of a service, as SRE defines it", structured: EBK }] };
const aC = K.assessClaim(corro, { asOfEpochMs: ASOF, collection: C(byU2) });
check("two INDEPENDENT publisher families, GROUNDED identical keys ⇒ CORROBORATED (sandbox collection ⇒ wouldBeFact, not presented as fact)", aC.dimensions.epistemic === "CORROBORATED" && aC.wouldBeFact === true && aC.isFact === false && aC.independentFamilies.length === 2);
const sameKeyClaim = { ...eb, sources: [{ url: SRE, citation: "An error budget is 1 minus the SLO of the service", structured: NISTK }] };
check("a source cannot claim a VALUE it does not show (SRE quote vs 'one minus the service level objective') ⇒ not counted",
  K.assessClaim({ ...sameKeyClaim, ...NISTK }, { asOfEpochMs: ASOF, collection: C(byUrl) }).independentFamilies.length === 0);

// INSPECTOR ATTACKS (HIGH): unrelated citations under a fabricated claim key / spoofed source-level key.
const perfect = { subject: "ODG", relation: "is", value: "perfect", nature: "OFFICIAL_DOCUMENTATION", text: "ODG is perfect",
  sources: [{ url: SRE, text: "An error budget is 1 minus the SLO of the service", citation: "An error budget is 1 minus the SLO of the service" }, { url: NIST, text: "NIST states it is intended for voluntary use", citation: "is intended for voluntary use" }] };
const aP = K.assessClaim(perfect, { asOfEpochMs: ASOF, collection: C(byUrl), missionAuthorization: "INTERNAL_INTEGRATION" });
check("ATTACK: unrelated citations with NO own key cannot corroborate 'ODG is perfect'", aP.dimensions.epistemic !== "CORROBORATED" && aP.isFact === false && aP.dimensions.authorization !== "INTERNAL_INTEGRATION");
const spoof = { ...perfect, sources: perfect.sources.map((s: any) => ({ ...s, structured: { subject: "ODG", relation: "is", value: "perfect" } })) };
const aS = K.assessClaim(spoof, { asOfEpochMs: ASOF, collection: C(byUrl), missionAuthorization: "INTERNAL_INTEGRATION" });
check("ATTACK: a spoofed source-level key not GROUNDED in the citation ⇒ not counted, not a fact", aS.dimensions.epistemic !== "CORROBORATED" && aS.isFact === false && aS.reasons.some((r: string) => /GROUNDED/.test(r)));

// INSPECTOR ROUND-2 ATTACKS: grammar-only keys, ungrounded relation/scope, presented claim text not in any source.
const SMA = "https://sma.nasa.gov/p"; const byA = { ...byUrl, [SMA]: { title: "Software Assurance and Software Safety", quotes: ["use the NASA Independent Verification and Validation (IV&V) Facility as the sole provider of IV&V services"] } };
const atk1 = { subject: "it", relation: "is perfect", value: "the", nature: "OFFICIAL_DOCUMENTATION", text: "ODG is perfect",
  sources: [{ url: SRE, text: "An error budget is 1 minus the SLO of the service", citation: "An error budget is 1 minus the SLO of the service", structured: { subject: "it", relation: "is perfect", value: "the" } },
            { url: NIST, text: "NIST states it is intended for voluntary use", citation: "is intended for voluntary use", structured: { subject: "it", relation: "is perfect", value: "the" } }] };
check("ATTACK R2-1: grammar-only key ⇒ never grounded ⇒ not corroborated, not a fact", K.assessClaim(atk1, { asOfEpochMs: ASOF, collection: C(byUrl), missionAuthorization: "INTERNAL_INTEGRATION" }).isFact === false);
const atk2 = { subject: "the", relation: "is NOT", value: "is the", nature: "OFFICIAL_DOCUMENTATION", text: "ODG is perfect",
  sources: [{ url: SRE, text: "An error budget is 1 minus the SLO of the service", citation: "An error budget is 1 minus the SLO of the service", structured: { subject: "the", relation: "is NOT", value: "is the" } },
            { url: SMA, text: "NASA policy: use the NASA Independent Verification and Validation (IV&V) Facility as the sole provider of IV&V services", citation: "use the NASA Independent Verification and Validation (IV&V) Facility as the sole provider of IV&V services", structured: { subject: "the", relation: "is NOT", value: "is the" } }] };
check("ATTACK R2-2: free-text relation outside the controlled vocabulary ⇒ not grounded, not a fact", K.assessClaim(atk2, { asOfEpochMs: ASOF, collection: C(byA) }).isFact === false);
const useKey = { subject: "use", relation: "designates", value: "use", scope: "all software" };
const atk3 = { ...useKey, nature: "OFFICIAL_DOCUMENTATION", text: "use mandates use for all software",
  sources: [{ url: NIST, text: "NIST states it is intended for voluntary use", citation: "is intended for voluntary use", structured: useKey },
            { url: SMA, text: "NASA policy: use the NASA Independent Verification and Validation (IV&V) Facility as the sole provider of IV&V services", citation: "use the NASA Independent Verification and Validation (IV&V) Facility as the sole provider of IV&V services", structured: useKey }] };
check("ATTACK R2-3: one shared content word ('use') ⇒ value needs ≥2 content words ⇒ not a fact", K.assessClaim(atk3, { asOfEpochMs: ASOF, collection: C(byA), missionAuthorization: "INTERNAL_INTEGRATION" }).isFact === false);
const presented = { ...corro, text: "An error budget proves ODG is perfect", sources: corro.sources.map((s: any) => ({ ...s, text: s.text || "An error budget is 1 minus the SLO of the service" })) };
check("ATTACK R2-4: keys match but the PRESENTED claim text is not covered by the sources ⇒ not a fact", K.assessClaim(presented, { asOfEpochMs: ASOF, collection: C(byU2) }).isFact === false);
const NIST3 = "https://www.nist.gov/itl/ai-risk-management-framework", NASA3 = "https://www.nasa.gov/reference/x";
const byR3 = { ...byUrl, [NIST3]: { title: "AI Risk Management Framework | NIST", quotes: ["is intended for voluntary use", "can help organizations identify unique risks posed by generative AI"] },
  [NASA3]: { title: "System Engineering Handbook: Appendix - NASA", quotes: ["Showing that the use of an end product achieves the individual specified requirement (verification)", "CRM manages risks over the course of the development and the Implementation Phase of the life cycle"] } };
const andKey = { subject: "risks", relation: "states", value: "use and risks" };
const andSplit = { ...andKey, nature: "OFFICIAL_DOCUMENTATION", text: "risks use",
  sources: [{ url: NIST3, text: "NIST states it is intended for voluntary use and can help organizations identify unique risks posed by generative AI", citation: "is intended for voluntary use", structured: andKey },
            { url: NIST3, citation: "can help organizations identify unique risks posed by generative AI", structured: andKey },
            { url: NASA3, text: "NASA states: Showing that the use of an end product achieves the individual specified requirement (verification)", citation: "Showing that the use of an end product achieves the individual specified requirement (verification)", structured: andKey },
            { url: NASA3, citation: "CRM manages risks over the course of the development and the Implementation Phase of the life cycle", structured: andKey }] };
check("ATTACK R3 andSplitCrossFamily: single shared words joined by ' and ' (real quotes, 2 families) ⇒ NOT a fact", K.assessClaim(andSplit, { asOfEpochMs: ASOF, collection: C(byR3), missionAuthorization: "INTERNAL_INTEGRATION" }).isFact === false);
// 5. forged sources on UNKNOWN domains.
const evil1 = "https://evil-a.example/x", evil2 = "https://evil-b.example/y";
const byEvil = { ...byUrl, [evil1]: { quotes: [EBQ] }, [evil2]: { quotes: [EBQ] } };
const forged = { ...eb, sources: [{ url: evil1, citation: "An error budget is 1 minus the SLO of the service", structured: EBK }, { url: evil2, citation: "An error budget is 1 minus the SLO of the service", structured: EBK }] };
const a5 = K.assessClaim(forged, { asOfEpochMs: ASOF, collection: C(byEvil) });
check("two forged UNKNOWN-publisher domains ⇒ CANDIDATE at most, no family counted, not a fact", a5.dimensions.epistemic === "CANDIDATE" && a5.independentFamilies.length === 0 && a5.isFact === false);

// invalidation / contradiction (same subject only).
const a7 = K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), invalidatedBy: "superseded by v2 policy (2027)" });
check("INVALIDATED ⇒ BLOCKED, memory INVALIDATED (not reusable), usableFor BLOCKED", a7.dimensions.epistemic === "INVALIDATED" && a7.dimensions.authorization === "BLOCKED" && K.admissible(K.toMemory(a7, ASOF), ASOF).trusted === false && K.usableFor(K.toMemory(a7, ASOF), "READ_ONLY_ANALYSIS", ASOF).authorization === "BLOCKED");
check("an unrelated contradicting citation (different subject) does NOT block the claim",
  K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), contradictingSources: [{ url: NIST, citation: "is intended for voluntary use", text: "NIST states it is intended for voluntary use", structured: { subject: "AI RMF" } }] }).dimensions.epistemic === "SUPPORTED");

// authorization caps (inspection MEDIUM).
check("SUPPORTED + INTERNAL_INTEGRATION requested on a SANDBOX collection ⇒ capped at SANDBOX_EXPERIMENT", K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization === "SANDBOX_EXPERIMENT");
check("CANDIDATE (performance claim) ⇒ at most SANDBOX_EXPERIMENT", K.assessClaim({ ...eb, nature: "PERFORMANCE_CLAIM" }, { asOfEpochMs: ASOF, collection: C(byUrl), missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization === "SANDBOX_EXPERIMENT");
const bogus = K.assessClaim({ ...eb, nature: "WHATEVER" }, { asOfEpochMs: ASOF, collection: C(byUrl), missionAuthorization: "INTERNAL_INTEGRATION" });
check("unknown nature ⇒ MEDIUM risk, never SUPPORTED, capped", bogus.dimensions.risk === "MEDIUM" && bogus.dimensions.epistemic === "CANDIDATE" && bogus.dimensions.authorization === "SANDBOX_EXPERIMENT");
check("SECURITY_CRITICAL not corroborated ⇒ HIGH risk, capped at SANDBOX_EXPERIMENT", K.assessClaim({ ...eb, nature: "SECURITY_CRITICAL" }, { asOfEpochMs: ASOF, collection: C(byUrl), missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization === "SANDBOX_EXPERIMENT");
check("risk can only be RAISED by opts (LOW requested on SECURITY_CRITICAL stays HIGH)", K.assessClaim({ ...eb, nature: "SECURITY_CRITICAL" }, { asOfEpochMs: ASOF, collection: C(byUrl), risk: "LOW" }).dimensions.risk === "HIGH");
check("CRITICAL + CORROBORATED but not QUALIFIED ⇒ still capped at SANDBOX_EXPERIMENT", K.assessClaim(corro, { asOfEpochMs: ASOF, collection: C(byU2), risk: "CRITICAL", missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization === "SANDBOX_EXPERIMENT");

// maturity not inferred from truth.
const EVV = require("./odg-evidence-verifier.js"); const READER = EVV.makeRepoReader(require("path").resolve(__dirname, "../.."));
const REAL_EV = { missionContract: "WIC-CM-RADAR-GATE-CHAIN-STEP1", contractPath: "docs/odg/WIC_CM-RADAR-GATE-CHAIN_STEP1.json", evidencePath: "docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP1_EVIDENCE.json",
  evidenceSha256: require("crypto").createHash("sha256").update(READER("docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP1_EVIDENCE.json")).digest("hex") };
check("maturity: bare booleans / format-only evidence / evidence not bound to THIS claim are ignored",
  K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), experimentApproved: true }).dimensions.maturity === "USABLE"
  && K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), maturityEvidence: { experiment: { missionContract: "WIC-TEST-0001", evidenceSha256: "a".repeat(64) } }, evidenceReader: READER }).dimensions.maturity === "USABLE"
  && K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), maturityEvidence: { experiment: REAL_EV } }).dimensions.maturity === "USABLE");
check("an UNRELATED real VERIFIED WIC (radar-gate-chain step 1) cannot qualify the SRE claim (contract does not bind this claim/level)", /NOT_BOUND_TO_CLAIM/.test(K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), maturityEvidence: { experiment: REAL_EV, qualification: REAL_EV } }).reasons.join(" ")) && K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), maturityEvidence: { experiment: REAL_EV, qualification: REAL_EV }, missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization !== "INTERNAL_INTEGRATION");
check("a caller-supplied evidenceReader returning FORGED bytes is ignored (module reads the real repo itself)", K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), maturityEvidence: { experiment: { ...REAL_EV, evidenceSha256: "b".repeat(64) } }, evidenceReader: () => Buffer.from("forged") }).dimensions.maturity === "USABLE");
check("OPERATIONALLY_DEMONSTRATED requires the full ladder", K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), demonstratedBenefit: true }).dimensions.maturity === "USABLE");

// union of one page's citations; no self-corroboration.
const NQ = "https://www.nist.gov/rmf"; const byN = { ...byUrl, [NQ]: { title: "AI Risk Management Framework | NIST", quotes: ["released on January 26, 2023", "is intended for voluntary use"] } };
const NK = { subject: "NIST AI Risk Management Framework", relation: "released on / intended for", value: "released on January 26, 2023 and is intended for voluntary use" };
const nistTwo = { ...NK, nature: "OFFICIAL_DOCUMENTATION", text: "The NIST AI RMF page states the framework was released on January 26, 2023 and is intended for voluntary use",
  sources: [{ url: NQ, citation: "released on January 26, 2023", structured: NK }, { url: NQ, citation: "is intended for voluntary use", structured: NK }] };
const aN = K.assessClaim(nistTwo, { asOfEpochMs: ASOF, collection: C(byN) });
check("two citations of ONE page cover one statement (union) ⇒ SUPPORTED, counted ONCE", aN.dimensions.epistemic === "SUPPORTED" && aN.independentFamilies.length === 1);

// 10. quarantine; identity; determinism.
check("quarantined source ⇒ UNKNOWN, read-only", K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl), quarantined: [SRE] }).dimensions.epistemic === "UNKNOWN");
check("identity: unknown host ⇒ UNKNOWN role; known host ⇒ organization; subdomain spoof unknown", K.identityOf("https://unknown.example/a").known === false && K.identityOf(SRE).organization === "Google" && K.identityOf("https://evil.sre.google/x").known === false);
check("caller-supplied id is ignored (content-bound id)", K.assessClaim({ ...eb, id: "kc:forged" }, { asOfEpochMs: ASOF, collection: C(byUrl) }).id !== "kc:forged");
let threw = false; try { K.assessClaim(eb, { collection: C(byUrl) }); } catch { threw = true; }
check("no injected clock ⇒ throws", threw);
check("deterministic + frozen", JSON.stringify(K.assessClaim(eb, { asOfEpochMs: ASOF, collection: C(byUrl) })) === JSON.stringify(a1) && Object.isFrozen(a1) && Object.isFrozen(a1.dimensions));

// V15.9 publisher identities: an organisation's several hosts are ONE family (never independent), and a new official host
// can only yield SUPPORTED (what the publisher states), never CORROBORATED, on its own.
const idA = K.identityOf("https://csrc.nist.gov/pubs/x"), idB = K.identityOf("https://www.nist.gov/y");
check("V15.9: csrc.nist.gov and www.nist.gov share the 'nist' family (not independent)", idA.known && idB.known && idA.family === "nist" && idB.family === "nist");
check("V15.9: the 5 V158 hosts are PRIMARY_OFFICIAL with distinct organisation families", ["https://www.postgresql.org/docs/", "https://code.claude.com/docs/", "https://www.sqlite.org/docs.html", "https://registry.npmjs.org/next", "https://csrc.nist.gov/pubs/"].every((u) => K.identityOf(u).role === "PRIMARY_OFFICIAL") && new Set(["https://www.postgresql.org/docs/", "https://code.claude.com/docs/", "https://www.sqlite.org/docs.html", "https://registry.npmjs.org/next", "https://csrc.nist.gov/pubs/"].map((u) => K.identityOf(u).family)).size === 5);
check("V15.9: an unlisted look-alike host stays UNKNOWN (exact-host match, no suffix)", K.identityOf("https://evil.code.claude.com/x").known === false && K.identityOf("https://postgresql.org/x").known === false);
check("V16.0: registry.npmjs.org family is the ULTIMATE owner 'microsoft' (npm ⊂ GitHub ⊂ Microsoft)", K.identityOf("https://registry.npmjs.org/next").family === "microsoft");
{ // V16.0 — V160 engineering-practices hosts: exact-host publisher identities, families by ultimate owning organisation
  const V160 = ["https://research.google/pubs/x/", "https://google.github.io/eng-practices/review/", "https://deepmind.google/blog/", "https://www.nasa.gov/reference/systems-engineering-handbook/", "https://microsoft.github.io/code-with-engineering-playbook/", "https://github.blog/engineering/"];
  check("V16.0: the 6 V160 hosts are known PRIMARY_OFFICIAL publishers", V160.every((u) => K.identityOf(u).known === true && K.identityOf(u).role === "PRIMARY_OFFICIAL"));
  check("V16.0: research.google, google.github.io, deepmind.google and sre.google are ONE family (google)", ["https://research.google/", "https://google.github.io/eng-practices/", "https://deepmind.google/blog/", "https://sre.google/"].every((u) => K.identityOf(u).family === "google"));
  check("V16.0: github.blog, microsoft.github.io and registry.npmjs.org are ONE family (microsoft) — never independent of each other", ["https://github.blog/engineering/", "https://microsoft.github.io/code-with-engineering-playbook/", "https://registry.npmjs.org/react"].every((u) => K.identityOf(u).family === "microsoft"));
  check("V16.0: V160 corpus spans exactly 3 independent families (google, nasa, microsoft)", new Set(V160.map((u) => K.identityOf(u).family)).size === 3);
  check("V16.0: identity is EXACT-host — another *.github.io site or a google.github.io look-alike stays UNKNOWN", !K.identityOf("https://evil.github.io/eng-practices/").known && !K.identityOf("https://google.github.io.evil.example/").known && !K.identityOf("https://github.io/").known);
  check("V16.0: GitHub Pages hosting does not make a page GitHub's — microsoft.github.io is published by Microsoft", /^Microsoft/.test(K.identityOf("https://microsoft.github.io/code-with-engineering-playbook/").organization));
}
// V15.9 (#911 MED): the same SUPPORTED claim marked as a FRAGMENT is capped at CANDIDATE (never unlocks implementation use);
// a truthy non-boolean marker counts as a fragment too (fail-closed); fragment:false changes nothing.
const fr = K.assessClaim({ ...eb, fragment: true }, { asOfEpochMs: ASOF, collection: C(byUrl) });
check("V15.9: fragment:true caps an otherwise SUPPORTED claim at CANDIDATE, with the reason recorded", fr.dimensions.epistemic === "CANDIDATE" && fr.reasons.some((r: string) => /FRAGMENT citation/.test(r)) && fr.isFact === false);
check("V15.9: fragment marker 'yes' (non-boolean) ⇒ also capped; fragment:false ⇒ unchanged SUPPORTED", K.assessClaim({ ...eb, fragment: "yes" }, { asOfEpochMs: ASOF, collection: C(byUrl) }).dimensions.epistemic === "CANDIDATE" && K.assessClaim({ ...eb, fragment: false }, { asOfEpochMs: ASOF, collection: C(byUrl) }).dimensions.epistemic === "SUPPORTED");
process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-knowledge-intelligence (V373 KI-V2 Lot 1)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
