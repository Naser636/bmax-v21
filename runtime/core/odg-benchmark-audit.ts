#!/usr/bin/env node
"use strict";

/*
 * V243 §8 (CM-BENCHMARK-AUDIT) — WORLD-BENCHMARK AUDIT. PURE, deterministic, FAIL-CLOSED. Audits the external world
 * benchmarks named in the roadmap (BrowseComp / GDPval / τ-bench / WebArena / OSWorld / METR / SciAgentArena / SWE-bench
 * Pro) on the AUDIT axes the directive requires — capability measured, availability, licence, local reproducibility,
 * ODG-compatibility — WITHOUT inventing a score or a ranking. It is NOT a second benchmark harness (benchmark-factory /
 * metier-benchmark-suite / excellence-benchmark stay the internal evaluators); it is the missing EXTERNAL-reference
 * qualification lens those lacked. It REUSES odg-source-authority to tag each benchmark's source owner.
 *
 * HARD HONESTY INVARIANTS (encoded + tested):
 *   - NEVER emits a numeric score for any benchmark (there is no score field; auditing ≠ running).
 *   - NEVER ranks benchmarks and NEVER compares results across different models/tools/budgets/protocols — compareResults
 *     returns INVALID_INCOMPARABLE unless the full protocol tuple is identical (which this audit never asserts).
 *   - availability / licence / reproducibility are VERIFIED only when FACT_CORROBORATED by real cited sources; otherwise
 *     INSUFFICIENT_EVIDENCE (fail-closed — absence is never turned into a positive claim).
 *   - USABLE_AS_REFERENCE requires freely-accessible AND licence-permits AND corroborated; else AUDIT_ONLY / INSUFFICIENT.
 * asOf 2026-11-16; corroboration from authorized WebSearch on that date. Dual export.
 */

const SA = require("./odg-source-authority.js");   // authority(url) — tag each benchmark's source owner (reuse, no new registry)

const AVAILABILITY = Object.freeze(["FREELY_ACCESSIBLE", "UNVERIFIED"]);
const CORROBORATION = Object.freeze(["FACT_CORROBORATED", "INSUFFICIENT_EVIDENCE"]);
const VERDICT = Object.freeze(["USABLE_AS_REFERENCE", "AUDIT_ONLY", "INSUFFICIENT_EVIDENCE"]);

// capability text comes from the roadmap/directive table (owner-provided ⇒ canonical, not fabricated).
// availability/licence are VERIFIED only where corroborated by real cited sources (2026-11-16); others INSUFFICIENT.
const BENCHMARKS = Object.freeze([
  { id: "swe-bench", name: "SWE-bench (Pro)", capability: "Resolve real software-engineering issues", source: "https://github.com/SWE-bench/SWE-bench",
    availability: "FREELY_ACCESSIBLE", licence: "MIT", licencePermitsUse: true, locallyReproducible: "VERIFIED", corroboration: "FACT_CORROBORATED",
    note: "MIT, public repo + LICENSE; de-facto SWE agent standard. (Pro variant / contamination caveats still apply.)" },
  { id: "osworld", name: "OSWorld", capability: "Computer-use tasks in a real OS environment",
    source: "https://github.com/xlang-ai/OSWorld", availability: "FREELY_ACCESSIBLE", licence: "APACHE_2_0", licencePermitsUse: true, locallyReproducible: "VERIFIED", corroboration: "FACT_CORROBORATED",
    note: "Apache-2.0, NeurIPS 2024, 369 tasks, runnable locally (VMware/VirtualBox/Docker)." },
  { id: "tau-bench", name: "τ-bench", capability: "Tool-agent-user interaction under domain policy",
    source: "https://github.com/sierra-research/tau-bench", availability: "FREELY_ACCESSIBLE", licence: "MIT", licencePermitsUse: true, locallyReproducible: "UNVERIFIED", corroboration: "FACT_CORROBORATED",
    note: "MIT, Sierra; simulated user+API. Local-reproducibility not independently re-run here ⇒ UNVERIFIED." },
  // Not corroborated this cycle ⇒ fail-closed INSUFFICIENT (NOT fabricated as available/licensed).
  { id: "browsecomp", name: "BrowseComp", capability: "Find hard-to-discover information on the web", source: null,
    availability: "UNVERIFIED", licence: "UNVERIFIED", licencePermitsUse: null, locallyReproducible: "UNVERIFIED", corroboration: "INSUFFICIENT_EVIDENCE", note: "availability/licence not corroborated this cycle" },
  { id: "gdpval", name: "GDPval", capability: "Produce professional deliverables across occupations", source: null,
    availability: "UNVERIFIED", licence: "UNVERIFIED", licencePermitsUse: null, locallyReproducible: "UNVERIFIED", corroboration: "INSUFFICIENT_EVIDENCE", note: "availability/licence not corroborated this cycle" },
  { id: "webarena", name: "WebArena", capability: "Long-horizon web navigation tasks", source: null,
    availability: "UNVERIFIED", licence: "UNVERIFIED", licencePermitsUse: null, locallyReproducible: "UNVERIFIED", corroboration: "INSUFFICIENT_EVIDENCE", note: "availability/licence not corroborated this cycle" },
  { id: "metr", name: "METR (task-duration/reliability)", capability: "Duration + reliability of tasks an agent can do", source: null,
    availability: "UNVERIFIED", licence: "UNVERIFIED", licencePermitsUse: null, locallyReproducible: "UNVERIFIED", corroboration: "INSUFFICIENT_EVIDENCE", note: "availability/licence not corroborated this cycle" },
  { id: "sciagentarena", name: "SciAgentArena", capability: "Interactive scientific tasks", source: null,
    availability: "UNVERIFIED", licence: "UNVERIFIED", licencePermitsUse: null, locallyReproducible: "UNVERIFIED", corroboration: "INSUFFICIENT_EVIDENCE", note: "availability/licence not corroborated this cycle" },
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// sourceOwner: prefer source-authority's registered owner; for a code-host URL (github.com/<org>/...) fall back to the
// repo org path segment so the owner tag is MEANINGFUL (not null just because the generic host is unregistered).
function sourceOwnerOf(url: any): string | null {
  if (typeof url !== "string" || !url) return null;
  const reg = SA.authority(url);
  if (reg && typeof reg.owner === "string" && reg.owner) return reg.owner;
  const m = url.match(/^https?:\/\/github\.com\/([^/]+)\//i);
  return m ? m[1] : (SA.host(url) || null);
}

// per-benchmark verdict — fail-closed.
function verdictOf(b: any): string {
  if (b.corroboration !== "FACT_CORROBORATED") return "INSUFFICIENT_EVIDENCE";
  if (b.availability === "FREELY_ACCESSIBLE" && b.licencePermitsUse === true) return "USABLE_AS_REFERENCE";
  return "AUDIT_ONLY";
}

/* audit() -> the fail-closed audit matrix + honesty summary. Deterministic. Emits NO score, NO ranking. */
function audit(): any {
  const rows = BENCHMARKS.map((b) => Object.freeze({
    id: b.id, name: b.name, capability: b.capability,
    sourceOwner: sourceOwnerOf(b.source),
    availability: b.availability, licence: b.licence, licencePermitsUse: b.licencePermitsUse,
    locallyReproducible: b.locallyReproducible, corroboration: b.corroboration,
    verdict: verdictOf(b), note: b.note,
    hasScore: false, // INVARIANT: an audit never carries a score (auditing ≠ running the benchmark)
  }));
  const count = (v: string) => rows.filter((r) => r.verdict === v).length;
  return Object.freeze({
    asOf: "2026-11-16", total: rows.length, benchmarks: Object.freeze(rows),
    usableAsReference: count("USABLE_AS_REFERENCE"), auditOnly: count("AUDIT_ONLY"), insufficient: count("INSUFFICIENT_EVIDENCE"),
    anyScoreEmitted: rows.some((r) => r.hasScore),  // must be false
    note: "AUDIT ONLY — benchmarks qualified on availability/licence/reproducibility/compatibility; NO score run, NO ranking; unverified availability/licence ⇒ INSUFFICIENT (fail-closed). Published external results are NOT comparable across differing models/tools/budgets.",
  });
}

/* compareResults(a, b) -> never a ranking: incomparable unless the FULL protocol tuple is identical (this audit never asserts that). */
function compareResults(a: any, b: any): any {
  const same = isObj(a) && isObj(b) && a.model === b.model && a.tools === b.tools && a.budget === b.budget && a.protocol === b.protocol && a.benchmarkVersion === b.benchmarkVersion;
  return Object.freeze({ comparable: same === true, verdict: same === true ? "COMPARABLE_SAME_PROTOCOL" : "INVALID_INCOMPARABLE",
    reason: same === true ? "identical model/tools/budget/protocol/version" : "different (or unknown) model/tools/budget/protocol/version ⇒ a cross-run comparison would be meaningless (no ranking emitted)" });
}

function demonstrate(): any { return audit(); }

const BENCHMARK_AUDIT_CONTRACT = Object.freeze({
  id: "V243-BENCHMARK-AUDIT",
  purpose: "§8 CM-BENCHMARK-AUDIT — audit external world benchmarks on availability/licence/reproducibility/compatibility; NO score, NO ranking; fail-closed",
  invariants: Object.freeze([
    "NEVER emits a numeric score and NEVER ranks benchmarks (auditing ≠ running); compareResults is INVALID_INCOMPARABLE across differing protocols",
    "availability/licence/reproducibility VERIFIED only when FACT_CORROBORATED by real cited sources; else INSUFFICIENT_EVIDENCE (fail-closed)",
    "USABLE_AS_REFERENCE requires freely-accessible AND licence-permits AND corroborated; reuses odg-source-authority; no second benchmark harness, no 10th primitive",
    "capability text is the owner-provided roadmap table (canonical, not fabricated); corroborated this cycle: SWE-bench (MIT), OSWorld (Apache-2.0), τ-bench (MIT)",
  ]),
});

module.exports = { BENCHMARKS, audit, compareResults, demonstrate, VERDICT, BENCHMARK_AUDIT_CONTRACT };
export {};
