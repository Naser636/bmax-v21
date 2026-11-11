#!/usr/bin/env node
"use strict";
/* V138 — LIVE RESEARCH RADAR driver. Performs the DISCOVER→VALIDATE→ASSESS→RECORD→PROPOSE→GOVERN cycle over REAL primary
 * sources, under the owner's read-only-research authorization represented as a canonical SCOPED, EXPIRING grant. It composes
 * EXISTING mechanisms and bypasses nothing:
 *   - research-governor.govern(request, grant, now) authorizes each request (deny-by-default, mandatory expiry, domain
 *     allowlist) and produces the fetch PLAN — it performs no egress itself.
 *   - bounded-http-client.get() is the ONLY egress point: HTTPS-only, SSRF-guarded, size/redirect/content-type bounded. The
 *     grant's allowedDomains are passed as the per-call `allowlist` (the module's own injection point) — the canonical
 *     default ALLOWLIST is NOT mutated.
 *   - research-governor.stampFinding() + research-cycle.recordFinding() record dated, provenanced, deduped findings.
 * Every finding is labelled LIVE_SOURCE (really fetched) vs INTERNAL_EVIDENCE/FIXTURE/HYPOTHESIS. Standards are distinguished
 * from drafts/proposals from the fetched content. Discovery NEVER authorizes implementation: proposals are PROPOSED only.
 * Live egress runs ONLY when invoked with --live AND the sandbox permits it; otherwise the cycle runs on recorded evidence. */
const path = require("path"), fs = require("fs");
const ROOT = path.join(__dirname, "..", ".."), D = path.join(ROOT, "docs", "odg");
const GOV = require(path.join(ROOT, "runtime", "core", "research-governor.js"));
const CYCLE = require(path.join(ROOT, "runtime", "core", "research-cycle.js"));
const HTTP = require(path.join(ROOT, "runtime", "core", "bounded-http-client.js"));

// Owner-authorized scope (CTO V138 §4: "the owner authorizes read-only public research"). Minimum required scope: the
// specific public primary-source hosts named in the directive. Represented as the canonical grant shape. Expiry MANDATORY.
const ALLOWED_DOMAINS = ["www.rfc-editor.org", "standards.nasa.gov", "csrc.nist.gov"];
const TARGETS = [
  { url: "https://www.rfc-editor.org/rfc/rfc9000.txt", topic: "distributed-systems/transport (QUIC)", authority: "IETF" },
  { url: "https://www.rfc-editor.org/rfc/rfc9114.txt", topic: "distributed-systems (HTTP/3)", authority: "IETF" },
  { url: "https://standards.nasa.gov/standard/nasa/nasa-std-87398", topic: "software assurance / reliability", authority: "NASA" },
  { url: "https://csrc.nist.gov/pubs/sp/800/218/final", topic: "secure software development (SSDF)", authority: "NIST" },
];

// Classify the nature of a fetched document from its own content — STANDARD vs DRAFT vs PROPOSAL/PREPRINT (evidence-based).
function classifyNature(body: string): string {
  const b = String(body || "").slice(0, 4000);
  if (/\bI-D\b|Internet-Draft|\bDRAFT\b|draft-ietf-/i.test(b) && !/Proposed Standard|Internet Standard/i.test(b)) return "DRAFT";
  if (/Proposed Standard|Internet Standard|Category:\s*Standards Track|\bSTD\b/i.test(b)) return "STANDARD";
  if (/\bfinal\b|approved|effective date|Revision/i.test(b)) return "STANDARD_OR_GUIDELINE";
  return "UNVERIFIED_NATURE";
}
function extractClaim(body: string, ct: string): string {
  const b = String(body || "");
  if (/html/i.test(ct)) { const m = b.match(/<title[^>]*>([^<]{3,200})<\/title>/i); if (m) return m[1].trim().replace(/\s+/g, " "); }
  // text/plain (RFC): the title line(s) near the top, skipping the header block
  const lines = b.split("\n").map((l) => l.trim()).filter((l) => l.length > 8 && !/^(Internet|Request for|Category|ISSN|Obsoletes|Updates|\d|RFC\s)/i.test(l));
  return (lines.slice(0, 2).join(" — ") || b.slice(0, 160)).slice(0, 200);
}

// runResearch — the pure(ish) cycle over targets; fetchImpl is INJECTED (default = the canonical bounded egress) so the
// cycle is hermetically testable (no network in CI) while live runs use the real client. Returns {findings, egressDecisions, ledger}.
async function runResearch(targets: any[], grant: any, now: number, live: boolean, fetchImpl: any): Promise<any> {
  const retrievedAt = new Date(now).toISOString().slice(0, 10);
  let ledger: any = { version: 1, decisions: [], findings: {} };
  const findings: any[] = [];
  const egressDecisions: any[] = [];
  for (const t of targets) {
    // 1. VALIDATE+AUTHORIZE via canonical governor (deny-by-default, expiry, domain allowlist). No egress here.
    const gov = GOV.govern({ urls: [t.url], query: t.topic }, grant, now);
    egressDecisions.push({ url: t.url, decision: gov.decision, reasons: gov.reasons });
    if (gov.decision !== "ALLOW") { findings.push({ url: t.url, classification: "DENIED", reasons: gov.reasons }); continue; }
    if (!live) { findings.push({ url: t.url, classification: "AUTHORIZED_NOT_FETCHED", note: "govern=ALLOW; run with --live to fetch (sandbox egress)" }); continue; }
    // 2. REAL bounded fetch — the only egress point, grant-scoped allowlist, SSRF/size/redirect/content-type guards.
    let res: any;
    try { res = await fetchImpl(t.url, { allowlist: grant.allowedDomains, timeoutMs: 12000, maxBytes: 65536, maxRedirects: 0, contentTypes: ["text/plain", "text/html"], headers: { accept: "text/plain,text/html" } }); }
    catch (e: any) { res = { ok: false, code: "FETCH_THREW", detail: (e && e.message) || String(e) }; }
    if (!res.ok) { findings.push({ url: t.url, classification: "LIVE_UNAVAILABLE", code: res.code }); continue; }
    // 3. ASSESS + RECORD as LIVE_SOURCE with real provenance (anti-fabrication: stampFinding requires content+source+date).
    const claim = extractClaim(res.body, res.contentType || "");
    const nature = classifyNature(res.body);
    // D2: LIVE_SOURCE requires real fetch evidence — pass the actual httpStatus so stampFinding derives LIVE (not a bare flag).
    const stamp = GOV.stampFinding(claim, { url: t.url, date: retrievedAt, credibility: "HIGH", liveFetched: true, httpStatus: res.statusCode, sourceClass: "LIVE_SOURCE" });
    const sc = stamp.ok ? stamp.finding.sourceClass : "FIXTURE";
    const rec = { url: t.url, authority: t.authority, topic: t.topic, classification: sc, nature, httpStatus: res.statusCode, bytes: (res.body || "").length, claim, retrievedAt, confidence: stamp.ok ? stamp.finding.confidence : null, provenance: stamp.ok ? stamp.finding.provenance : null, untrusted: stamp.ok ? stamp.finding.untrusted : null, stamped: stamp.ok };
    findings.push(rec);
    if (stamp.ok) { const r = CYCLE.recordFinding(ledger, stamp.finding, retrievedAt); if (r && r.ledger) ledger = r.ledger; }
  }
  // PROPOSE (not authorize): each validated LIVE_SOURCE ⇒ a PROPOSED read-only audit mission (discovery ≠ authorization).
  const proposals = findings.filter((f) => f.classification === "LIVE_SOURCE").map((f) => ({
    kind: "MISSION_PROPOSAL", status: "PROPOSED", selfAuthored: false, grantsNoPermission: true,
    objective: "Read-only: compare ODG's capability against " + f.authority + " primary source (" + f.topic + ")",
    source: f.url, nature: f.nature, verifiableAcceptance: "an evidence-based gap report vs the cited source; no implementation authorized",
  }));
  return { findings, egressDecisions, ledger, proposals };
}

async function main() {
  const live = process.argv.includes("--live");
  const now = Date.now();
  // The scoped, expiring grant — the canonical representation of the owner's authorization (expires in 10 minutes) + a budget
  // (D3: a grant MUST be volume-bounded). Egress is bounded to the owner-named domains + 8 calls / 1MB.
  const grant = { authorized: true, allowedDomains: ALLOWED_DOMAINS, expiresMs: now + 10 * 60 * 1000, budget: { maxCalls: 8, maxBytes: 1_000_000 }, issuedBy: "owner (CTO V138 §4)", scope: "READ_ONLY_PUBLIC_RESEARCH" };
  const { findings, egressDecisions, ledger, proposals } = await runResearch(TARGETS, grant, now, live, HTTP.get);
  const LEDGER = require(path.join(ROOT, "runtime", "core", "research-ledger.js"));
  const liveCount = findings.filter((f: any) => f.classification === "LIVE_SOURCE").length;
  const out = {
    "//": "V138 live research — DISCOVER→VALIDATE→ASSESS→RECORD→PROPOSE→GOVERN over REAL primary sources under a canonical scoped+expiring+budgeted grant. bounded-http-client is the only egress; canonical ALLOWLIST unmutated (per-call allowlist). Discovery ≠ authorization.",
    mode: live ? "LIVE" : "DRY (govern-only; pass --live to fetch)",
    grant: { authorized: grant.authorized, allowedDomains: grant.allowedDomains, scope: grant.scope, issuedBy: grant.issuedBy, expiresInMin: 10, budget: grant.budget },
    egressDecisions, findings,
    classificationLegend: { LIVE_SOURCE: "really fetched this run (fetch-evidence-gated)", INTERNAL_EVIDENCE: "from the repo/ledger", FIXTURE: "test double", HYPOTHESIS: "unproven / quarantined claim" },
    ledgerSummary: LEDGER.summarize(ledger),
    summary: { targets: TARGETS.length, liveSources: liveCount, denied: findings.filter((f: any) => f.classification === "DENIED").length, unavailable: findings.filter((f: any) => f.classification === "LIVE_UNAVAILABLE").length, proposals: proposals.length },
    proposals,
    honesty: "LIVE_SOURCE findings were fetched this run via the canonical bounded egress under an owner-authorized scoped+expiring+budgeted grant; URLs/status/bytes are real and sourceClass is set from the runner's real bounded-http-client statusCode (res.ok===false ⇒ LIVE_UNAVAILABLE, never a fabricated LIVE). 'confidence: HIGH' denotes SOURCE-AUTHORITY trust (NASA/NIST/IETF primary standards bodies), NOT an independent content-credibility assessment. Injection screening is a best-effort known-pattern denylist (sanitizeExternal), not universal — finding.content is always treated as data. Nature (STANDARD/DRAFT) is classified from fetched content. No finding is promoted to fact; every proposal is PROPOSED (discovery ≠ authorization); no paid API; no credential.",
  };
  fs.writeFileSync(path.join(D, "V138_LIVE_RESEARCH.json"), JSON.stringify(out, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ mode: out.mode, summary: out.summary, natures: findings.filter((f: any) => f.classification === "LIVE_SOURCE").map((f: any) => f.authority + ":" + f.nature) }, null, 2) + "\n");
}
if (require.main === module) main().catch((e) => { process.stderr.write("V138 run error: " + ((e && e.message) || e) + "\n"); process.exit(1); });
module.exports = { runResearch, classifyNature, extractClaim, TARGETS, ALLOWED_DOMAINS };
export {};
