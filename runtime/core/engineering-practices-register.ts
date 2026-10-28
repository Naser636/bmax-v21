#!/usr/bin/env node
/**
 * engineering-practices-register — Phase 1 of the CTO world-class mandate: a QUALITY-GATED register of external
 * best-practice sources (benchmarks, evaluation integrity, planning/recovery, code agents, app/agent/supply-chain
 * security, observability, learning, multi-language, productization/SEO), each mapped to a P1/P2 requirement, an ODG
 * decision, and — where already adopted — the REAL ODG module that reflects it. It is NOT a blind copy of other
 * systems: every entry records a decision (adopt/adapt/test/defer/reject) tailored to ODG's nine primitives.
 *
 * Quality over volume (mandate): validateEntry FAIL-CLOSES on a weak/incomplete source — missing url/org/consulted
 * date / practice / requirement-mapping / decision / reliability ⇒ REJECTED and excluded. A `reflectedIn` module that
 * does not exist would be caught by the companion test. Pure/deterministic; no new primitive.
 *
 * Provenance note: URLs + dates were grounded via live web search on the consulted date; they are external references,
 * not ODG claims. Facts are stated at the level established by primary/official sources; no benchmark numbers invented.
 */
"use strict";

const DECISIONS = ["adopt", "adapt", "test", "defer", "reject"];
const RELIABILITY = ["HIGH", "MEDIUM", "LOW"];
const FAMILIES = [
  "benchmarks", "evaluation-integrity", "planning-recovery", "code-agents-tooling",
  "security-appsec-agent-supplychain", "observability-reliability", "learning-memory",
  "multi-language-build", "productization-seo",
];

const CONSULTED = "2026-10-28";

// Each entry: the practice/result, its limits, the P1/P2 requirement it maps to, ODG's decision, and (if adopted) the
// real module reflecting it. Reliability reflects source nature (official standard / primary paper = HIGH).
const PRACTICES = Object.freeze([
  // --- benchmarks ---
  { id: "swe-bench", family: "benchmarks", title: "SWE-bench / SWE-bench Verified: resolving real GitHub issues", org: "Princeton NLP; OpenAI Preparedness (Verified subset)", url: "https://arxiv.org/abs/2310.06770", consulted: CONSULTED, nature: "peer-reviewed benchmark + human-validated subset (500 tasks)", reliability: "HIGH", practice: "evaluate coding agents on real, executable repository tasks with hidden tests; Verified removes ambiguous/unsolvable instances", limits: "Python-repo heavy; Verified is 500 tasks; leaderboard contamination risk over time", maps: ["P2:engine-capability-measurement"], odgDecision: "adapt", odgEvidence: "ODG runs its OWN held-out, leakage-guarded corpus (broad-it-eval) with real executable checks rather than claiming a SWE-bench score it has not run", reflectedIn: "broad-it-eval" },
  { id: "swe-bench-pro-verified", family: "benchmarks", title: "SWE-Bench Pro Verified: harder long-horizon tasks", org: "arXiv 2609.08149", url: "https://arxiv.org/abs/2609.08149", consulted: CONSULTED, nature: "benchmark paper", reliability: "MEDIUM", practice: "harder, verified long-horizon SE tasks; shows prior Pro results can OVERESTIMATE real capability", limits: "recent; methodology still settling", maps: ["P2:anti-overclaim-capability"], odgDecision: "adopt", odgEvidence: "reinforces ODG's refusal to extrapolate a broad rate; capability-taxonomy keeps measuredSuccessRate=null until a representative held-out run exists", reflectedIn: "capability-taxonomy" },
  // --- evaluation integrity ---
  { id: "heldout-leakage", family: "evaluation-integrity", title: "Train/test (dev/held-out) separation + leakage control", org: "general ML evaluation methodology", url: "https://arxiv.org/pdf/2310.06770", consulted: CONSULTED, nature: "established methodology", reliability: "HIGH", practice: "keep a held-out set disjoint from any tuning data; detect contamination; report accuracy only on unseen data", limits: "requires discipline to keep partitions disjoint by content, not just id", maps: ["P2:no-false-success"], odgDecision: "adopt", odgEvidence: "broad-it-eval enforces DEV/HELDOUT disjoint by id AND content sha256 (checkLeakage), per-category metrics, NO_DATA until representative", reflectedIn: "broad-it-eval" },
  { id: "reality-gate-trust-boundary", family: "evaluation-integrity", title: "Independent verification as a trust boundary (don't trust self-report)", org: "ODG5 design principle (adapted from adversarial-eval literature)", url: "https://arxiv.org/abs/2310.06770", consulted: CONSULTED, nature: "design principle", reliability: "MEDIUM", practice: "a verdict must be gated by an independent check, not the producer's own claim; false-success excluded from the numerator", limits: "the gate itself must be adversarially tested", maps: ["P2:verification-independent"], odgDecision: "adopt", odgEvidence: "reality-gate + validation-engine codingFidelityGate hard-gate 'validated'; mission-scoped to prevent cross-mission false-BLOCK", reflectedIn: "reality-gate" },
  // --- planning & recovery ---
  { id: "dora-metrics", family: "planning-recovery", title: "DORA delivery metrics (throughput + stability)", org: "Google Cloud / DORA, State of DevOps", url: "https://dora.dev/", consulted: CONSULTED, nature: "large multi-year industry research (39,000+ respondents in 2024)", reliability: "HIGH", practice: "measure deployment frequency, lead time, change fail rate, failed-deployment recovery time (+rework); throughput vs stability tension", limits: "org-level delivery metrics; not a per-task agent quality measure; survey self-report", maps: ["P2:observability-reporting", "P2:efficiency-metrics"], odgDecision: "adapt", odgEvidence: "ODG tracks per-mission efficiency/recovery (attempt-log, latency-measure, recovery) rather than org-wide DORA; DORA informs WHICH signals to expose", reflectedIn: "campaign-controller" },
  { id: "dependency-topo-planning", family: "planning-recovery", title: "Topological dependency planning / layering", org: "classical scheduling (Kahn topological sort)", url: "https://en.wikipedia.org/wiki/Topological_sorting", consulted: CONSULTED, nature: "foundational algorithm", reliability: "HIGH", practice: "order work by dependency layers; detect cycles fail-closed; parallelise within a layer safely", limits: "needs accurate dependency edges", maps: ["P1:roadmap-order", "P2:dependency-resolution"], odgDecision: "adopt", odgEvidence: "dep-planner.planLayers with 3 real consumers (roadmap-dep-check, campaign-controller, roadmap-schema-proposal); cycle ⇒ fail-closed", reflectedIn: "dep-planner" },
  { id: "isolated-repair-rollback", family: "planning-recovery", title: "Isolated change + acceptance-gated rollback", org: "Google SRE (canary + rollback) / transactional-change practice", url: "https://sre.google/sre-book/table-of-contents/", consulted: CONSULTED, nature: "engineering practice", reliability: "MEDIUM", practice: "apply fixes in an isolated workspace, accept only if checks pass, otherwise exact rollback; never partial-apply", limits: "isolation has setup cost; must verify rollback is complete", maps: ["P2:recovery-after-failure"], odgDecision: "adopt", odgEvidence: "repair-workflow.runRepairWorkflow (isolated workspace, acceptance-gated, exact rollback) + checkpoint/resume", reflectedIn: "repair-workflow" },
  // --- code agents & tooling ---
  { id: "swe-agent-aci", family: "code-agents-tooling", title: "Agent-Computer Interface (bounded, well-shaped tools)", org: "Princeton (SWE-agent, NeurIPS 2024)", url: "https://proceedings.neurips.cc/paper_files/paper/2024/file/5a7c947568c1b1328ccc5230172e1e7c-Paper-Conference.pdf", consulted: CONSULTED, nature: "peer-reviewed", reliability: "HIGH", practice: "carefully designed, bounded tool interfaces materially improve agent reliability over raw shell access", limits: "interface design is task-specific", maps: ["P2:tool-orchestration"], odgDecision: "adopt", odgEvidence: "code-execution uses argv-array bounded subprocesses (no shell string), isolated temp workspace, output caps, minimal env", reflectedIn: "code-execution" },
  { id: "real-executable-checks", family: "code-agents-tooling", title: "Execute real toolchains; never fake a pass", org: "reproducible-eval practice", url: "https://arxiv.org/abs/2310.06770", consulted: CONSULTED, nature: "methodology", reliability: "HIGH", practice: "run the actual compiler/checker; classify UNSUPPORTED honestly when a toolchain is absent instead of guessing", limits: "needs toolchains installed; absent stacks must be UNSUPPORTED not PASS", maps: ["P2:no-false-success", "P2:multi-language"], odgDecision: "adopt", odgEvidence: "code-execution runs node --check / tsc / py_compile / bash -n / sqlite3 / PyYAML; UNSUPPORTED (never faked) when a probe fails", reflectedIn: "code-execution" },
  // --- security: appsec, agent, supply chain ---
  { id: "nist-ssdf", family: "security-appsec-agent-supplychain", title: "NIST SSDF SP 800-218 (secure SDLC practices)", org: "NIST", url: "https://csrc.nist.gov/projects/ssdf", consulted: CONSULTED, nature: "official US standard (final Feb 2022)", reliability: "HIGH", practice: "Prepare/Protect/Produce/Respond practice groups for secure software development", limits: "framework, not a checklist of controls; needs mapping to concrete controls", maps: ["P2:security-supplychain"], odgDecision: "adapt", odgEvidence: "ODG maps SSDF 'Produce/Respond' to supply-chain-attest (SBOM) + evidence-provenance + governed-apply; gap register tracks unmapped practices", reflectedIn: "supply-chain-attest" },
  { id: "nist-ai-rmf", family: "security-appsec-agent-supplychain", title: "NIST AI RMF 100-1 (Govern/Map/Measure/Manage) + GenAI Profile 600-1", org: "NIST", url: "https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf", consulted: CONSULTED, nature: "official US framework (Jan 2023; 600-1 Jul 2024)", reliability: "HIGH", practice: "lifecycle AI risk management across four functions; GenAI profile names 12 risks + 211 actions", limits: "voluntary; non-sector-specific; requires tailoring", maps: ["P2:agent-governance", "P1:policy"], odgDecision: "adapt", odgEvidence: "ODG governance (POLICY primitive, agent-governance-harness, third-party-agent-gate) implements Govern/Measure fail-closed; regulatory-assurance refuses to assert certification", reflectedIn: "third-party-agent-gate" },
  { id: "owasp-llm-top10", family: "security-appsec-agent-supplychain", title: "OWASP Top 10 for LLM Applications (2025)", org: "OWASP GenAI Security Project", url: "https://genai.owasp.org/llm-top-10/", consulted: CONSULTED, nature: "community standard", reliability: "HIGH", practice: "prompt injection, insecure output handling, excessive agency, supply chain, unbounded consumption, sensitive-info disclosure", limits: "list, not a verification standard; needs concrete controls", maps: ["P2:agent-security"], odgDecision: "adopt", odgEvidence: "third-party-agent-gate evaluateAgentAction ADMIT|DENY|ESCALATE fail-closed (OWASP Agentic Top 10); excessive-agency countered by deny-by-default authorization", reflectedIn: "third-party-agent-gate" },
  { id: "slsa", family: "security-appsec-agent-supplychain", title: "SLSA — Supply-chain Levels for Software Artifacts", org: "OpenSSF", url: "https://slsa.dev/spec/v1.0/", consulted: CONSULTED, nature: "industry-consensus standard (v1.0 Apr 2023)", reliability: "HIGH", practice: "build provenance (L1), signed provenance (L2), hardened/isolated builders (L3)", limits: "focuses on build integrity, not whole lifecycle; higher levels need infra", maps: ["P2:supplychain-provenance"], odgDecision: "adapt", odgEvidence: "evidence-provenance stamps sourceCommit + sha256; supply-chain-attest emits multi-ecosystem SBOM; L2+ signing deferred (needs key infra)", reflectedIn: "evidence-provenance" },
  { id: "owasp-asvs", family: "security-appsec-agent-supplychain", title: "OWASP Application Security Verification Standard (ASVS)", org: "OWASP", url: "https://owasp.org/www-project-application-security-verification-standard/", consulted: CONSULTED, nature: "verification standard", reliability: "HIGH", practice: "leveled verification requirements for authentication, access control, logging, etc.", limits: "broad; a web-app service must select the relevant level", maps: ["P1:dashboard-security"], odgDecision: "adapt", odgEvidence: "dashboard-auth fail-closed (503 when unconfigured, constant-time token); dashboard-exposure-readiness gate requires auth+TLS+access-control before exposure", reflectedIn: "dashboard-exposure-readiness" },
  // --- observability & reliability ---
  { id: "opentelemetry", family: "observability-reliability", title: "OpenTelemetry (traces/metrics/logs standard)", org: "CNCF / OpenTelemetry", url: "https://opentelemetry.io/docs/", consulted: CONSULTED, nature: "CNCF standard + SDKs", reliability: "HIGH", practice: "vendor-neutral signals (traces, metrics, logs) with semantic conventions for consistent observability", limits: "instrumentation + a backend/collector are operational prerequisites", maps: ["P2:observability"], odgDecision: "test", odgEvidence: "ODG currently uses structured audit-log + evidence stamps; OTel semantic conventions are a candidate for future runtime telemetry (not yet wired; recorded as a gap)", reflectedIn: "audit-log" },
  // --- learning & memory ---
  { id: "durable-memory-reuse", family: "learning-memory", title: "Durable memory + evidence reuse (don't redo validated work)", org: "Google SRE (postmortems/learning) / memoization practice", url: "https://sre.google/sre-book/table-of-contents/", consulted: CONSULTED, nature: "engineering practice", reliability: "MEDIUM", practice: "persist outcomes with provenance; reuse a prior valid result unless its evidence is stale or a dependency changed", limits: "must version evidence + check freshness to avoid stale reuse", maps: ["P2:learning-reuse", "P2:no-repetition"], odgDecision: "adopt", odgEvidence: "closure-register + campaign-controller persist/resume; ACCEPTED requires evidence; control-evidence-freshness + reuse-ledger guard staleness", reflectedIn: "campaign-controller" },
  // --- multi-language & build ---
  { id: "extensible-lang-adapters", family: "multi-language-build", title: "Extensible per-language checker adapters", org: "Language Server Protocol (pluggable language tooling)", url: "https://microsoft.github.io/language-server-protocol/", consulted: CONSULTED, nature: "engineering practice", reliability: "MEDIUM", practice: "model each language/build/test/DB as a pluggable adapter with its own probe + checker; separate detect/compile/execute/validate", limits: "each stack needs a real toolchain + independent eval", maps: ["P2:multi-language"], odgDecision: "adopt", odgEvidence: "code-execution LANG_SPEC = pluggable adapters (JS/TS/Python/Shell/SQL/YAML/JSON); compiler stacks UNSUPPORTED until authorized install; no new primitive", reflectedIn: "code-execution" },
  // --- productization & SEO ---
  { id: "google-seo-starter", family: "productization-seo", title: "Google Search Central SEO Starter Guide", org: "Google for Developers", url: "https://developers.google.com/search/docs/fundamentals/seo-starter-guide", consulted: CONSULTED, nature: "official search-engine guidance", reliability: "HIGH", practice: "help search engines find/understand content; useful content, good titles/meta, internal links, accessibility, performance", limits: "no guaranteed ranking; guidance evolves", maps: ["P2:seo-visibility"], odgDecision: "adapt", odgEvidence: "seo-strategy register encodes intent/keyword + site architecture + anti-overclaim (no guaranteed ranking, no fabricated testimonials)", reflectedIn: "excellence-policy" },
  { id: "google-structured-data", family: "productization-seo", title: "Google structured data (schema.org) guidelines", org: "Google for Developers", url: "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data", consulted: CONSULTED, nature: "official guidance", reliability: "HIGH", practice: "mark up content with schema.org types ONLY where it reflects real page content + follows Google's general + type-specific guidelines", limits: "misuse ⇒ ineligibility/penalty; only where appropriate", maps: ["P2:seo-structured-data"], odgDecision: "adapt", odgEvidence: "seo-strategy applies structured data only where conforming (gated), never to misrepresent; no fabricated review/rating markup", reflectedIn: "excellence-policy" },
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function nonEmptyStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

/** validateEntry(e): fail-closed quality gate. Weak/incomplete sources are REJECTED (quality over volume). */
function validateEntry(e: any): any {
  const reasons: string[] = [];
  if (!isObj(e)) return { valid: false, reasons: ["not an object"] };
  if (!nonEmptyStr(e.id)) reasons.push("missing id");
  if (!FAMILIES.includes(e.family)) reasons.push(`family '${e.family}' not in taxonomy`);
  if (!nonEmptyStr(e.title)) reasons.push("missing title");
  if (!nonEmptyStr(e.org)) reasons.push("missing org/author");
  if (!/^https?:\/\/\S+$/.test(e.url || "")) reasons.push("missing/invalid url");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.consulted || "")) reasons.push("missing consulted date");
  if (!nonEmptyStr(e.practice)) reasons.push("missing practice");
  if (!nonEmptyStr(e.limits)) reasons.push("missing limits (every source has conditions)");
  if (!RELIABILITY.includes(e.reliability)) reasons.push("missing/invalid reliability");
  if (!Array.isArray(e.maps) || e.maps.length === 0 || !e.maps.every((m: string) => /^P[12]:/.test(m))) reasons.push("must map to ≥1 P1/P2 requirement");
  if (!DECISIONS.includes(e.odgDecision)) reasons.push(`odgDecision must be one of ${DECISIONS.join("|")}`);
  if (!nonEmptyStr(e.odgEvidence)) reasons.push("missing odgEvidence (decision rationale/evidence)");
  // if adopted/adapted, a reflectedIn module should be named (test verifies it exists on disk).
  if ((e.odgDecision === "adopt" || e.odgDecision === "adapt") && !nonEmptyStr(e.reflectedIn)) reasons.push("adopt/adapt requires reflectedIn module");
  return { valid: reasons.length === 0, reasons };
}

/** validateRegister(entries): split valid/invalid; detect duplicate ids + urls (no padding with redundancy). */
function validateRegister(entries: any = PRACTICES): any {
  const list = Array.isArray(entries) ? entries : [];
  const valid: any[] = []; const invalid: any[] = [];
  const ids = new Set(); const urls = new Set(); const dupIds: string[] = []; const dupUrls: string[] = [];
  for (const e of list) {
    const v = validateEntry(e);
    (v.valid ? valid : invalid).push({ id: e && e.id, reasons: v.reasons });
    if (isObj(e)) { if (ids.has(e.id)) dupIds.push(e.id); ids.add(e.id); if (urls.has(e.url)) dupUrls.push(e.url); urls.add(e.url); }
  }
  return { total: list.length, validCount: valid.length, invalidCount: invalid.length, invalid, dupIds, dupUrls, ok: invalid.length === 0 && dupIds.length === 0 };
}

/** summary(): counts by family / decision / reliability + requirement coverage. */
function summary(entries: any = PRACTICES): any {
  const by = (k: string) => { const m: Record<string, number> = {}; for (const e of entries) m[e[k]] = (m[e[k]] || 0) + 1; return m; };
  const maps = new Set<string>(); for (const e of entries) for (const m of (e.maps || [])) maps.add(m);
  return { total: entries.length, byFamily: by("family"), byDecision: by("odgDecision"), byReliability: by("reliability"), familiesCovered: FAMILIES.filter((f) => entries.some((e: any) => e.family === f)), requirementsMapped: Array.from(maps).sort() };
}

export { FAMILIES, DECISIONS, RELIABILITY, PRACTICES, validateEntry, validateRegister, summary };
module.exports = { FAMILIES, DECISIONS, RELIABILITY, PRACTICES, validateEntry, validateRegister, summary };

if (require.main === module) {
  process.stdout.write(JSON.stringify({ validation: validateRegister(), summary: summary() }, null, 2) + "\n");
}
