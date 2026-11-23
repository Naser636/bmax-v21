#!/usr/bin/env node
"use strict";
/* V15.9 §10 — assess the V158 Radar collection (docs/odg/evidence/V158_RADAR_COLLECTION.json) with the CANONICAL knowledge
 * path (odg-knowledge-intelligence.attestCollection → assessClaim → toMemory / admissible / usableFor). Modelled on
 * runtime/bin/odg-knowledge-intelligence-run.ts. OFFLINE, deterministic (no network, no new collection: reuse before re-collect).
 * Structured keys below are AUTHORED from the recorded quotes (not model-inferred); a cycle without an authored key is still
 * assessed (it simply cannot ground — honest UNKNOWN). Usage: [--write] | [--check] (exit 1 on drift). */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const K = require("../core/odg-knowledge-intelligence.js");
const FR = require("../core/frontier-radar.js");

const COLLECTION_PATH = "docs/odg/evidence/V158_RADAR_COLLECTION.json";
const REGISTRY_PATH = "docs/odg/evidence/COLLECTION_REGISTRY.json";
const OUT_PATH = "docs/odg/evidence/V158_KNOWLEDGE_ASSESSMENT.json";
const FRESHNESS_DAYS: Record<string, number> = { "registry.npmjs.org": 7 };   // time-sensitive hosts (release metadata)

// keys AUTHORED from the recorded quotes (pattern id → key). VALUE must be a contiguous phrase of the citation, SUBJECT words
// in the citation or the recorded page title (grounding enforced by assessClaim). Relations from K.RELATIONS only.
const STRUCT: Record<string, any> = {
  PG_ADVISORY_DEF: { subject: "PostgreSQL", relation: "states", value: "creating locks that have application-defined meanings", scope: "PostgreSQL current docs §13.3", qualifiers: ["the label 'advisory locks' is in the NEXT sentence of the page, not in this recorded quote"] },
  PG_ADVISORY_LEVELS: { subject: "advisory lock", relation: "states", value: "at session level or at transaction level", scope: "PostgreSQL current docs §13.3", qualifiers: [] },
  PG_LOCK_MODES: { subject: "PostgreSQL lock modes", relation: "states", value: "lock modes to control concurrent access to data in tables", scope: "PostgreSQL current docs §13.3", qualifiers: [] },
  PG_DEADLOCK: { subject: "PostgreSQL", relation: "states", value: "automatically detects deadlock situations and resolves them by aborting one of the transactions involved", scope: "PostgreSQL current docs §13.3", qualifiers: ["same quote: which transaction is aborted is difficult to predict and should not be relied upon"] },
  CC_NET_PROXY: { subject: "socat", relation: "states", value: "route network traffic through the sandbox proxy", scope: "Claude Code sandboxing doc — Linux dependency line", qualifiers: ["dependency-list line: states the relay's role, not the full egress policy"] },
  CC_NET_DOMAINS: { subject: "commands", relation: "states", value: "which files and network domains those commands can reach", scope: "Claude Code sandboxed Bash tool", qualifiers: ["applies to Bash, PowerShell and Monitor commands and their child processes (same quote)"] },
  CC_OS_PRIMITIVES: { subject: "macOS sandboxing", relation: "states", value: "uses the built-in Seatbelt framework", scope: "Claude Code sandbox on macOS", qualifiers: ["Linux primitive not in the recorded quotes"] },
  CC_FS_WRITE: { subject: "Protected paths", relation: "states", value: "stay write-denied", scope: "Claude Code sandbox settings table", qualifiers: ["table-row fragment: the row's other columns are not recorded"] },
  NIST_TAXONOMY: { subject: "AI 100-2 E2025", relation: "is described as", value: "a taxonomy and terminology of attacks and mitigations", scope: "NIST AI 100-2 E2025 publication page (title)", version: "E2025", qualifiers: ["quote is the page TITLE; indirect prompt injection definition NOT on the landing page"] },
  NIST_TERMINOLOGY: { subject: "Adversarial Machine Learning", relation: "is described as", value: "terminology of attacks and mitigations", scope: "NIST AI 100-2 E2025 publication page (heading)", version: "E2025", qualifiers: ["heading text; duplicates the title"] },
  NIST_ATTACK_CLASSES: { subject: "attack taxonomy", relation: "states", value: "data poisoning; evasion", scope: "NIST AI 100-2 E2025 keyword list", version: "E2025", qualifiers: ["keyword list, not a definition"] },
  SQLITE_WAL: { subject: "Write-Ahead Log (WAL) Mode", relation: "states", value: "offers more concurrency and is often faster than the default rollback transactions", scope: "SQLite documentation index entry", qualifiers: ["index summary line, not the WAL document itself"] },
  SQLITE_ATOMIC: { subject: "SQLite", relation: "states", value: "implements transactions with atomic commit, even in the face of power failures", scope: "SQLite documentation index entry", qualifiers: ["index summary line"] },
  SQLITE_LOCKING: { subject: "locking code in version 3", relation: "states", value: "increases concurrency and decreases the problem of writer starvation", scope: "SQLite documentation index entry (SQLite version 3)", qualifiers: ["index summary line"] },
  // SQLITE_ISOLATION: the recorded quote is a QUESTION, not an assertion ⇒ no key authored (cannot ground; reported honestly).
};

function patternOf(query: string): string { const m = String(query).match(/::\s*([A-Z_]+)$/); return m ? m[1] : ""; }
function hostOf(u: string): string { try { return new URL(u).hostname; } catch { return ""; } }

/** derive(col, registry): PURE re-derivation of the assessment from the committed collection. */
function derive(col: any, registry: any): any {
  const asOf = Date.parse(col.consultedDate + "T12:00:00Z");
  if (!Number.isFinite(asOf)) throw new Error("collection consultedDate missing/invalid");
  const pins = (registry.collections || []).filter((c: any) => c.path === COLLECTION_PATH).map((c: any) => c.sha256);
  const collection = K.attestCollection(col, { pinnedDigests: pins });
  if (!collection.attested) throw new Error("collection not authenticated (digest not pinned in COLLECTION_REGISTRY.json)");
  const quarantined = col.sources.filter((s: any) => s.status === "RETRIEVED" && FR.sanitizeExternal({ title: s.title, body: (s.quotes || []).join("\n") }).untrusted).map((s: any) => s.url);
  const results = col.cycles.map((cy: any) => {
    const pid = patternOf(cy.query); const st = STRUCT[pid] || null;
    const a = K.assessClaim({ ...(st || {}), nature: "OFFICIAL_DOCUMENTATION", text: cy.claim, sources: (cy.support || []).map((sp: any) => ({ url: sp.url, citation: sp.quote, structured: st })) },
      { asOfEpochMs: asOf, collection, quarantined, missionAuthorization: "DESIGN_PROPOSAL" });
    const mem = K.toMemory(a, asOf);
    const host = hostOf((cy.support || [])[0] && cy.support[0].url);
    const fd = FRESHNESS_DAYS[host];
    return { query: cy.query, question: cy.question, claim: cy.claim, keyAuthored: !!st, structured: st ? a.structured : null, dimensions: a.dimensions, isFact: a.isFact,
      independentFamilies: a.independentFamilies,
      sources: a.sources.map((s: any) => ({ url: s.url, citationVerified: s.citationVerified, keyGrounded: s.keyGrounded, publisherKnown: s.identity.known, organization: s.identity.organization })),
      consultedDate: col.consultedDate, freshness: fd ? { timeSensitive: true, staleAfter: new Date(asOf + fd * 86400000).toISOString().slice(0, 10) } : { timeSensitive: false },
      memory: { status: mem.status, retention: mem.retention, admittedAsFactByTrustGate: K.admissible(mem, asOf, { assessment: a }).trusted, usableForDesign: K.usableFor(mem, "DESIGN_PROPOSAL", asOf, { assessment: a }).authorization, usableForIntegrationRequest: K.usableFor(mem, "INTERNAL_INTEGRATION", asOf, { assessment: a }).authorization },
      reasons: a.reasons };
  });
  const count = (k: string) => results.filter((r: any) => r.dimensions.epistemic === k).length;
  // pre-registered questions the collection did NOT answer (no quote matched) — never filled in.
  const unanswered: any[] = [];
  for (const s of col.sources) for (const id of (s.unmatchedPatterns || [])) unanswered.push({ url: s.url, patternId: id, status: "NOT_MEASURED (no pre-registered pattern matched the fetched page)" });
  const timeSensitive = col.sources.filter((s: any) => FRESHNESS_DAYS[hostOf(s.url)]).map((s: any) => ({ url: s.url, consultedDate: col.consultedDate, quotes: (s.quotes || []).length, value: (s.quotes || []).length ? "see quotes" : "NOT_MEASURED", staleAfterDays: FRESHNESS_DAYS[hostOf(s.url)] }));
  return {
    lot: "V15.9 §10 — V158 Radar collection → canonical knowledge assessment (KI-V2 four dimensions)",
    input: COLLECTION_PATH + " (no new network call)",
    collectionAuthenticated: collection.via, collectionSha256: collection.sha256, consultedDate: col.consultedDate,
    summary: { claims: results.length, keysAuthored: results.filter((r: any) => r.keyAuthored).length, CORROBORATED: count("CORROBORATED"), SUPPORTED: count("SUPPORTED"), CANDIDATE: count("CANDIDATE"), UNKNOWN: count("UNKNOWN"),
      citationsVerified: results.filter((r: any) => r.sources.some((s: any) => s.citationVerified)).length, keptInMemory: results.filter((r: any) => r.memory.retention === "KEPT").length,
      admittedAsFact: results.filter((r: any) => r.memory.admittedAsFactByTrustGate).length, presentedAsFact: results.filter((r: any) => r.isFact).length, unansweredQuestions: unanswered.length },
    crossFamilyOverlap: K.crossFamilyOverlap(col),
    unanswered, timeSensitive, results,
    limits: [
      "the 5 V158 hosts are NOT in odg-knowledge-intelligence PUBLISHERS ⇒ publisher identity UNKNOWN ⇒ no claim can reach SUPPORTED (official-primary) — extending that explicit map is a separate reviewed change",
      "every claim is SINGLE-SOURCE (one page) ⇒ never CORROBORATED; claims bind to WHAT THE PAGE STATES, not to a general truth",
      "structured keys authored by the provider from the recorded quotes, not model-inferred; quotes from a deterministic pattern extractor, verbatim w.r.t. the documented normalisation",
      "knowledge usefulness for ODG is NOT_MEASURED until a mission applies it",
    ],
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const col = JSON.parse(fs.readFileSync(path.join(ROOT, COLLECTION_PATH), "utf8"));
  const registry = JSON.parse(fs.readFileSync(path.join(ROOT, REGISTRY_PATH), "utf8"));
  const ev = derive(col, registry);
  const json = JSON.stringify(ev, null, 2) + "\n";
  if (argv.includes("--check")) {
    const cur = fs.existsSync(path.join(ROOT, OUT_PATH)) ? fs.readFileSync(path.join(ROOT, OUT_PATH), "utf8") : null;
    if (cur !== json) { process.stderr.write("DRIFT: " + OUT_PATH + " does not re-derive from the committed collection\n"); process.exit(1); }
    process.stdout.write("OK: " + OUT_PATH + " re-derives from " + COLLECTION_PATH + "\n"); return;
  }
  if (argv.includes("--write")) fs.writeFileSync(path.join(ROOT, OUT_PATH), json);
  process.stdout.write(JSON.stringify(ev.summary) + "\n" + ev.results.map((r: any) => `${r.dimensions.epistemic.padEnd(12)} grounded=${r.sources.some((s: any) => s.keyGrounded)} mem=${r.memory.status} ${r.query}`).join("\n") + "\n");
}
if (require.main === module) main();
module.exports = { derive, STRUCT, COLLECTION_PATH, REGISTRY_PATH, OUT_PATH };
export {};
