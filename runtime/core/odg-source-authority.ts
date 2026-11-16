#!/usr/bin/env node
"use strict";
/*
 * V230 §3 — SOURCE AUTHORITY & INDEPENDENCE. PURE, deterministic. A GENERIC, reusable organization↔domain authority
 * registry that fixes the V229-R limitation: an official vendor domain (e.g. toyota-global.com) was not recognized as
 * official, and two domains owned by the SAME organization could be mis-counted as two independent corroborations.
 *
 * This is DATA, not special-case code: any organization is an entry {org, domains[]}; there is NO per-company branch for
 * Amazon/Google/NVIDIA. authority(url) returns the owning org + official tier; sameOwner(a,b) is true when both URLs
 * resolve to the same org (so aws.amazon.com + amazon.science do NOT count as two independent sources);
 * independentOwnerCount(urls) counts DISTINCT OWNERS (an unregistered host is its own owner by host).
 *
 * HARD HONESTY: being on an org's official domain makes a source a PRIMARY_OFFICIAL *claim by that org* — it is NOT, by
 * itself, independent corroboration (an org corroborating itself is not independence). Official ≠ true: an official claim
 * still needs independent corroboration to be a verified fact. Subdomain-tolerant, parent/bare-domain-safe. Dual export.
 */

// Reusable registry — extend by adding entries, never by code branches. Domains are each org's OWN primary domains.
const ORG_AUTHORITY = Object.freeze([
  { org: "Amazon", domains: Object.freeze(["amazon.com", "aws.amazon.com", "amazon.science", "aboutamazon.com"]) },
  { org: "Alphabet/Google", domains: Object.freeze(["google.com", "sre.google", "research.google", "deepmind.google", "cloud.google.com", "developers.google.com"]) },
  { org: "NVIDIA", domains: Object.freeze(["nvidia.com", "docs.nvidia.com", "developer.nvidia.com", "developer.download.nvidia.com"]) },
  { org: "Toyota", domains: Object.freeze(["toyota-global.com", "global.toyota", "toyota.com"]) },
  { org: "EU Publications Office", domains: Object.freeze(["europa.eu", "eur-lex.europa.eu"]) },
  { org: "Microsoft", domains: Object.freeze(["microsoft.com", "learn.microsoft.com", "azure.microsoft.com"]) },
  { org: "Apple", domains: Object.freeze(["apple.com", "developer.apple.com"]) },
]);

function host(url: any): string {
  const s = typeof url === "string" ? url.trim() : "";
  const m = s.match(/^https?:\/\/([^/]+)/i);
  return m ? m[1].toLowerCase().replace(/^www\./, "") : "";
}
// exact host OR a true subdomain of the registry domain; NEVER a parent/bare domain (reuses the V218 host-match fix).
function matches(h: string, domain: string): boolean { return h === domain || h.endsWith("." + domain); }

/* authority(url) -> { host, owner, officialTier, matchedDomain }. owner/officialTier null when the host is not an org domain. */
function authority(url: any): any {
  const h = host(url);
  if (h) {
    for (const e of ORG_AUTHORITY) {
      for (const d of e.domains) {
        if (matches(h, d)) return Object.freeze({ host: h, owner: e.org, officialTier: "PRIMARY_OFFICIAL", matchedDomain: d });
      }
    }
  }
  return Object.freeze({ host: h || null, owner: null, officialTier: null, matchedDomain: null });
}

/* sameOwner(a,b) -> true when both URLs resolve to the same known organization (NOT independent for corroboration). */
function sameOwner(a: any, b: any): boolean {
  const oa = authority(a).owner, ob = authority(b).owner;
  return oa !== null && ob !== null && oa === ob;
}

/* independentOwnerCount(urls) -> number of DISTINCT owners. A known org counts once (all its domains collapse); an
 * unregistered host is its own owner (by host). A non-URL contributes nothing. This is the true-independence count. */
function independentOwnerCount(urls: any[]): number {
  const owners = new Set<string>();
  for (const u of Array.isArray(urls) ? urls : []) {
    const a = authority(u);
    if (a.owner) owners.add("org:" + a.owner);
    else if (a.host) owners.add("host:" + a.host);
  }
  return owners.size;
}

/* classify(urls) -> independence + official summary for a set of cited sources. */
function classify(urls: any[]): any {
  const list = (Array.isArray(urls) ? urls : []).map((u: any) => authority(u));
  const officialOwners = Array.from(new Set(list.filter((a: any) => a.officialTier === "PRIMARY_OFFICIAL").map((a: any) => a.owner)));
  return Object.freeze({
    independentOwners: independentOwnerCount(urls),
    officialOwners: Object.freeze(officialOwners),
    hasOfficial: officialOwners.length > 0,
    note: "independentOwners counts DISTINCT organizations/hosts (same-org domains collapse to one); an official source is an org's own CLAIM, not by itself independent corroboration — official ≠ verified-true.",
  });
}

const SOURCE_AUTHORITY_CONTRACT = Object.freeze({
  id: "V230-SOURCE-AUTHORITY",
  purpose: "§3 — generic org↔domain authority registry: recognize official domains + count TRUE owner-level independence",
  invariants: Object.freeze([
    "DATA-driven registry (any org = an entry); NO special-case code branch per company",
    "two domains of the SAME org are NOT two independent corroborations (sameOwner ⇒ collapse to one owner)",
    "official domain ⇒ PRIMARY_OFFICIAL *claim by that org*, NOT by itself independent corroboration; official ≠ verified-true",
    "subdomain-tolerant, parent/bare-domain-safe (reuses the V218 host-match fix); deterministic; no freshness/content claims here",
  ]),
});

module.exports = { ORG_AUTHORITY, host, authority, sameOwner, independentOwnerCount, classify, SOURCE_AUTHORITY_CONTRACT };
export {};
