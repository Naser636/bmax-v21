#!/usr/bin/env node
"use strict";
/*
 * V15.8 §5 — feed the V158 Radar-admission research dossier into ODG's CANONICAL knowledge path
 * (odg-knowledge-acquisition.acquire → odg-claim-corroboration → odg-radar-source-provenance). No second store/engine.
 *
 * INPUT: docs/odg/evidence/V158_RADAR_ADMISSION_REFERENCES.json (27 references FETCHED and title-verified by a provider
 * research agent on 2026-11-23). The CLAIMS below are the design claims the admission gate relies on; each is attributed to
 * the references whose recorded `useful_contribution` states it (attribution done by the coordinating session — provider
 * judgement, recorded here so it can be audited). acquire() then decides, by INDEPENDENT host, what is FACT_CORROBORATED vs
 * CLAIM_SINGLE_SOURCE: several arXiv papers count as ONE host (not independent corroboration) — honest by construction.
 * OUTPUT: docs/odg/evidence/V158_DOSSIER_KNOWLEDGE.json (knowledge records + which admission rule each claim grounds).
 * Deterministic, no network. --check fails on drift.
 */
const fs = require("fs");
const path = require("path");
const K = require("../core/odg-knowledge-acquisition.js");

const ROOT = path.resolve(__dirname, "..", "..");
const REFS = path.join(ROOT, "docs", "odg", "evidence", "V158_RADAR_ADMISSION_REFERENCES.json");
const OUT = path.join(ROOT, "docs", "odg", "evidence", "V158_DOSSIER_KNOWLEDGE.json");
const AS_OF = Date.UTC(2026, 10, 23);

// claim → { type, refs (ids whose recorded contribution states it), grounds (admission rule it justifies) }
const CLAIMS = Object.freeze([
  { text: "content retrieved from the web can act as instructions to an LLM agent (indirect prompt injection) and must be treated as untrusted data", type: "FACT", refs: ["A1", "A3", "C3", "C4", "E1", "E3"], grounds: "stampFinding/sanitizeExternal: retrieved content = untrusted data; never instructions" },
  { text: "model-level prompt-injection defenses alone do not eliminate the risk; system-level controls on what the agent may fetch and do are required", type: "FACT", refs: ["A4", "A5", "B3", "E2"], grounds: "the GRANT (exact hosts + prefixes), not retrieved content, fixes what is fetched" },
  { text: "egress for automated clients should be allowlist-first with internal and private addresses blocked", type: "FACT", refs: ["C2", "D1", "D2"], grounds: "validHost refuses IP literals, localhost/.local/.internal; hostMatch EXACT" },
  { text: "redirect following should be disabled for allowlisted outbound requests to prevent server-side request forgery", type: "RECOMMENDATION", refs: ["C2"], grounds: "OFF_HOST redirect on a prefix ⇒ REFUSE; same-host redirect ⇒ non-canonical prefix ⇒ DEFER (transport blocks redirects)" },
  { text: "a robots.txt 4xx response allows access while an unreachable or 5xx robots.txt must be treated as complete disallow", type: "FACT", refs: ["C1"], grounds: "NO_ROBOTS_4XX ⇒ allow; UNREACHABLE_5XX ⇒ DEFER" },
  { text: "robots.txt is not a form of access authorization", type: "FACT", refs: ["C1"], grounds: "robots ALLOW is necessary, never sufficient: terms + access type + flags still required" },
  { text: "the unauthenticated GitHub REST API primary rate limit is 60 requests per hour", type: "FACT", refs: ["E4"], grounds: "api.github.com DEFERRED: 60/h < 4 × per-run budget and no per-host cumulative cap" },
  { text: "the arXiv API terms ask for no more than one request every three seconds on a single connection", type: "FACT", refs: ["E5"], grounds: "export.arxiv.org: terms vs robots Disallow contradiction ⇒ REFUSE/owner decision; per-host pacing absent" },
  { text: "the Crossref public pool limits queries to one request per second with concurrency one", type: "FACT", refs: ["E6"], grounds: "api.crossref.org DEFERRED: per-second/concurrency limits not enforceable without per-host pacing" },
]);

function main(): number {
  let doc: any;
  try { doc = JSON.parse(fs.readFileSync(REFS, "utf8")); } catch (e: any) { process.stderr.write(`references unreadable: ${e && e.message}\n`); return 2; }
  const refs: any[] = Array.isArray(doc && doc.references) ? doc.references : [];
  const byId: any = {}; for (const r of refs) if (r && typeof r.id === "string") byId[r.id] = r;
  const missing: string[] = [];
  // one acquire() "source" per REFERENCE (url), carrying every claim attributed to it
  const sources: any[] = [];
  for (const r of refs) {
    const claims = CLAIMS.filter((c) => c.refs.includes(r.id)).map((c) => ({ text: c.text, type: c.type, stance: "SUPPORTS" }));
    if (!claims.length) continue;
    const verified = typeof r.verification === "string" ? !/not\s+(fetched|verified)/i.test(r.verification) : true;
    sources.push({ url: r.url, status: verified ? "RETRIEVED" : "INACCESSIBLE", consultedDate: r.accessed || "2026-11-23", publishedDate: r.published || undefined, claims });
  }
  for (const c of CLAIMS) for (const id of c.refs) if (!byId[id]) missing.push(`${id} (claim: ${c.text.slice(0, 40)}…)`);
  if (missing.length) { process.stderr.write(`attributed reference ids missing from the dossier: ${missing.join("; ")}\n`); return 2; }
  const res = K.acquire({ query: "governed source admission and safe automated retrieval for an autonomous engineering agent", capability: "Radar source admission (runtime/core/odg-radar-source-admission.ts)", sources, asOfEpochMs: AS_OF });
  const grounds: any = {}; for (const c of CLAIMS) grounds[c.text.trim().toLowerCase()] = { attributedRefs: c.refs, grounds: c.grounds };
  const out = {
    generatedBy: "runtime/bin/odg-v158-dossier-knowledge-run.ts via odg-knowledge-acquisition.acquire (canonical; deterministic; no network)",
    asOf: "2026-11-23",
    referencesFile: "docs/odg/evidence/V158_RADAR_ADMISSION_REFERENCES.json",
    referencesTotal: refs.length,
    referencesUsedAsEvidence: sources.length,
    summary: { claims: res.knowledge.length, verifiedKnowledge: res.verifiedCount, byClassification: res.knowledge.reduce((a: any, k: any) => { a[k.classification] = (a[k.classification] || 0) + 1; return a; }, {}) },
    knowledge: res.knowledge.map((k: any) => ({ ...k, ...grounds[String(k.claim).trim().toLowerCase()] })),
    honesty: [
      "claim→reference attribution is the coordinating session's judgement from each reference's recorded contribution (provider work, auditable here)",
      "independence is by HOST: several arXiv papers are one host and do not corroborate each other",
      "FACT_CORROBORATED is still a model conclusion over fetched pages, not an absolute fact; single-source claims are NOT verified knowledge",
    ],
  };
  const text = JSON.stringify(out, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    let cur = ""; try { cur = fs.readFileSync(OUT, "utf8"); } catch { cur = ""; }
    process.stdout.write(cur === text ? "CHECK OK\n" : "CHECK FAILED — knowledge evidence drifts from a fresh derivation\n");
    return cur === text ? 0 : 1;
  }
  if (!process.argv.includes("--no-write")) fs.writeFileSync(OUT, text);
  process.stdout.write(JSON.stringify(out.summary) + "\n");
  return 0;
}
process.exitCode = main();
export {};
