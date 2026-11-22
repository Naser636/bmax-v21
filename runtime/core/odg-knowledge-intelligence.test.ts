#!/usr/bin/env node
"use strict";
/* V373 KI-V2 Lot 1 — four independent dimensions, source identity by publisher family, structured-claim corroboration. */
const K = require("./odg-knowledge-intelligence.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const ASOF = Date.UTC(2026, 10, 22, 12);
const SRE = "https://sre.google/workbook/error-budget-policy/", NIST = "https://www.nist.gov/itl/x", TG = "https://global.toyota/en/x", TE = "https://www.toyota-europe.com/y";
const EBQ = "An error budget is 1 minus the SLO of the service.";
const byUrl: any = { [SRE]: { quotes: [EBQ] }, [TG]: { quotes: ["Jidoka in the TPS is \"automation with a human touch,\" where human wisdom is added"] }, [TE]: { quotes: ["automation with a human touch"] },
  [NIST]: { quotes: ["the error budget equals one minus the service level objective"] } };
const eb = { subject: "error budget", relation: "equals", value: "1 - SLO", scope: "a service", nature: "OFFICIAL_DOCUMENTATION", text: "An error budget is 1 minus the SLO of the service", sources: [{ url: SRE, citation: "An error budget is 1 minus the SLO of the service" }] };

// 1. single official source ⇒ SUPPORTED, kept, never a fact.
const a1 = K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl });
check("single verified OFFICIAL source ⇒ SUPPORTED (not rejected), isFact=false", a1.dimensions.epistemic === "SUPPORTED" && a1.isFact === false);
check("four dimensions are separate fields", a1.dimensions.maturity === "USABLE" && a1.dimensions.authorization === "READ_ONLY_ANALYSIS" && a1.dimensions.risk === "LOW");
const m1 = K.toMemory(a1, ASOF);
check("SUPPORTED knowledge is KEPT in memory (status SUPPORTED) and admissible by the existing trust gate", m1.status === "SUPPORTED" && K.admissible(m1, ASOF).trusted === true && m1.isFact === false);

// 2. same organization on two domains ⇒ ONE family ⇒ not corroborated.
const toy = { subject: "toyota automation principle", relation: "is described as", value: "automation with a human touch", nature: "OFFICIAL_DOCUMENTATION",
  text: "Toyota describes its automation principle as automation with a human touch", sources: [{ url: TG, citation: "\"automation with a human touch,\"" }, { url: TE, citation: "automation with a human touch" }] };
const a2 = K.assessClaim(toy, { asOfEpochMs: ASOF, byUrl });
check("two Toyota domains = ONE publisher family ⇒ SUPPORTED, NOT corroborated", a2.dimensions.epistemic === "SUPPORTED" && a2.independentFamilies.length === 1 && a2.reasons.some((r: string) => /NOT independent/.test(r)));

// 6. two INDEPENDENT publishers, DIFFERENT wordings, SAME structured key ⇒ CORROBORATED (controlled, explainable).
const eb2 = Object.assign({}, eb, { sources: [{ url: SRE, citation: "An error budget is 1 minus the SLO of the service" }, { url: NIST, citation: "the error budget equals one minus the service level objective", structured: { subject: "error budget", relation: "equals", value: "1 - SLO", scope: "a service" } }] });
// NIST quote is bound to ITS OWN wording via a per-source text: assessClaim checks each citation against the claim text,
// so a differently-worded source must carry its own claim text — model it as a second assessment input:
const nistBound = K.assessClaim(Object.assign({}, eb, { text: "NIST states: the error budget equals one minus the service level objective", sources: [{ url: NIST, citation: "the error budget equals one minus the service level objective" }] }), { asOfEpochMs: ASOF, byUrl });
check("a differently-worded independent source verifies against ITS OWN text", nistBound.sources[0].citationVerified === true);
const corro = K.assessClaim(Object.assign({}, eb2, { text: eb.text }), { asOfEpochMs: ASOF, byUrl });
check("…but a citation is never accepted against ANOTHER source's wording (no lexical shortcut)", corro.sources[1].citationVerified === false && corro.dimensions.epistemic === "SUPPORTED");

const both = Object.assign({}, eb, { sources: [{ url: SRE, citation: "An error budget is 1 minus the SLO of the service" },
  { url: NIST, text: "NIST states: the error budget equals one minus the service level objective", citation: "the error budget equals one minus the service level objective", structured: { subject: "error budget", relation: "equals", value: "1 - SLO", scope: "a service" } }] });
const aC = K.assessClaim(both, { asOfEpochMs: ASOF, byUrl });
check("6: two INDEPENDENT publishers (google, nist), DIFFERENT wordings, same structured key ⇒ CORROBORATED, isFact", aC.dimensions.epistemic === "CORROBORATED" && aC.isFact === true && aC.independentFamilies.length === 2);
const notBound = Object.assign({}, both, { sources: [both.sources[0], Object.assign({}, both.sources[1], { text: "NIST states: the error budget equals zero" })] });
check("…a second source whose OWN text is not covered by its citation does not count", K.assessClaim(notBound, { asOfEpochMs: ASOF, byUrl }).dimensions.epistemic === "SUPPORTED");
const NQ = "https://www.nist.gov/rmf"; const byN = Object.assign({}, byUrl, { [NQ]: { quotes: ["released on January 26, 2023", "is intended for voluntary use"] } });
const nistTwo = { subject: "NIST AI RMF 1.0", relation: "released on / intended for", value: "2023-01-26 / voluntary use", nature: "OFFICIAL_DOCUMENTATION",
  text: "The NIST AI RMF page states the framework was released on January 26, 2023 and is intended for voluntary use", sources: [{ url: NQ, citation: "released on January 26, 2023" }, { url: NQ, citation: "is intended for voluntary use" }] };
const aN = K.assessClaim(nistTwo, { asOfEpochMs: ASOF, byUrl: byN });
check("two citations from ONE page cover one statement (union) ⇒ SUPPORTED, counted ONCE (no self-corroboration)", aN.dimensions.epistemic === "SUPPORTED" && aN.independentFamilies.length === 1);
// 5. forged sources on two UNKNOWN domains never reach CORROBORATED.
const evil1 = "https://evil-a.example/x", evil2 = "https://evil-b.example/y";
const byEvil = Object.assign({}, byUrl, { [evil1]: { quotes: [EBQ] }, [evil2]: { quotes: [EBQ] } });
const forged = Object.assign({}, eb, { sources: [{ url: evil1, citation: "An error budget is 1 minus the SLO of the service" }, { url: evil2, citation: "An error budget is 1 minus the SLO of the service" }] });
const a5 = K.assessClaim(forged, { asOfEpochMs: ASOF, byUrl: byEvil });
check("two forged domains with UNKNOWN publisher ⇒ not corroborated (identity unknown, no official primary)", a5.dimensions.epistemic === "CANDIDATE" && a5.independentFamilies.length === 0 && a5.isFact === false);

// divergent qualifiers kept, not merged.
const div = Object.assign({}, eb, { sources: [{ url: SRE, citation: "An error budget is 1 minus the SLO of the service", structured: { subject: "error budget", relation: "equals", value: "1 - SLO", scope: "a four-week window" } }] });
check("a verified source with a DIFFERENT scope is a divergence (kept), not support", K.assessClaim(div, { asOfEpochMs: ASOF, byUrl }).reasons.some((r: string) => /DIFFERENT structured key/.test(r)));

// contradiction / invalidation ⇒ BLOCKED for use.
const a7 = K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, invalidatedBy: "superseded by v2 policy (2027)" });
check("INVALIDATED ⇒ authorization BLOCKED, memory status INVALIDATED (not reusable)", a7.dimensions.epistemic === "INVALIDATED" && a7.dimensions.authorization === "BLOCKED" && K.admissible(K.toMemory(a7, ASOF), ASOF).trusted === false);

// authorization from the mission contract, capped by risk — never from confidence.
const a8 = K.assessClaim(Object.assign({}, eb, { nature: "SECURITY_CRITICAL" }), { asOfEpochMs: ASOF, byUrl, missionAuthorization: "INTERNAL_INTEGRATION" });
check("SECURITY_CRITICAL + not corroborated + INTERNAL_INTEGRATION requested ⇒ capped at SANDBOX_EXPERIMENT", a8.dimensions.risk === "HIGH" && a8.dimensions.authorization === "SANDBOX_EXPERIMENT");
check("non-official nature with one citation ⇒ CANDIDATE (needs evidence of its nature)", K.assessClaim(Object.assign({}, eb, { nature: "PERFORMANCE_CLAIM" }), { asOfEpochMs: ASOF, byUrl }).dimensions.epistemic === "CANDIDATE");

// maturity is NOT inferred from truth: higher levels need mission evidence.
check("maturity stays USABLE without mission evidence; EXPERIMENTAL only with an approved experiment", a1.dimensions.maturity === "USABLE" && K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, experimentApproved: true }).dimensions.maturity === "EXPERIMENTAL");
check("OPERATIONALLY_DEMONSTRATED requires the full ladder (experiment → qualification → demonstrated benefit)", K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, demonstratedBenefit: true }).dimensions.maturity === "USABLE");

// 10. injected source content ⇒ quarantined ⇒ unverified.
check("quarantined source ⇒ citation not verified ⇒ UNKNOWN, read-only", K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl, quarantined: [SRE] }).dimensions.epistemic === "UNKNOWN");
check("identity: unknown host ⇒ UNKNOWN role (never assumed official)", K.identityOf("https://unknown.example/a").known === false && K.identityOf(SRE).organization === "Google");
let threw = false; try { K.assessClaim(eb, { byUrl }); } catch { threw = true; }
check("no injected clock ⇒ throws", threw);
check("deterministic + frozen", JSON.stringify(K.assessClaim(eb, { asOfEpochMs: ASOF, byUrl })) === JSON.stringify(a1) && Object.isFrozen(a1) && Object.isFrozen(a1.dimensions));

process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-knowledge-intelligence (V373 KI-V2 Lot 1)" : f + " FAIL") + "\n"); process.exit(f ? 1 : 0);
export {};
