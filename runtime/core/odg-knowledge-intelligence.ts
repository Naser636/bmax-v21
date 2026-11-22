/**
 * V373 KNOWLEDGE INTELLIGENCE V2 — Lot 1 (structured claims, source identity, four independent dimensions).
 * PURE, deterministic (injected clock), no network/fs. A LAYER over the EXISTING memory (memory-taxonomy record shape,
 * memory-trust-gate admission, actor-provenance attribution) and the step-2 claim↔quote binding — NO second memory,
 * NO second radar, NO new orchestrator, no 10th primitive.
 *
 * What changes vs the step-1/2 FACT path (odg-radar-gate-chain.runChain, unchanged):
 *  - claims are STRUCTURED {subject, relation, value, scope, time, version, qualifiers} + per-source {url, citation};
 *  - independence is judged by PUBLISHER ORGANIZATION (source identity), not by domain: two Toyota domains = ONE source family;
 *  - a single verified OFFICIAL primary source documenting its OWN statement ⇒ SUPPORTED (never CORROBORATED);
 *    CORROBORATED requires ≥2 INDEPENDENT organizations whose structured keys match — never lexical similarity alone;
 *  - four dimensions are computed SEPARATELY and never collapsed: epistemic · maturity · authorization · risk;
 *  - candidate/supported knowledge is KEPT in memory (not discarded for lack of a 2nd source), but it is never a "fact".
 * HONESTY: structured keys are AUTHORED (by the caller/extractor), not inferred by a model; a matching key is a controlled
 * comparison, not proof of truth. Unknown publisher ⇒ UNKNOWN identity ⇒ cannot count toward independence.
 */
"use strict";
const crypto = require("crypto");
const MTG = require("./memory-trust-gate.js");
const ACTOR = require("./actor-provenance.js");
const BIND = require("./odg-claim-quote-binding.js");
const ATT = require("./odg-knowledge-attestation.js");   // V374: collection/record attestations (sandbox keys)
const EVV = require("./odg-evidence-verifier.js");       // V375 G2: maturity evidence verified on REAL files
// the evidence reader is the module's OWN repo-confined reader — never caller-supplied (same trust-root rule as pins/anchors)
const REPO_READER = (() => { try { return EVV.makeRepoReader(require("path").resolve(__dirname, "../..")); } catch { return null; } })();
// TRUST ANCHORS (inspection HIGH r2): authorized issuer key fingerprints PER PURPOSE, loaded HERE from a git-reviewed file —
// never from the caller. Empty by design (production keys are owner-gated) ⇒ a caller-made key can never authenticate.
const TRUST_ANCHORS = Object.freeze((() => { try { const j = require("../../docs/odg/evidence/TRUST_ANCHORS.json"); return { COLLECTION_ARTIFACT: Object.freeze((j.COLLECTION_ARTIFACT || []).slice()), KNOWLEDGE_RECORD: Object.freeze((j.KNOWLEDGE_RECORD || []).slice()) }; } catch { return { COLLECTION_ARTIFACT: Object.freeze([]), KNOWLEDGE_RECORD: Object.freeze([]) }; } })());
function anchored(purpose: string, v: any): boolean { return !!(v && v.valid && v.provenance && (TRUST_ANCHORS as any)[purpose].includes(v.provenance.keyFingerprint)); }
const ASSESSMENTS: WeakSet<any> = new WeakSet();   // brand: ONLY assessClaim mints assessments
// PINNED COLLECTIONS: digests loaded HERE from the git-reviewed COLLECTION_REGISTRY.json (caller-supplied pins are SANDBOX).
const REPO_PINS = Object.freeze((() => { try { return (require("../../docs/odg/evidence/COLLECTION_REGISTRY.json").collections || []).map((c: any) => c.sha256).filter((x: any) => typeof x === "string"); } catch { return []; } })());   // reuse the step-2 claim↔quote binding (supports/covered)

const EPISTEMIC = Object.freeze(["UNKNOWN", "CANDIDATE", "SUPPORTED", "CORROBORATED", "CONTRADICTED", "INVALIDATED"]);
const MATURITY = Object.freeze(["DISCOVERED", "USABLE", "EXPERIMENTAL", "QUALIFIED", "OPERATIONALLY_DEMONSTRATED"]);
const AUTHORIZATION = Object.freeze(["READ_ONLY_ANALYSIS", "DESIGN_PROPOSAL", "SANDBOX_EXPERIMENT", "INTERNAL_IMPLEMENTATION", "INTERNAL_INTEGRATION", "BLOCKED"]);
const RISK = Object.freeze(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const NATURE = Object.freeze(["OFFICIAL_DOCUMENTATION", "TECHNICAL_METHOD", "PERFORMANCE_CLAIM", "SCIENTIFIC_PUBLICATION", "SECURITY_CRITICAL", "INTERNAL_OBSERVATION", "STRATEGIC_HYPOTHESIS", "EXPERIENCE_REPORT"]);

/* SOURCE IDENTITY — who really publishes. Keyed by exact host; explicit, versioned, extendable (unknown ⇒ UNKNOWN).
 * family groups sources with a common documentary origin (same organization ⇒ same family ⇒ NOT independent). */
const PUBLISHERS: Record<string, any> = Object.freeze({
  "global.toyota": { organization: "Toyota Motor Corporation", family: "toyota", role: "PRIMARY_OFFICIAL" },
  "www.toyota-europe.com": { organization: "Toyota Motor Europe (Toyota group)", family: "toyota", role: "PRIMARY_OFFICIAL" },
  "sre.google": { organization: "Google", family: "google", role: "PRIMARY_OFFICIAL" },
  "www.nist.gov": { organization: "NIST (US Dept. of Commerce)", family: "nist", role: "PRIMARY_OFFICIAL" },
  "www.nasa.gov": { organization: "NASA", family: "nasa", role: "PRIMARY_OFFICIAL" },
  "sma.nasa.gov": { organization: "NASA Office of Safety and Mission Assurance", family: "nasa", role: "PRIMARY_OFFICIAL" },
});
function hostOf(u: any): string { try { return new URL(String(u)).hostname.toLowerCase(); } catch { return ""; } }
function identityOf(url: string): any {
  const p = PUBLISHERS[hostOf(url)];
  return p ? Object.freeze({ host: hostOf(url), ...p, known: true }) : Object.freeze({ host: hostOf(url), organization: null, family: null, role: "UNKNOWN", known: false });
}

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function sha(v: any): string { return crypto.createHash("sha256").update(JSON.stringify(v === undefined ? null : v)).digest("hex"); }
function nkey(v: any): string { return String(v == null ? "" : v).toLowerCase().replace(/\s+/g, " ").trim(); }
/* structured key used for cross-source comparison: subject+relation+value (+scope). Qualifiers/time/version are KEPT and
 * compared separately: a key match with differing qualifiers is reported as a DIVERGENCE, not silently merged. */
function structuredKey(c: any): string { return [nkey(c.subject), nkey(c.relation), nkey(c.value)].join("|"); }   // scope kept as information, not matched (it is not grounded)
/* controlled RELATION vocabulary (versioned): a relation outside it cannot ground a key (inspection HIGH: free-text relation). */
const RELATIONS = Object.freeze(["equals", "is defined as", "is described as", "defines traceability as", "makes", "halts", "designates", "released on / intended for", "states"]);
/* content words: not grammar, not the host's attribution words. */
function contentWords(text: string, url: string): string[] {
  const attr = new Set<string>((BIND.HOST_ATTRIBUTION[hostToReg(url)] || []) as string[]);
  return BIND.words(text).filter((w: string) => !BIND.GRAMMAR.has(w) && !attr.has(w));
}
function hostToReg(u: string): string { try { const p = new URL(u).hostname.toLowerCase().split("."); return p.slice(-2).join("."); } catch { return ""; } }
/* value must appear as a CONTIGUOUS normalized phrase in one citation (or each " and "-joined part in some citation). */
function contiguousIn(value: string, cits: string[], url: string): boolean {
  const nv = BIND.norm(value); const nc = cits.map((c: string) => " " + BIND.norm(c) + " ");
  if (nc.some((c: string) => c.includes(" " + nv + " "))) return true;
  // " and "-joined parts (two sentences of one page): EACH part must itself carry ≥2 content words (inspection HIGH r3:
  // single shared words like "use and risks" must not ground) and be contiguous in some citation.
  const parts = nv.split(" and ").map((x: string) => x.trim()).filter(Boolean);
  return parts.length > 1 && parts.every((p: string) => contentWords(p, url).length >= 2 && nc.some((c: string) => c.includes(" " + p + " ")));
}

/* crossFamilyOverlap(collection) -> contiguous n-grams (≥2 content words) present in ≥2 publisher FAMILIES.
 * Run on every NEW collection (V374): a non-empty result means cross-family structured keys COULD ground on shared
 * boilerplate, so those phrases must be reviewed before any CORROBORATED result is trusted. Pure. */
function crossFamilyOverlap(collection: any, maxN?: number): any {
  const N = Number.isFinite(maxN) ? (maxN as number) : 6;
  const byPhrase: Record<string, Set<string>> = {};
  for (const s of (isObj(collection) && Array.isArray(collection.sources) ? collection.sources : [])) {
    const fam = identityOf(s && s.url).family; if (!fam) continue;
    for (const q of (Array.isArray(s.quotes) ? s.quotes : [])) {
      const w = BIND.words(q);
      for (let n = 2; n <= N; n++) for (let i = 0; i + n <= w.length; i++) {
        const gram = w.slice(i, i + n).join(" ");
        if (contentWords(gram, s.url).length < 2) continue;
        (byPhrase[gram] = byPhrase[gram] || new Set()).add(fam);
      }
    }
  }
  const shared = Object.keys(byPhrase).filter((g) => byPhrase[g].size >= 2).sort().map((g) => Object.freeze({ phrase: g, families: Array.from(byPhrase[g]).sort() }));
  return Object.freeze({ sharedPhrases: Object.freeze(shared), count: shared.length, note: shared.length ? "REVIEW: shared cross-family phrases could ground matching keys" : "no substantive phrase shared across publisher families" });
}

/* attestCollection(collection, { pinnedDigests?, attestation?, registry?, asOf }) -> { attested, via, sha256, byUrl }.
 * V374 ROOT FIX for the byUrl trust root: page quotes count only when they come from an AUTHENTICATED collection artefact —
 * its deep-canonical SHA-256 is PINNED in a versioned registry (git-reviewed), OR it carries a valid signed attestation by a
 * registered, non-revoked collector key. Anything else ⇒ attested:false ⇒ every claim built on it is capped at CANDIDATE. */
const ATTESTED_COLLECTIONS: WeakSet<any> = new WeakSet();   // brand: ONLY attestCollection can mint an attested result
function deepFreeze(v: any): any { if (v && typeof v === "object") { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; }
function attestCollection(collection: any, o: any): any {
  const opts = isObj(o) ? o : {};
  let copy: any, sha: string;
  try { copy = deepFreeze(JSON.parse(JSON.stringify(collection))); sha = ATT.contentSha256(collection); if (ATT.contentSha256(copy) !== sha) throw new Error("non-JSON"); }
  catch { return Object.freeze({ attested: false, via: null, sha256: null, byUrl: Object.freeze({}), reason: "non-canonical collection" }); }
  const byUrl: Record<string, any> = {};
  for (const s of (isObj(copy) && Array.isArray(copy.sources) ? copy.sources : [])) if (s && typeof s.url === "string") byUrl[s.url] = s;   // frozen copies: later caller mutation cannot leak in
  let via: string | null = null;
  let sandbox = false;
  if (REPO_PINS.includes(sha)) via = "PINNED_DIGEST";                                            // production path (repo-pinned)
  else if (Array.isArray(opts.pinnedDigests) && opts.pinnedDigests.includes(sha)) { via = "SANDBOX_PINNED"; sandbox = true; }   // caller pins ⇒ SANDBOX only
  let signature: any = null;
  if (!via && opts.attestation) {
    const v = ATT.verifyAttestation(opts.attestation, copy, { registry: opts.registry, asOf: opts.asOf, purpose: "COLLECTION_ARTIFACT", seenNonces: opts.seenNonces, allowRepeatVerification: opts.allowRepeatVerification });
    signature = v.valid ? (anchored("COLLECTION_ARTIFACT", v) ? "ANCHORED" : "VALID_BUT_UNANCHORED") : v.reason;
    if (anchored("COLLECTION_ARTIFACT", v)) via = "SIGNED_ANCHORED:" + v.provenance.issuer;   // a valid signature by a NON-anchored key authenticates nothing
  }
  const res = Object.freeze({ attested: via !== null, via, sandbox, signature, sha256: sha, byUrl: Object.freeze(byUrl) });
  if (res.attested) ATTESTED_COLLECTIONS.add(res);
  return res;
}

/*
 * assessClaim(claim, opts) -> four-dimensional, explainable assessment.
 * claim: { id?, subject, relation, value, scope?, time?, version?, qualifiers?: string[], nature, text,
 *          sources: [{ url, citation, text?: the source's own statement, structured?: {subject, relation, value, scope} }] }
 * opts:  { asOfEpochMs (required), byUrl: { [url]: {quotes[], title?} } — TRUST ROOT: must come from a RECORDED, governed
 *          collection (research-governor ALLOW + bounded-http-client), never from an untrusted caller; a caller who forges
 *          byUrl for a known host can forge support (documented limit), quarantined?: string[],
 *          missionAuthorization?: one of AUTHORIZATION (granted by the mission contract), risk?: one of RISK,
 *          contradictingSources?: [{url, citation}], invalidatedBy?: string }
 */
function assessClaim(claim: any, opts: any): any {
  const c = isObj(claim) ? claim : {};
  const o = isObj(opts) ? opts : {};
  if (!Number.isFinite(o.asOfEpochMs)) throw new Error("assessClaim: asOfEpochMs required (deterministic)");
  // trust root (V374): prefer an ATTESTED collection; raw caller-supplied byUrl is accepted but UNATTESTED (capped below).
  const col = isObj(o.collection) ? o.collection : null;
  const attestedCollection = !!(col && ATTESTED_COLLECTIONS.has(col));   // brand check — a self-declared {attested:true} is NOT trusted
  const byUrl = col && isObj(col.byUrl) ? col.byUrl : (isObj(o.byUrl) ? o.byUrl : {});   // unattested pages stay usable but are capped at CANDIDATE
  const quarantined = new Set<string>(Array.isArray(o.quarantined) ? o.quarantined : []);
  const reasons: string[] = [];

  // 1-3. verify each source separately: citation verbatim on ITS page + bound to the claim text (step-2 binding).
  const srcList = Array.isArray(c.sources) ? c.sources : [];
  // a source may contribute SEVERAL citations to one statement (e.g. two sentences of the same page): coverage is judged on
  // the UNION of that url's citations (same rule as the step-2 replay); each citation must still be verbatim + substantive.
  const citationsOf = (u: any) => srcList.filter((x: any) => x && x.url === u && typeof x.citation === "string").map((x: any) => x.citation);
  const perSource = srcList.map((s: any) => {
    const id = identityOf(s && s.url);
    const sp = { url: s && s.url, quote: s && s.citation };
    // each source may state the claim in ITS OWN words (s.text); its citation is bound to THAT text, never to another
    // source's wording. Cross-source agreement is then decided by the structured key, not by lexical similarity.
    const ownText = typeof (s && s.text) === "string" && s.text ? s.text : c.text;
    const bound = BIND.supports(sp, ownText, byUrl, quarantined) && BIND.covered(ownText, citationsOf(sp.url), sp.url);
    // FIX (inspection HIGH): a source counts only with ITS OWN structured key (no inheritance from the claim), and that key
    // must be GROUNDED in what the source shows: every VALUE word in its citations, every SUBJECT word in its citations,
    // its recorded page title, or the host's attribution words. A key a source does not show cannot be borrowed.
    const own = isObj(s && s.structured) ? s.structured : null;
    const title = byUrl[sp.url] && typeof byUrl[sp.url].title === "string" ? byUrl[sp.url].title : "";
    const cits = citationsOf(sp.url);
    const val = String((own && own.value) || ""), subj = String((own && own.subject) || "");
    // grounding (inspection HIGH x2): value ≥2 content words AND contiguous in the citations; subject ≥1 content word and
    // covered by citations/title/attribution; relation from the controlled vocabulary. Grammar-only keys never ground.
    const grounded = !!own && RELATIONS.includes(nkey(own.relation))
      && contentWords(val, sp.url).length >= 2 && contiguousIn(val, cits, sp.url)
      && contentWords(subj, sp.url).length >= 1 && BIND.covered(subj, cits.concat([title]), sp.url);
    // the PRESENTED claim text itself must be covered by this source's citations to count toward a FACT.
    // …and it must CONTAIN the grounded value contiguously and carry ≥3 content words (no meaningless shared-word claims).
    const ntext = " " + BIND.norm(String(c.text || "")) + " ";
    const claimCovered = BIND.covered(String(c.text || ""), cits, sp.url) && grounded && contentWords(String(c.text || ""), sp.url).length >= 3
      && (ntext.includes(" " + BIND.norm(val) + " ") || BIND.norm(val).split(" and ").every((p: string) => ntext.includes(" " + p.trim() + " ")));
    const key = own ? structuredKey(own) : null;
    return Object.freeze({ url: sp.url, identity: id, citationVerified: bound, structuredKey: key, keyGrounded: grounded, claimTextCovered: claimCovered, quarantined: quarantined.has(sp.url) });
  });
  const seenUrl = new Set<string>();
  const verified = perSource.filter((p: any) => p.citationVerified && !p.quarantined && !seenUrl.has(p.url) && (seenUrl.add(p.url), true));
  const claimKey = structuredKey(c);

  // 4-7. independence by ORGANIZATION FAMILY among verified sources whose structured key matches the claim.
  const matching = verified.filter((p: any) => p.keyGrounded && p.structuredKey === claimKey);
  const divergent = verified.filter((p: any) => p.keyGrounded && p.structuredKey !== claimKey);
  const ungrounded = verified.filter((p: any) => !p.keyGrounded).length;
  const knownFamilies = Array.from(new Set(matching.filter((p: any) => p.identity.known).map((p: any) => p.identity.family)));
  const unknownIdentity = matching.filter((p: any) => !p.identity.known).length;
  const officialPrimary = matching.some((p: any) => p.identity.role === "PRIMARY_OFFICIAL");

  // EPISTEMIC (independent of maturity/authorization/risk).
  const factFamilies = Array.from(new Set(matching.filter((p: any) => p.identity.known && p.claimTextCovered).map((p: any) => p.identity.family)));
  if (knownFamilies.length >= 2 && factFamilies.length < 2) reasons.push("keys match across families but the PRESENTED claim text is not covered by ≥2 families' citations ⇒ not a fact");
  let epistemic = "UNKNOWN";
  const contradicted = Array.isArray(o.contradictingSources) && o.contradictingSources.some((x: any) => isObj(x && x.structured) && nkey(x.structured.subject) === nkey(c.subject) && BIND.supports({ url: x.url, quote: x.citation }, x.text || x.citation, byUrl, quarantined));
  if (typeof o.invalidatedBy === "string" && o.invalidatedBy) { epistemic = "INVALIDATED"; reasons.push("invalidated by " + o.invalidatedBy); }
  else if (contradicted) { epistemic = "CONTRADICTED"; reasons.push("a verified source contradicts the claim"); }
  else if (factFamilies.length >= 2) { epistemic = "CORROBORATED"; reasons.push("matching structured key from " + knownFamilies.length + " independent publisher families: " + knownFamilies.join(", ")); }
  else if (matching.length >= 1 && officialPrimary && c.nature === "OFFICIAL_DOCUMENTATION") { epistemic = "SUPPORTED"; reasons.push("verified OFFICIAL primary source documenting its own statement (" + (knownFamilies[0] || "?") + ") — supports WHAT THE PUBLISHER STATES, not a general truth"); }
  else if (matching.length >= 1) { epistemic = "CANDIDATE"; reasons.push("verified citation, but nature '" + (c.nature || "?") + "' needs " + (c.nature === "PERFORMANCE_CLAIM" ? "an independent reproducible benchmark" : c.nature === "SCIENTIFIC_PUBLICATION" ? "methodology/reproducibility review" : "evidence appropriate to its nature")); }
  else if (perSource.length) { epistemic = "UNKNOWN"; reasons.push("no source citation verified against the recorded page text"); }
  if (matching.length >= 2 && knownFamilies.length < 2) reasons.push("repetition within ONE publisher family (" + (knownFamilies.join(",") || "unknown") + ") is NOT independent corroboration");
  if (unknownIdentity) reasons.push(unknownIdentity + " source(s) with UNKNOWN publisher identity — not counted for independence");
  if (ungrounded) reasons.push(ungrounded + " verified citation(s) without a GROUNDED own structured key — not counted");
  if (divergent.length) reasons.push(divergent.length + " verified source(s) with a DIFFERENT structured key kept as divergence (not merged)");

  if (!attestedCollection && (epistemic === "SUPPORTED" || epistemic === "CORROBORATED")) {
    reasons.push("page quotes not from an AUTHENTICATED collection (no pinned digest / valid collector attestation) ⇒ capped at CANDIDATE");
    epistemic = "CANDIDATE";
  }
  const sandboxCollection = attestedCollection && col.sandbox === true;
  if (sandboxCollection) reasons.push("SANDBOX collection (caller-pinned): result is never a fact and authorization ≤ SANDBOX_EXPERIMENT");
  // MATURITY (operational, NOT truth): starts at DISCOVERED; USABLE once a citation is verified; higher levels require
  // evidence supplied by a mission (experiment / qualification / demonstrated benefit) — never inferred here.
  let maturity = verified.length ? "USABLE" : "DISCOVERED";
  // maturity evidence (V375 G2): each level needs evidence VERIFIED ON THE REAL FILES (contract exists with that id and a
  // counting state; evidence file's SHA-256 recomputed and cross-referenced). Declared ids/hashes alone never count.
  const ev = isObj(o.maturityEvidence) ? o.maturityEvidence : {};
  const reader = REPO_READER;   // opts.evidenceReader is IGNORED (a caller-supplied reader could return forged bytes)
  const bound = (x: any) => { if (!isObj(x)) return false; const v = EVV.verifyMaturityEvidence(x, reader); if (!v.ok) reasons.push("maturity evidence refused: " + v.reason); return v.ok; };
  if ((o.experimentApproved === true || o.qualificationEvidence === true || o.demonstratedBenefit === true) && !isObj(ev.experiment)) reasons.push("bare maturity booleans ignored — supply verifiable evidence {missionContract, contractPath, evidencePath, evidenceSha256}");
  if (bound(ev.experiment) && verified.length) maturity = "EXPERIMENTAL";
  if (bound(ev.qualification) && maturity === "EXPERIMENTAL") maturity = "QUALIFIED";
  if (bound(ev.demonstratedBenefit) && maturity === "QUALIFIED") maturity = "OPERATIONALLY_DEMONSTRATED";

  // RISK (drives verification/authorization requirements). Default from nature; caller may only RAISE it.
  const natureRisk: Record<string, string> = { SECURITY_CRITICAL: "HIGH", PERFORMANCE_CLAIM: "MEDIUM", STRATEGIC_HYPOTHESIS: "MEDIUM" };
  const natureValid = NATURE.includes(c.nature);
  if (!natureValid) reasons.push("unknown nature '" + String(c.nature) + "' ⇒ treated as MEDIUM risk, never SUPPORTED");
  const base = !natureValid ? "MEDIUM" : (natureRisk[c.nature] || "LOW");
  const risk = RISK.indexOf(o.risk) > RISK.indexOf(base) ? o.risk : base;

  // AUTHORIZATION — from the MISSION CONTRACT (permissions/risk), never from confidence. Capped by epistemic+risk:
  const requested = AUTHORIZATION.includes(o.missionAuthorization) ? o.missionAuthorization : "READ_ONLY_ANALYSIS";
  let authorization = requested;
  if (epistemic === "INVALIDATED" || epistemic === "CONTRADICTED" || epistemic === "UNKNOWN") authorization = epistemic === "UNKNOWN" ? "READ_ONLY_ANALYSIS" : "BLOCKED";
  else {
    // caps (FIX inspection MEDIUM): authorization never exceeds what the epistemic level, maturity and risk allow.
    const A = (x: string) => AUTHORIZATION.indexOf(x);
    let cap = "INTERNAL_INTEGRATION";
    if (epistemic === "CANDIDATE") cap = "SANDBOX_EXPERIMENT";
    else if (epistemic === "SUPPORTED") cap = (maturity === "QUALIFIED" || maturity === "OPERATIONALLY_DEMONSTRATED") ? "INTERNAL_INTEGRATION" : "INTERNAL_IMPLEMENTATION";
    if ((risk === "HIGH" && epistemic !== "CORROBORATED") || (risk === "CRITICAL" && !(maturity === "QUALIFIED" || maturity === "OPERATIONALLY_DEMONSTRATED"))) cap = A(cap) < A("SANDBOX_EXPERIMENT") ? cap : "SANDBOX_EXPERIMENT";
    if (sandboxCollection && A(cap) > A("SANDBOX_EXPERIMENT")) cap = "SANDBOX_EXPERIMENT";
    if (A(requested) > A(cap)) { authorization = cap; reasons.push("authorization capped at " + cap + " (epistemic " + epistemic + ", maturity " + maturity + ", risk " + risk + ")"); }
  }

  const assessment = Object.freeze({
    asOfEpochMs: o.asOfEpochMs,
    id: "kc:" + sha({ k: claimKey, t: c.text }).slice(0, 16),   // always content-bound (caller id ignored)
    structured: Object.freeze({ subject: c.subject, relation: c.relation, value: c.value, scope: c.scope || null, time: c.time || null, version: c.version || null, qualifiers: Object.freeze((c.qualifiers || []).slice()) }),
    text: c.text, nature: c.nature || null,
    dimensions: Object.freeze({ epistemic, maturity, authorization, risk }),
    isFact: epistemic === "CORROBORATED" && !sandboxCollection,   // only corroborated knowledge on a REPO-authenticated collection is a fact
    wouldBeFact: epistemic === "CORROBORATED",                    // logic outcome (for sandbox experiments), never presented as fact
    sandbox: sandboxCollection,
    sources: Object.freeze(perSource), independentFamilies: Object.freeze(knownFamilies),
    reasons: Object.freeze(reasons),
  });
  ASSESSMENTS.add(assessment);
  return assessment;
}

/* toMemory(assessment, asOf) -> record in the EXISTING memory shape (family "semantic"); kept even when not a fact.
 * status mirrors the epistemic level; memory-trust-gate decides admission/reuse as before. */
function toMemory(a: any, asOf: number): any {
  const urls = (a.sources || []).filter((s: any) => s.citationVerified).map((s: any) => s.url).sort();
  const e = a.dimensions.epistemic;
  // V374 TRUST-GATE SEPARATION: RETENTION (kept in memory) is NOT ADMISSION AS FACT. Only CORROBORATED maps to the memory
  // status VERIFIED (what memory-trust-gate trusts); SUPPORTED/CANDIDATE/UNKNOWN are KEPT with status UNVERIFIED, so the
  // existing gate never trusts them as facts; CONTRADICTED/INVALIDATED map to INVALIDATED (never reusable).
  return Object.freeze({
    id: a.id, family: "semantic", claim: a.text, structured: a.structured, dimensions: a.dimensions, epistemic: e,
    retention: e === "INVALIDATED" || e === "CONTRADICTED" ? "KEPT_INVALID" : "KEPT",
    provenance: urls.length ? "KI_V2_VERIFIED_CITATION:" + urls.join("|") : undefined,
    status: (e === "CORROBORATED" && a.isFact === true) ? "VERIFIED" : (e === "INVALIDATED" || e === "CONTRADICTED") ? "INVALIDATED" : "UNVERIFIED",   // sandbox CORROBORATED is NOT VERIFIED
    confidence: (e === "CORROBORATED" && a.isFact === true) ? 0.9 : e === "SUPPORTED" ? 0.7 : 0.3,
    learnedAt: asOf, validUntil: asOf + 90 * 86400000,
    authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR",
    isFact: a.isFact === true && e === "CORROBORATED",
  });
}
/* recordProvenance(rec, {assessment?, attestation?, registry?, ...}) -> {ok, via, reason}. */
function recordProvenance(rec: any, opts: any): any {
  if (opts && opts.assessment) {
    if (!ASSESSMENTS.has(opts.assessment)) return { ok: false, reason: "assessment not minted by assessClaim" };
    let a: string, b: string;
    const t0 = opts.assessment.asOfEpochMs;   // learnedAt is BOUND to the assessment's own clock (no re-dating / future dating)
    if (!Number.isFinite(t0) || rec.learnedAt !== t0) return { ok: false, reason: "learnedAt does not match the assessment time (re-dated record)" };
    if (Number.isFinite(opts.asOf) && t0 > opts.asOf) return { ok: false, reason: "assessment dated in the future" };
    try { a = ATT.contentSha256(toMemory(opts.assessment, t0)); b = ATT.contentSha256(rec); } catch { return { ok: false, reason: "non-canonical record" }; }
    return a === b ? { ok: true, via: "ASSESSMENT:" + opts.assessment.id } : { ok: false, reason: "record differs from what its assessment produces (re-wrapped/inflated)" };
  }
  if (opts && opts.attestation) {
    const v = ATT.verifyAttestation(opts.attestation, rec, { registry: opts.registry, asOf: opts.asOf, purpose: "KNOWLEDGE_RECORD", seenNonces: opts.seenNonces, allowRepeatVerification: opts.allowRepeatVerification });
    if (!v.valid) return { ok: false, reason: "attestation " + v.reason };
    return anchored("KNOWLEDGE_RECORD", v) ? { ok: true, via: "ANCHORED:" + v.provenance.issuer } : { ok: false, reason: "signed by a NON-anchored key (signature proves only that the signer approved it)" };
  }
  return { ok: false, reason: "no assessment and no anchored attestation" };
}
/* usableFor(rec, requested, asOf) -> authorization actually granted for THIS use: never above the record's own capped
 * authorization, never above the mission contract's request; INVALID/stale ⇒ BLOCKED / READ_ONLY. Reuse never elevates. */
function usableFor(rec: any, requested: string, asOf: number, o?: any): any {
  const A = (x: string) => AUTHORIZATION.indexOf(x);
  const opts = isObj(o) ? { ...o, asOf } : { asOf };
  if (!isObj(rec) || !isObj(rec.dimensions)) return Object.freeze({ authorization: "BLOCKED", reason: "not a KI-V2 record" });
  if (rec.status === "INVALIDATED" || rec.retention === "KEPT_INVALID") return Object.freeze({ authorization: "BLOCKED", reason: "invalidated/contradicted knowledge" });
  // the record's own fields are trusted ONLY if (a) it is EXACTLY what toMemory() produces from a BRANDED assessment
  // (minted by assessClaim, which caps everything not built on an authenticated collection), or (b) it carries a valid
  // KNOWLEDGE_RECORD attestation by an ANCHORED issuer. Caller-made keys / re-wrapped records never elevate.
  const prov = recordProvenance(rec, opts);
  if (!prov.ok) return Object.freeze({ authorization: "READ_ONLY_ANALYSIS", isFact: false, reason: "record not grounded (" + prov.reason + ") — read-only, no elevation" });
  const v = { provenance: { issuer: prov.via } };
  if (!Number.isFinite(rec.validUntil) || !Number.isFinite(asOf) || asOf > rec.validUntil) return Object.freeze({ authorization: "READ_ONLY_ANALYSIS", isFact: false, reason: "stale or undated knowledge — re-verify before use" });
  const req = AUTHORIZATION.includes(requested) ? requested : "READ_ONLY_ANALYSIS";
  const own = rec.dimensions.authorization;
  const granted = A(req) <= A(own) ? req : own;
  return Object.freeze({ authorization: granted, epistemic: rec.dimensions.epistemic, isFact: rec.isFact === true && rec.dimensions.epistemic === "CORROBORATED", attestedBy: v.provenance.issuer,
    reason: granted === req ? "within attested record + contract" : "capped by the record's own authorization (" + own + ")" });
}
/* admissible(rec, asOf, {attestation, registry, ...}) -> admission AS FACT: the existing memory-trust-gate verdict AND a
 * valid KNOWLEDGE_RECORD attestation (a caller cannot re-wrap a record as VERIFIED). */
function admissible(rec: any, asOf: number, o?: any): any {
  if (!isObj(rec) || rec.isFact !== true || rec.status !== "VERIFIED") return Object.freeze({ trusted: false, verdict: "NOT_A_FACT", reasons: Object.freeze(["only a REPO-authenticated CORROBORATED fact is admissible as fact"]), selfAuthorized: false });
  const g = MTG.assessMemoryTrust(rec, { asOf, trustedAuthors: [ACTOR.EXECUTOR.ODG], minConfidence: 0.5 });
  if (!g.trusted) return g;
  const opts = isObj(o) ? { ...o, asOf } : { asOf };
  const prov = recordProvenance(rec, opts);
  return prov.ok ? g : Object.freeze({ trusted: false, verdict: "UNGROUNDED_RECORD", reasons: Object.freeze([prov.reason]), selfAuthorized: false });
}

const KNOWLEDGE_INTELLIGENCE_CONTRACT = Object.freeze({
  id: "V373-KI-V2-LOT1",
  dimensions: Object.freeze({ EPISTEMIC, MATURITY, AUTHORIZATION, RISK }), natures: NATURE,
  invariants: Object.freeze([
    "four dimensions computed separately; never collapsed to one status",
    "independence = distinct PUBLISHER FAMILIES (source identity), never distinct domains alone",
    "single verified official primary source ⇒ SUPPORTED at most (what the publisher states), never CORROBORATED",
    "only CORROBORATED is presented as a fact (isFact); SUPPORTED/CANDIDATE are kept, usable with reservations",
    "authorization comes from the mission contract, capped by epistemic level and risk — never from confidence",
    "structured keys are authored PER SOURCE, must be grounded in that source's citations/title, compared exactly; divergent keys kept",
    "trust root: page quotes authenticate only via digests pinned in COLLECTION_REGISTRY.json or signatures by keys anchored in TRUST_ANCHORS.json — both loaded by this module, never from the caller; caller pins ⇒ SANDBOX (never a fact, ≤ SANDBOX_EXPERIMENT)",
    "records are trusted only when reproduced from a branded assessment at its own time, or signed by an anchored key; maturity needs bound evidence",
    "LIMITS: in-process code can poison the require cache / monkeypatch (process boundary is the real security boundary); allowRepeatVerification is an explicit replay opt-out for re-verifying stored artefacts",
    "layer over existing memory/trust-gate/binding — no second memory/radar/orchestrator",
  ]),
});

module.exports = { TRUST_ANCHORS, assessClaim, attestCollection, crossFamilyOverlap, toMemory, usableFor, admissible, identityOf, structuredKey, RELATIONS, PUBLISHERS, EPISTEMIC, MATURITY, AUTHORIZATION, RISK, NATURE, KNOWLEDGE_INTELLIGENCE_CONTRACT };
export {};
