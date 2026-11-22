#!/usr/bin/env node
"use strict";
/* V373 KI-V2 Lot 1 — re-assess the 7 REAL step-2 claims (docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json)
 * with the four-dimension model + publisher-family identity. OFFLINE (no new collection: reuse before re-collect).
 * Structured keys below are AUTHORED from the recorded quotes (not model-inferred). Usage: [--write <path>] */
const fs = require("fs");
const path = require("path");
const K = require("../core/odg-knowledge-intelligence.js");
const FR = require("../core/frontier-radar.js");

const STRUCT: Record<string, any> = {
  // keys AUTHORED from the recorded quotes; VALUE words must appear in each source's citations, SUBJECT words in its
  // citations / page title / host attribution words (grounding enforced by assessClaim).
  "Toyota quality: 'automation with a human touch'": { subject: "Toyota automation principle", relation: "is described as", value: "automation with a human touch", scope: "Toyota Production System", qualifiers: ["term 'jidoka' named only on global.toyota"] },
  "Toyota production: make only what is needed, when it is needed": { subject: "Toyota Production System", relation: "makes", value: "only what is needed, when it is needed", scope: "Toyota Production System", qualifiers: ["label 'just-in-time' not in the recorded quotes"] },
  "SRE error budget definition": { subject: "error budget", relation: "equals", value: "1 minus the SLO of the service", scope: "a service", qualifiers: [] },
  "SRE example error budget policy: release halt": { subject: "Google SRE example error budget policy", relation: "halts", value: "all changes and releases other than P0 issues or security fixes", scope: "Appendix B EXAMPLE policy", qualifiers: ["example policy, not a universal rule"] },
  "NIST AI RMF release and nature": { subject: "NIST AI Risk Management Framework", relation: "released on / intended for", value: "released on January 26, 2023 and is intended for voluntary use", scope: "NIST page statement", time: "2023-01-26", version: "1.0", qualifiers: ["page states AI RMF 1.0 is being revised"] },
  "NASA requirements traceability": { subject: "NASA System Engineering Handbook", relation: "defines traceability as", value: "the ability to trace any given requirement/expectation to its parent requirement/expectation", scope: "NASA systems engineering", qualifiers: ["parent direction only in the recorded quote"] },
  "NASA independent verification and validation": { subject: "NASA IV&V provider policy", relation: "designates", value: "NASA Independent Verification and Validation (IV&V) Facility as the sole provider of IV&V services", scope: "NASA software selected for IV&V", qualifiers: ["page last updated 2014-09-10 (may be stale)"] },
};

function main() {
  const argv = process.argv.slice(2); const wi = argv.indexOf("--write"); const out = wi >= 0 ? argv[wi + 1] : null;
  const col = JSON.parse(fs.readFileSync("docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json", "utf8"));
  const asOf = Date.UTC(2026, 10, 22, 12);
  const registry = JSON.parse(fs.readFileSync("docs/odg/evidence/COLLECTION_REGISTRY.json", "utf8"));
  const collection = K.attestCollection(col, { pinnedDigests: registry.collections.map((c: any) => c.sha256) });   // V374 trust root
  if (!collection.attested) throw new Error("collection not authenticated (digest not pinned in COLLECTION_REGISTRY.json)");
  const byUrl: Record<string, any> = collection.byUrl;
  const quarantined = col.sources.filter((s: any) => FR.sanitizeExternal({ title: s.title, body: (s.quotes || []).join("\n") }).untrusted).map((s: any) => s.url);
  const results = col.cycles.map((cy: any) => {
    const st = STRUCT[cy.query] || {};
    const a = K.assessClaim({ ...st, nature: "OFFICIAL_DOCUMENTATION", text: cy.claim, sources: (cy.support || []).map((sp: any) => ({ url: sp.url, citation: sp.quote, structured: st })) },
      { asOfEpochMs: asOf, collection, quarantined, missionAuthorization: "DESIGN_PROPOSAL" });
    const mem = K.toMemory(a, asOf);
    return { query: cy.query, claim: cy.claim, structured: a.structured, dimensions: a.dimensions, isFact: a.isFact,
      independentFamilies: a.independentFamilies, verifiedSources: a.sources.filter((s: any) => s.citationVerified).map((s: any) => ({ url: s.url, organization: s.identity.organization, family: s.identity.family })),
      memory: { status: mem.status, retention: mem.retention, admittedAsFactByTrustGate: K.admissible(mem, asOf).trusted, usableForDesign: K.usableFor(mem, "DESIGN_PROPOSAL", asOf).authorization }, reasons: a.reasons };
  });
  const count = (k: string) => results.filter((r: any) => r.dimensions.epistemic === k).length;
  const evidence = {
    lot: "V373 Knowledge Intelligence V2 — Lot 1 (structured claims + source identity + four dimensions)",
    input: "docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json (no new network call)",
    summary: { claims: results.length, CORROBORATED: count("CORROBORATED"), SUPPORTED: count("SUPPORTED"), CANDIDATE: count("CANDIDATE"), UNKNOWN: count("UNKNOWN"), keptInMemory: results.filter((r: any) => r.memory.retention === "KEPT").length, admittedAsFact: results.filter((r: any) => r.memory.admittedAsFactByTrustGate).length, collectionAuthenticated: collection.via, presentedAsFact: results.filter((r: any) => r.isFact).length },
    crossFamilyOverlap: K.crossFamilyOverlap(col),
    correctionOfHistory: "step 2 (PR #854) labelled the 2 Toyota statements CORROBORATED by DOMAIN; KI-V2 reclassifies them SUPPORTED because both domains belong to ONE publisher family (Toyota). The step-2 evidence file is preserved unchanged; this file records the correction.",
    results,
    limits: ["structured keys authored from the recorded quotes, not model-inferred", "publisher identity map is explicit and small (6 hosts); unknown hosts never count", "quotes from WebFetch's extractor, not raw HTML"],
  };
  const json = JSON.stringify(evidence, null, 2) + "\n";
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, json); }
  process.stdout.write(JSON.stringify(evidence.summary) + "\n" + results.map((r: any) => `${r.dimensions.epistemic.padEnd(12)} fam=${r.independentFamilies.join(",")} mem=${r.memory.status} ${r.claim.slice(0, 70)}`).join("\n") + "\n");
}
main();
export {};
