#!/usr/bin/env node
"use strict";
/* V372 CM-RADAR-GATE-CHAIN step 2 — replay the FIRST live collection (recorded in
 * docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json) through the canonical controls, OFFLINE:
 *   research-governor.govern (grant policy, re-checked at the collection's consulted date) → bounded-http-client.validateUrl
 *   (transport) → frontier-radar.sanitizeExternal (prompt-injection quarantine) → odg-radar-gate-chain.runChain (acquire →
 *   admit → reuse → gate). Writes docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_EVIDENCE.json with --write.
 * No network here: the live fetch already happened (6 calls) and is recorded with provenance. */
const fs = require("fs");
const path = require("path");
const G = require("../core/research-governor.js");
const H = require("../core/bounded-http-client.js");
const FR = require("../core/frontier-radar.js");
const C = require("../core/odg-radar-gate-chain.js");

const FRAMING = new Set(["toyota", "toyotas", "nasa", "nist", "google", "sre", "sres", "page", "states", "state", "describes", "defines", "define",
  "policy", "example", "its", "principle", "production", "framework", "handbook", "says", "on", "ai", "rmf", "was", "the", "a", "an", "is", "as", "to", "of", "and", "it", "will", "that"]);
function norm(t: any): string { return String(t || "").toLowerCase().replace(/['’]s\b/g, "").replace(/[^a-z0-9/%&.]+/g, " ").replace(/\.(?=\s|$)/g, " ").replace(/\s+/g, " ").trim(); }
function words(t: any): string[] { return norm(t).split(" ").filter(Boolean); }
function supports(sp: any, claim: string, byUrl: Record<string, any>, quarantined: Set<string>): boolean {
  if (!sp || !byUrl[sp.url] || quarantined.has(sp.url) || typeof sp.quote !== "string") return false;
  const q = sp.quote;
  if (!(byUrl[sp.url].quotes || []).some((rq: string) => rq.includes(q))) return false;          // (a) verbatim on the page
  if (words(q).length < 4 || q.trim().length < 20) return false;                                   // (b) substantive
  if (!(" " + norm(claim) + " ").includes(" " + norm(q) + " ")) return false;                      // (c) claim contains the quote
  return true;
}
/* coverage(claim, quotes): (d) every content word of the claim is covered by the UNION of that source's valid supporting
 * quotes (a source may contribute several quotes to one claim) or by the explicit FRAMING list. */
function covered(claim: string, quotes: string[]): boolean {
  const qw = new Set(([] as string[]).concat(...quotes.map((q: string) => words(q))));
  return words(claim).every((w: string) => qw.has(w) || FRAMING.has(w));
}

function main() {
  const argv = process.argv.slice(2); const wi = argv.indexOf("--write"); const out = wi >= 0 ? argv[wi + 1] : null;
  const col = JSON.parse(fs.readFileSync("docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json", "utf8"));
  const grant = JSON.parse(fs.readFileSync(col.grant, "utf8")).grant;
  const asOf = Date.UTC(2026, 10, 22, 12);                  // collection day (consultedDate 2026-11-22), injected
  const byUrl: Record<string, any> = {}; for (const s of col.sources) byUrl[s.url] = s;

  const gov = G.govern({ urls: col.sources.map((s: any) => s.url) }, grant, asOf);
  const hosts = col.sources.map((s: any) => new URL(s.url).hostname);
  const transport = col.sources.map((s: any) => ({ url: s.url, ok: H.validateUrl(s.url, hosts).ok }));
  const screening = col.sources.map((s: any) => { const r = FR.sanitizeExternal({ title: s.title, body: (s.quotes || []).join("\n") }); return { url: s.url, untrusted: r.untrusted, injectionFlags: r.injectionFlags }; });
  const quarantined = new Set<string>(screening.filter((x: any) => x.untrusted).map((x: any) => x.url));

  let memory: any[] = [];
  const results = col.cycles.map((cy: any) => {
    // QUOTE CHECK (inspection HIGH x2). A source supports the claim ONLY if ALL hold:
    //  (a) its supportingQuote appears verbatim in that source's recorded quotes;
    //  (b) the quote is substantive (≥ 4 words and ≥ 20 chars — no trivial "the");
    //  (c) the CLAIM contains the (normalized) quote — the claim is tied to what the page shows;
    //  (d) every content word of the claim is covered by that quote or by a small explicit FRAMING list (attribution words).
    // This bounds a claim to its quote; it still trusts the extractor's quotes (recorded limit).
    const valid = (cy.support || []).filter((sp: any) => supports(sp, cy.claim, byUrl, quarantined));
    const byUrlQuotes: Record<string, string[]> = {}; for (const sp of valid) (byUrlQuotes[sp.url] = byUrlQuotes[sp.url] || []).push(sp.quote);
    const supportOk = valid.filter((sp: any) => covered(cy.claim, byUrlQuotes[sp.url]));
    const droppedSupport = (cy.support || []).length - supportOk.length;
    const urls = Array.from(new Set(supportOk.map((sp: any) => sp.url)));
    const sources = urls.map((u: any) => ({
      url: u, status: byUrl[u].status, publishedDate: byUrl[u].publishedDate || undefined, consultedDate: col.consultedDate,
      claims: [{ text: cy.claim, type: "FACT" }],
    }));
    const r = C.runChain({ asOfEpochMs: asOf, cycle: { query: cy.query, capability: cy.capability, sources }, memory });
    memory = r.memoryOut as any[];
    const k = r.acquisition ? r.acquisition.knowledge[0] : null;
    return { query: cy.query, claim: cy.claim, capability: cy.capability, sources: sources.map((s: any) => s.url), supportingQuotes: supportOk, droppedSupport,
      classification: k ? k.classification : null, corroboration: k ? k.corroborationLevel : null, independentSupportCount: k ? k.independentSupportCount : null,
      admitted: r.admitted.length, rejected: r.rejected.map((x: any) => x.verdict), verdict: r.decision.verdict, action: r.decision.action };
  });
  // reuse proof on the live knowledge: a second pass over the same queries must retrieve, not re-acquire.
  const reuse = col.cycles.map((cy: any) => { const r = C.runChain({ asOfEpochMs: asOf + 86400000, cycle: { query: cy.query, capability: cy.capability, sources: [] }, memory }); return { query: cy.query, retrieved: r.reuse.retrieved, reacquired: r.reuse.reacquired }; });

  const admittedTotal = results.reduce((a: number, x: any) => a + x.admitted, 0);
  const evidence = {
    mission: "CM-RADAR-GATE-CHAIN (V12.4 §I) — step 2: first LIVE collection under the V372 grant",
    collection: "docs/odg/evidence/CM-RADAR-GATE-CHAIN_STEP2_COLLECTION.json", callsUsed: col.callsUsed, budgetMaxCalls: grant.budget.maxCalls,
    controls: { govern: { decision: gov.decision, reasons: gov.reasons, domains: gov.plan.domains }, transport, screening },
    results, reuse,
    summary: { cycles: results.length, admittedFacts: admittedTotal, singleSourceNotAdmitted: results.filter((x: any) => x.admitted === 0).length, quarantinedSources: quarantined.size,
      reuseOnSecondPass: reuse.filter((x: any) => x.retrieved > 0).length + "/" + reuse.length },
    honesty: [
      "admitted Toyota statements (no term↔definition claim) are corroborated by 2 OFFICIAL Toyota sites on distinct registrable domains — SAME ORGANIZATION (primary-source corroboration), not independent third parties",
      "SRE / NIST / NASA claims are SINGLE-SOURCE ⇒ recorded but NOT admitted as verified knowledge (fail-closed), even though each is an official primary source",
      "quotes were extracted by WebFetch's model from page text, not re-verified against raw HTML; each claim is limited to what its per-source supportingQuote shows (verbatim-checked against the recorded quotes)",
      "live-time egress gating (govern ALLOW + validateUrl before the fetch) is asserted by the provider and RE-CHECKED here; it is not reproducible from the repo alone",
      "NASA SE handbook page read partially (first 100000 of 253989 chars)",
      "no downstream experiment evidence ⇒ gate RETURNs; knowledge usefulness for ODG is NOT_MEASURED until a mission applies it",
    ],
  };
  const json = JSON.stringify(evidence, null, 2) + "\n";
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, json); }
  process.stdout.write(JSON.stringify(evidence.summary) + "\n" + results.map((x: any) => `${x.admitted ? "ADMITTED" : "not-admitted"} ${x.corroboration} ${x.claim}`).join("\n") + "\n");
}
if (require.main === module) main();
module.exports = { supports, covered, norm, words, FRAMING };
export {};
