/**
 * Claim↔quote binding (V372 step 2, inspected ACCEPT; moved to core in V373 so KI-V2 can reuse it without a core→bin
 * dependency). A source supports a claim only if its quote is verbatim on that page, substantive (≥4 words, ≥20 chars),
 * contained in the claim, and every claim content word is covered by that source's quotes or by grammar/host-bound
 * attribution words. PURE. Limits (recorded): bag-of-words coverage; trusts the extractor's recorded quotes.
 */
// FRAMING (inspection MEDIUM): grammar words are global; ATTRIBUTION words (organization names, document qualifiers) are
// allowed ONLY for the source host they belong to — "NASA policy states: <an SRE quote>" no longer passes.
const GRAMMAR = new Set(["page", "states", "state", "describes", "defines", "define", "says", "on", "was", "the", "a", "an", "is", "as", "to", "of", "and", "it", "will", "that", "its"]);
const HOST_ATTRIBUTION: Record<string, string[]> = {
  "global.toyota": ["toyota", "toyotas", "principle", "production"],
  "toyota-europe.com": ["toyota", "toyotas", "principle", "production"],
  "sre.google": ["google", "sre", "sres", "policy", "example"],
  "nasa.gov": ["nasa", "policy", "handbook"],
  "nist.gov": ["nist", "ai", "rmf", "framework"],
};
// qualifiers that must NOT be dropped: the sre.google page is an EXAMPLE policy (Appendix B) ⇒ a claim about its policy says so.
const HOST_REQUIRES: Record<string, Array<{ ifWord: string; thenWord: string }>> = { "sre.google": [{ ifWord: "policy", thenWord: "example" }] };
function regDomain(u: string): string { try { const p = new URL(u).hostname.toLowerCase().split("."); return p.slice(-2).join("."); } catch { return ""; } }
const FRAMING = GRAMMAR;   // kept as an export name for backward compatibility (grammar only)
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
function covered(claim: string, quotes: string[], url?: string): boolean {
  const qw = new Set(([] as string[]).concat(...quotes.map((q: string) => words(q))));
  const host = url ? regDomain(url) : "";
  const attribution = new Set(HOST_ATTRIBUTION[host] || []);
  const cw = words(claim);
  if (!cw.every((w: string) => qw.has(w) || GRAMMAR.has(w) || attribution.has(w))) return false;
  for (const r of HOST_REQUIRES[host] || []) if (cw.includes(r.ifWord) && !cw.includes(r.thenWord) && !qw.has(r.ifWord)) return false;
  return true;
}

module.exports = { supports, covered, norm, words, FRAMING, GRAMMAR, HOST_ATTRIBUTION };
export {};
