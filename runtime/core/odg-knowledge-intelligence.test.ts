#!/usr/bin/env node
"use strict";
/* V373 KI-V2 Lot 1 — four independent dimensions, publisher-family identity, structured claims grounded PER SOURCE.
 * Includes the independent inspector's attacks as regression tests. */
const K = require("./odg-knowledge-intelligence.js");
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
const a1 = K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl });
check("single verified OFFICIAL source with a GROUNDED own key ⇒ SUPPORTED, isFact=false", a1.dimensions.epistemic === "SUPPORTED" && a1.isFact === false);
check("four dimensions are separate fields", a1.dimensions.maturity === "USABLE" && a1.dimensions.authorization === "READ_ONLY_ANALYSIS" && a1.dimensions.risk === "LOW");
const m1 = K.toMemory(a1, ASOF);
check("SUPPORTED knowledge is KEPT in memory and admissible by the existing trust gate (isFact=false carried)", m1.status === "SUPPORTED" && K.admissible(m1, ASOF).trusted === true && m1.isFact === false);

// 2. same organization on two domains ⇒ ONE family.
const TK = { subject: "Toyota automation principle", relation: "is described as", value: "automation with a human touch" };
const toy = { ...TK, nature: "OFFICIAL_DOCUMENTATION", text: "Toyota describes its automation principle as automation with a human touch",
  sources: [{ url: TG, citation: "\"automation with a human touch,\"", structured: TK }, { url: TE, citation: "automation with a human touch", structured: TK }] };
const a2 = K.assessClaim(toy, { asOfEpochMs: ASOF, byUrl });
check("two Toyota domains = ONE publisher family ⇒ SUPPORTED, NOT corroborated", a2.dimensions.epistemic === "SUPPORTED" && a2.independentFamilies.length === 1 && a2.reasons.some((r: string) => /NOT independent/.test(r)));

// 6. two INDEPENDENT publishers with DIFFERENT wordings: compared on (subject, relation, value, scope) — no silent merge.
const both = { ...eb, sources: [eb.sources[0], { url: NIST, text: "NIST states: the error budget equals one minus the service level objective", citation: "the error budget equals one minus the service level objective", structured: NISTK }] };
const aDiff = K.assessClaim(both, { asOfEpochMs: ASOF, byUrl });
check("different VALUE wording ⇒ keys differ ⇒ kept as divergence, NOT silently merged (still SUPPORTED)", aDiff.dimensions.epistemic === "SUPPORTED" && aDiff.reasons.some((r: string) => /DIFFERENT structured key/.test(r)));
const NIST2 = "https://www.nist.gov/sp";
const byU2 = { ...byUrl, [NIST2]: { title: "NIST SLO note", quotes: ["An error budget is 1 minus the SLO of a service, as SRE defines it"] } };
const corro = { ...eb, sources: [eb.sources[0], { url: NIST2, text: "NIST states an error budget is 1 minus the SLO of a service, as SRE defines it", citation: "An error budget is 1 minus the SLO of a service, as SRE defines it", structured: EBK }] };
const aC = K.assessClaim(corro, { asOfEpochMs: ASOF, byUrl: byU2 });
check("two INDEPENDENT publisher families (google, nist), each with a GROUNDED identical key ⇒ CORROBORATED, isFact", aC.dimensions.epistemic === "CORROBORATED" && aC.isFact === true && aC.independentFamilies.length === 2);
const sameKeyClaim = { ...eb, sources: [{ url: SRE, citation: "An error budget is 1 minus the SLO of the service", structured: NISTK }] };
check("a source cannot claim a VALUE it does not show (SRE quote vs 'one minus the service level objective') ⇒ not counted",
  K.assessClaim({ ...sameKeyClaim, ...NISTK }, { asOfEpochMs: ASOF, byUrl }).independentFamilies.length === 0);

// INSPECTOR ATTACKS (HIGH): unrelated citations under a fabricated claim key / spoofed source-level key.
const perfect = { subject: "ODG", relation: "is", value: "perfect", nature: "OFFICIAL_DOCUMENTATION", text: "ODG is perfect",
  sources: [{ url: SRE, text: "An error budget is 1 minus the SLO of the service", citation: "An error budget is 1 minus the SLO of the service" }, { url: NIST, text: "NIST states it is intended for voluntary use", citation: "is intended for voluntary use" }] };
const aP = K.assessClaim(perfect, { asOfEpochMs: ASOF, byUrl, missionAuthorization: "INTERNAL_INTEGRATION" });
check("ATTACK: unrelated citations with NO own key cannot corroborate 'ODG is perfect'", aP.dimensions.epistemic !== "CORROBORATED" && aP.isFact === false && aP.dimensions.authorization !== "INTERNAL_INTEGRATION");
const spoof = { ...perfect, sources: perfect.sources.map((s: any) => ({ ...s, structured: { subject: "ODG", relation: "is", value: "perfect" } })) };
const aS = K.assessClaim(spoof, { asOfEpochMs: ASOF, byUrl, missionAuthorization: "INTERNAL_INTEGRATION" });
check("ATTACK: a spoofed source-level key not GROUNDED in the citation ⇒ not counted, not a fact", aS.dimensions.epistemic !== "CORROBORATED" && aS.isFact === false && aS.reasons.some((r: string) => /GROUNDED/.test(r)));

// 5. forged sources on UNKNOWN domains.
const evil1 = "https://evil-a.example/x", evil2 = "https://evil-b.example/y";
const byEvil = { ...byUrl, [evil1]: { quotes: [EBQ] }, [evil2]: { quotes: [EBQ] } };
const forged = { ...eb, sources: [{ url: evil1, citation: "An error budget is 1 minus the SLO of the service", structured: EBK }, { url: evil2, citation: "An error budget is 1 minus the SLO of the service", structured: EBK }] };
const a5 = K.assessClaim(forged, { asOfEpochMs: ASOF, byUrl: byEvil });
check("two forged UNKNOWN-publisher domains ⇒ CANDIDATE at most, no family counted, not a fact", a5.dimensions.epistemic === "CANDIDATE" && a5.independentFamilies.length === 0 && a5.isFact === false);

// invalidation / contradiction (same subject only).
const a7 = K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, invalidatedBy: "superseded by v2 policy (2027)" });
check("INVALIDATED ⇒ BLOCKED, memory INVALIDATED (not reusable)", a7.dimensions.epistemic === "INVALIDATED" && a7.dimensions.authorization === "BLOCKED" && K.admissible(K.toMemory(a7, ASOF), ASOF).trusted === false);
check("an unrelated contradicting citation (different subject) does NOT block the claim",
  K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, contradictingSources: [{ url: NIST, citation: "is intended for voluntary use", text: "NIST states it is intended for voluntary use", structured: { subject: "AI RMF" } }] }).dimensions.epistemic === "SUPPORTED");

// authorization caps (inspection MEDIUM).
check("SUPPORTED + INTERNAL_INTEGRATION requested ⇒ capped at INTERNAL_IMPLEMENTATION (not yet QUALIFIED)", K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization === "INTERNAL_IMPLEMENTATION");
check("CANDIDATE (performance claim) ⇒ at most SANDBOX_EXPERIMENT", K.assessClaim({ ...eb, nature: "PERFORMANCE_CLAIM" }, { asOfEpochMs: ASOF, byUrl, missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization === "SANDBOX_EXPERIMENT");
const bogus = K.assessClaim({ ...eb, nature: "WHATEVER" }, { asOfEpochMs: ASOF, byUrl, missionAuthorization: "INTERNAL_INTEGRATION" });
check("unknown nature ⇒ MEDIUM risk, never SUPPORTED, capped", bogus.dimensions.risk === "MEDIUM" && bogus.dimensions.epistemic === "CANDIDATE" && bogus.dimensions.authorization === "SANDBOX_EXPERIMENT");
check("SECURITY_CRITICAL not corroborated ⇒ HIGH risk, capped at SANDBOX_EXPERIMENT", K.assessClaim({ ...eb, nature: "SECURITY_CRITICAL" }, { asOfEpochMs: ASOF, byUrl, missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization === "SANDBOX_EXPERIMENT");
check("risk can only be RAISED by opts (LOW requested on SECURITY_CRITICAL stays HIGH)", K.assessClaim({ ...eb, nature: "SECURITY_CRITICAL" }, { asOfEpochMs: ASOF, byUrl, risk: "LOW" }).dimensions.risk === "HIGH");
check("CRITICAL + CORROBORATED but not QUALIFIED ⇒ still capped at SANDBOX_EXPERIMENT", K.assessClaim(corro, { asOfEpochMs: ASOF, byUrl: byU2, risk: "CRITICAL", missionAuthorization: "INTERNAL_INTEGRATION" }).dimensions.authorization === "SANDBOX_EXPERIMENT");

// maturity not inferred from truth.
check("maturity stays USABLE without mission evidence; EXPERIMENTAL only with an approved experiment", a1.dimensions.maturity === "USABLE" && K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, experimentApproved: true }).dimensions.maturity === "EXPERIMENTAL");
check("OPERATIONALLY_DEMONSTRATED requires the full ladder", K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, demonstratedBenefit: true }).dimensions.maturity === "USABLE");

// union of one page's citations; no self-corroboration.
const NQ = "https://www.nist.gov/rmf"; const byN = { ...byUrl, [NQ]: { title: "AI Risk Management Framework | NIST", quotes: ["released on January 26, 2023", "is intended for voluntary use"] } };
const NK = { subject: "NIST AI RMF", relation: "released on / intended for", value: "released on January 26, 2023 and is intended for voluntary use" };
const nistTwo = { ...NK, nature: "OFFICIAL_DOCUMENTATION", text: "The NIST AI RMF page states the framework was released on January 26, 2023 and is intended for voluntary use",
  sources: [{ url: NQ, citation: "released on January 26, 2023", structured: NK }, { url: NQ, citation: "is intended for voluntary use", structured: NK }] };
const aN = K.assessClaim(nistTwo, { asOfEpochMs: ASOF, byUrl: byN });
check("two citations of ONE page cover one statement (union) ⇒ SUPPORTED, counted ONCE", aN.dimensions.epistemic === "SUPPORTED" && aN.independentFamilies.length === 1);

// 10. quarantine; identity; determinism.
check("quarantined source ⇒ UNKNOWN, read-only", K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, quarantined: [SRE] }).dimensions.epistemic === "UNKNOWN");
check("identity: unknown host ⇒ UNKNOWN role; known host ⇒ organization; subdomain spoof unknown", K.identityOf("https://unknown.example/a").known === false && K.identityOf(SRE).organization === "Google" && K.identityOf("https://evil.sre.google/x").known === false);
check("caller-supplied id is ignored (content-bound id)", K.assessClaim({ ...eb, id: "kc:forged" }, { asOfEpochMs: ASOF, byUrl }).id !== "kc:forged");
let threw = false; try { K.assessClaim(eb, { byUrl }); } catch { threw = true; }
check("no injected clock ⇒ throws", threw);
check("deterministic + frozen", JSON.stringify(K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl })) === JSON.stringify(a1) && Object.isFrozen(a1) && Object.isFrozen(a1.dimensions));

process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-knowledge-intelligence (V373 KI-V2 Lot 1)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
