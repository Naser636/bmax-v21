#!/usr/bin/env node
"use strict";
/*
 * V361-A §3/§4/§5 Chantier-1 — COMPONENT CENSUS. PURE, deterministic, READ-ONLY. Answers "ODG, what are your components, which
 * are used, which are NOT and WHY?" over the REAL require-graph — it does NOT invent consumers or auto-activate anything. It
 * COMPOSES change-impact-graph + odg-consumer-scan (no second graph) and, for each NO-CONSUMER module, attaches HEURISTIC
 * evidence that classifies WHY it is dormant so a connect/activate decision is grounded (not blind-wired).
 *
 * HONESTY: the per-module class is EVIDENCE to support a decision, NOT an authoritative verdict — a module with no detected
 * consumer is a CANDIDATE for judgment, never auto-labelled "useless" or auto-connected. CONNECTED = a real non-test consumer
 * exists. The heuristics (library / app-referenced / demonstrator / producer) are named HEURISTIC and can be wrong; the
 * GENUINELY_DORMANT set is the actionable-candidate pool that needs a per-component decision. No fabricated connectivity.
 */

const SCAN = require("./odg-consumer-scan.js"); // the shared import-reference scan (merge core + bin/app/script consumers)
const AA = require("./architecture-audit.js");  // circular-dep + duplication + truly-unused audit (previously dormant — now a real consumer)

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isTest(c: string): boolean { return /\.test$/.test(c); }

const DEMO_RE = /(-demonstrator|-run|-bench|-benchmark|-selftest|-harness|-smoke)$/;

// V361-D P2-B — REVIEWED duplication families. architecture-audit flags any set of modules that share a responsibility
// signature as a NEEDS_REVIEW duplicationCandidate (the signature is contract-domain + exports; THIS census path passes no
// contract metadata, so here the grouping is by EXPORTS signature only). That raw finding is CORRECT and KEPT — a
// similarity never authorizes a fusion. This registry records the per-family JUDGMENT that HAS been made (members audited
// for behavior-equivalence + consumers + tests) so a reviewed-and-kept overlap is not mistaken for an open/unreviewed issue.
// A verdict is ONLY added here after an actual audit; the raw duplicationCandidate still appears. Keyed by the sorted member set.
const REVIEWED_DUPLICATION_FAMILIES = Object.freeze([
  Object.freeze({
    members: Object.freeze(["code-check-eval", "generative-repair-eval", "repair-eval"]),
    verdict: "INTENTIONAL_SPECIALIZATION",
    reviewedBy: "V361-D P2-B",
    rationale: "Sealed-corpus eval family: code-check-eval measures the code-CHECKER's syntax/type accuracy; generative-repair-eval " +
      "measures LOCAL-MODEL generative repair; repair-eval measures DETERMINISTIC repair families. DISTINCT subjects, ground-truth, " +
      "harnesses and classifications. The shared {CORPUS,CORPUS_VERSION,corpusProvenance,evaluate} shape + sha256(JSON.stringify) " +
      "seal is a core-wide idiom (~12 modules), not fusable logic — contentDigest produces a DIFFERENT hash so it cannot replace the " +
      "seal without changing the sealed corpus versions. NOT merged; kept specialized.",
  }),
]);
function reviewKey(members: any[]): string { return arr(members).map((x) => String(x)).sort().join("|"); }
const REVIEWED_BY_KEY: Record<string, any> = {};
for (const f of REVIEWED_DUPLICATION_FAMILIES) REVIEWED_BY_KEY[reviewKey(f.members as any)] = f;

/**
 * census(input) -> frozen report. input: {
 *   graph (change-impact-graph.buildGraph result), scanned ([{consumer, src}] out-of-core sources for the shared scan),
 *   sourceOf(module)->string (the module's own source text, for producer/library heuristics), appText? (concatenated src/ text) }.
 * Classifies each core module CONNECTED / BIN_ENTRY / TEST_ONLY / NO_CONSUMER(+heuristic WHY). Pure: all inputs injected.
 */
function census(input: any): any {
  const i = isObj(input) ? input : {};
  const graph = isObj(i.graph) ? i.graph : {};
  const modules = arr(graph.modules).filter((m: any) => typeof m === "string" && !isTest(m));
  const { merged, hasConsumer } = SCAN.mergeConsumers(graph, arr(i.scanned));
  const sourceOf = typeof i.sourceOf === "function" ? i.sourceOf : () => "";
  const appText = typeof i.appText === "string" ? i.appText : "";
  const binExists = typeof i.binExists === "function" ? i.binExists : () => false;

  const records: any[] = [];
  const counts: Record<string, number> = { CONNECTED: 0, BIN_ENTRY: 0, TEST_ONLY: 0, NO_CONSUMER: 0 };
  const whyCounts: Record<string, number> = {};
  for (const m of modules) {
    const consumers = arr(merged[m]);
    const nonTest = consumers.filter((c: any) => typeof c === "string" && !isTest(c) && c !== m);
    let status: string; let why: string | null = null;
    if (nonTest.length > 0) { status = "CONNECTED"; }
    else if (binExists(m)) { status = "BIN_ENTRY"; }
    else if (consumers.length > 0) { status = "TEST_ONLY"; }
    else {
      status = "NO_CONSUMER";
      // HEURISTIC WHY (evidence, not a verdict): demonstrator-named / referenced by the app / side-effect producer / library.
      const src = String(sourceOf(m) || "");
      if (DEMO_RE.test(m)) why = "DEMONSTRATOR_NAMED";                                  // a *-run/-bench/-demonstrator entry
      else if (appText && new RegExp('["\'/]' + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '(?:\\.js)?["\']').test(appText)) why = "APP_REFERENCED_HEURISTIC"; // appears in src/ (may be a data-string — a weak signal)
      else if (/\b(writeFileSync|mkdirSync)\s*\(/.test(src) && !/module\.exports\s*=\s*\{[^}]*\w/.test(src)) why = "PRODUCER_ARTIFACT_HEURISTIC"; // writes an artifact at load
      else if (/module\.exports\s*=\s*\{/.test(src)) why = "EXPORTS_API_NO_CONSUMER";    // exports an API but NO detected consumer — LIVENESS UNKNOWN (NOT "harmless library"); the per-module decision surface
      else why = "NO_API_NO_CONSUMER";                                                   // no export surface + no consumer ⇒ also needs a decision
      whyCounts[why] = (whyCounts[why] || 0) + 1;
    }
    counts[status] = (counts[status] || 0) + 1;
    records.push(freeze({ module: m, status, consumerCount: nonTest.length, why, consumersSample: freeze(nonTest.slice(0, 4)) }));
  }

  const noConsumer = records.filter((r: any) => r.status === "NO_CONSUMER");
  // the DECISION SURFACE = no-consumer modules whose liveness is genuinely UNKNOWN (export-an-API or no-API, no detected
  // importer) — these need a per-module decision. NOT a "cleared bucket". Demonstrators / app-referenced / producers are
  // excluded as having a plausible reason. (The export-convention is near-universal in core, so EXPORTS_API_NO_CONSUMER is
  // NOT evidence of harmlessness — it only means "no static importer found", which can miss dynamic/spawn/app-dynamic use.)
  const decisionSurface = noConsumer.filter((r: any) => r.why === "EXPORTS_API_NO_CONSUMER" || r.why === "NO_API_NO_CONSUMER").map((r: any) => r.module).sort();

  // ARCHITECTURE AUDIT — feed the previously-dormant architecture-audit with the REAL module metadata (deps + consumers +
  // hasTest + exports) so ODG's self-knowledge gains circular-dependency + responsibility-duplication detection (findings are
  // NEEDS_REVIEW, read-only — nothing merged/retired). This is a genuine consumer of a tested-but-unwired capability.
  const hasTest = typeof i.hasTest === "function" ? i.hasTest : () => false;
  const meta = modules.map((m: string) => {
    // take the LAST `module.exports = {…}` — the real CJS dual-export tail — not the FIRST (which may be a string-literal
    // fixture/example earlier in the file, e.g. a test contract containing `module.exports = { f }`). (inspection fix)
    const re = /module\.exports\s*=\s*\{([^}]*)\}/g; let mm: any; let last: any = null; const text = String(sourceOf(m) || "");
    while ((mm = re.exec(text))) last = mm;
    const exports = last ? last[1].split(",").map((s: string) => s.trim().split(":")[0].trim()).filter((s: string) => s && /^[A-Za-z_]/.test(s)) : [];
    return { id: m, deps: arr(graph.deps && graph.deps[m]), consumers: arr(merged[m]).filter((c: any) => !isTest(c) && c !== m), hasTest: hasTest(m) === true, exports };
  });
  const architecture = AA.auditArchitecture({ modules: meta, entrypoints: arr(i.entrypoints) });
  // Annotate each raw duplicationCandidate with its P2-B review verdict (if the family has been audited). The raw
  // NEEDS_REVIEW candidate is NOT removed; this only records whether a judgment exists so reviewed overlaps are not
  // perpetually re-surfaced as if open. UNREVIEWED = no audit yet ⇒ still an actionable finding.
  const duplicationReviews = arr(architecture.duplicationCandidates).map((d: any) => {
    const r = REVIEWED_BY_KEY[reviewKey(arr(d.members))];
    return freeze(r
      ? { members: d.members, reviewed: true, verdict: r.verdict, reviewedBy: r.reviewedBy, rationale: r.rationale }
      : { members: d.members, reviewed: false, verdict: "UNREVIEWED", reviewedBy: null, rationale: null });
  });

  return freeze({
    total: modules.length, counts: freeze(counts),
    noConsumerWhy: freeze(whyCounts),
    decisionSurface: freeze(decisionSurface),   // modules with no detected importer + no plausible reason ⇒ per-module judgment
    architecture: freeze({ circularDeps: architecture.circularDeps, duplicationGroups: architecture.summary.duplicationGroups, trulyUnused: architecture.summary.unused, duplicationCandidates: architecture.duplicationCandidates, duplicationReviews: freeze(duplicationReviews) }),
    records: freeze(records),
    note: "component census over the REAL require-graph. CONNECTED = a real non-test consumer exists. NO_CONSUMER = NO STATIC LITERAL/alias importer found — it can MISS dynamic/spawn/app-dynamic consumers, so it OVER-reports orphans (not a reliable 'truly dead' set). The `why` is weak HEURISTIC EVIDENCE: EXPORTS_API_NO_CONSUMER means liveness is UNKNOWN (the export convention is near-universal in core — NOT proof of harmlessness), NOT a cleared library. The decisionSurface is the per-module judgment pool (NOT 'no orphans'); nothing is auto-labelled useless, no consumer is fabricated, nothing is auto-activated.",
  });
}

const COMPONENT_CENSUS_CONTRACT = Object.freeze({
  id: "V361A-COMPONENT-CENSUS",
  purpose: "Chantier-1 inventory/cartography: classify every core module (CONNECTED / BIN_ENTRY / TEST_ONLY / NO_CONSUMER+heuristic-why) over the real require-graph to ground a connect/activate decision; composes change-impact-graph + odg-consumer-scan, no second graph",
  reuses: Object.freeze(["change-impact-graph.buildGraph (the real module/consumer graph)", "odg-consumer-scan.mergeConsumers (core + bin/app/script import scan — no fabricated consumers)", "architecture-audit.auditArchitecture (circular-dep + responsibility-duplication + truly-unused — a previously-dormant tested capability now given a real consumer; findings are NEEDS_REVIEW, read-only)"]),
  invariants: Object.freeze([
    "CONNECTED requires a REAL non-test consumer; a consumer is NEVER fabricated to inflate connectivity",
    "NO_CONSUMER = no STATIC literal/alias importer found — it can MISS dynamic/spawn/app-dynamic consumers, so it OVER-reports orphans (never cite it as 'truly dead')",
    "the `why` is weak HEURISTIC EVIDENCE: EXPORTS_API_NO_CONSUMER means liveness UNKNOWN (export convention is near-universal in core — NOT proof of harmlessness); the decisionSurface is a per-module judgment pool, NOT a cleared bucket and NOT 'no orphans'",
    "never auto-labels a module useless, never fabricates a consumer, never auto-activates; PURE/deterministic/frozen READ-ONLY; composes the real graph + scan; no second graph; mutates nothing",
  ]),
});

module.exports = { census, COMPONENT_CENSUS_CONTRACT };
export {};
