#!/usr/bin/env node
/**
 * excellence-policy — CANONICAL, CONSULTABLE excellence mechanism (CTO "PERMANENT WORLD-CLASS EXCELLENCE ENGINE").
 *
 * This is NOT a 10th primitive and NOT a concurrent orchestrator. It is a pure, deterministic, FAIL-CLOSED decision
 * module that the existing primitives/capabilities CALL during a mission to enforce one standing rule:
 *
 *   For every mission and every relevant component, ODG seeks the most reliable, current quality references for the
 *   domain, compares approaches, selects the applicable practices, adapts them to ODG's architecture and constraints,
 *   TESTS them, and keeps evidence of the improvement.
 *
 * The rule is meant to be invoked by capabilities (e.g. regulatory-assurance) and self-reviews, so it is applied
 * automatically without a per-mission human reminder. It intentionally REFUSES marketing-grade claims:
 *   - no "world number one" / "best / optimal" claim survives without a cited, credible BENCHMARK reference;
 *   - normative status is never conflated (legal obligation vs voluntary standard vs recommendation vs practice vs
 *     assumption);
 *   - a review with no applicable, in-date reference is INSUFFICIENT_EVIDENCE (never a silent pass).
 *
 * Pure & hermetic: no network, no clock (all dates are DATA carried by the references / supplied by the caller;
 * "now" is injected). Deterministic for the same inputs.
 */
"use strict";

const prov = require("./evidence-provenance.js");

export type NormativeStatus =
  | "legal-obligation"
  | "voluntary-standard"
  | "recommendation"
  | "industry-practice"
  | "assumption";

const NORMATIVE_STATUSES: NormativeStatus[] = ["legal-obligation", "voluntary-standard", "recommendation", "industry-practice", "assumption"];
const VERIFICATION_STATUSES = ["verified", "offline-pending-reverify"];
// ACCESS LEVEL — the depth of access actually obtained for a reference. FAIL-CLOSED default "not-consulted". A
// "metadata-only" catalogue page MUST NEVER be recorded as if the full normative text were consulted.
const ACCESS_LEVELS = ["full-text", "open-document", "sponsored-consultation", "metadata-only", "not-consulted"];

export interface Reference {
  id: string;
  authority: string;                 // issuing body (ISO, EU, NIST, CNIL, …)
  domain: string;                    // e.g. "data-protection", "information-security", "ai-governance", "sw-reliability"
  version: string;                   // e.g. "2022", "2016/679", "1.0"
  date: string;                      // ISO date string (DATA, not a live clock)
  source: string;                    // verifiable locator (standard no., regulation id, framework name) — NOT copyrighted text
  normativeStatus: NormativeStatus;
  usageRights: string;               // e.g. "principles-only (standard text is copyrighted)", "public-regulation"
  practicesAdopted: string[];        // the authorized PRINCIPLES extracted (never the protected text)
  limits: string[];                  // known limits / where it does not apply
  nextReviewDate: string;            // when this entry must be re-verified
  verificationStatus: string;        // "verified" (checked online) | "offline-pending-reverify" (recorded offline)
  accessLevel?: string;              // full-text | open-document | sponsored-consultation | metadata-only | not-consulted
}

export interface ReferenceIssue { id: string; field: string; problem: string; }

export interface ExcellenceClaim { claim: string; justified: boolean; reason: string; }

export interface ExcellenceReview {
  domain: string;
  now: string;
  verdict: "MEETS" | "IMPROVE" | "INSUFFICIENT_EVIDENCE";
  referencesSelected: Reference[];
  referenceIssues: ReferenceIssue[];
  staleReferences: string[];                 // ids whose nextReviewDate <= now
  gaps: Array<{ reference: string; practice: string; present: boolean; note: string }>;
  thresholds: Record<string, number>;
  measured: Record<string, number>;
  thresholdResults: Array<{ metric: string; threshold: number; measured: number; pass: boolean }>;
  recommendation: string;
  claims: ExcellenceClaim[];
  notes: string[];
}

/** FAIL-CLOSED reference validation: an unknown/absent normativeStatus degrades to "assumption" and is flagged. */
function classifyReference(ref: any): { ref: Reference | null; issues: ReferenceIssue[] } {
  const issues: ReferenceIssue[] = [];
  if (!ref || typeof ref !== "object") return { ref: null, issues: [{ id: "?", field: "*", problem: "absent/malformed reference" }] };
  const id = typeof ref.id === "string" && ref.id ? ref.id : "?";
  const req = ["authority", "domain", "version", "date", "source", "usageRights", "nextReviewDate"];
  for (const f of req) if (!ref[f] || typeof ref[f] !== "string") issues.push({ id, field: f, problem: "missing/invalid" });
  let normativeStatus: NormativeStatus = ref.normativeStatus;
  if (!NORMATIVE_STATUSES.includes(normativeStatus)) { issues.push({ id, field: "normativeStatus", problem: `unknown status ${JSON.stringify(ref.normativeStatus)} ⇒ degraded to "assumption" (fail-closed)` }); normativeStatus = "assumption"; }
  let verificationStatus = ref.verificationStatus;
  if (!VERIFICATION_STATUSES.includes(verificationStatus)) { issues.push({ id, field: "verificationStatus", problem: `unknown ⇒ offline-pending-reverify` }); verificationStatus = "offline-pending-reverify"; }
  let accessLevel = ref.accessLevel;
  if (accessLevel !== undefined && !ACCESS_LEVELS.includes(accessLevel)) { issues.push({ id, field: "accessLevel", problem: `unknown access level ${JSON.stringify(ref.accessLevel)} ⇒ degraded to "not-consulted" (fail-closed)` }); accessLevel = "not-consulted"; }
  if (accessLevel === undefined) accessLevel = "not-consulted";          // FAIL-CLOSED: absent ⇒ not-consulted (never assume full text)
  const normalized: Reference = {
    id, authority: ref.authority || "?", domain: ref.domain || "?", version: ref.version || "?", date: ref.date || "?",
    source: ref.source || "?", normativeStatus, usageRights: ref.usageRights || "?",
    practicesAdopted: Array.isArray(ref.practicesAdopted) ? ref.practicesAdopted.slice() : [],
    limits: Array.isArray(ref.limits) ? ref.limits.slice() : [],
    nextReviewDate: ref.nextReviewDate || "?", verificationStatus, accessLevel,
  };
  return { ref: normalized, issues };
}

/** Select the references applicable to a domain (exact or prefix match), keeping validation issues. */
function selectReferences(registry: any[], domain: string): { selected: Reference[]; issues: ReferenceIssue[] } {
  const selected: Reference[] = []; const issues: ReferenceIssue[] = [];
  for (const raw of Array.isArray(registry) ? registry : []) {
    const { ref, issues: iss } = classifyReference(raw);
    issues.push(...iss);
    if (ref && (ref.domain === domain || domain === "*" || ref.domain.startsWith(domain) || domain.startsWith(ref.domain))) selected.push(ref);
  }
  return { selected, issues };
}

/**
 * A superlative/marketing claim ("world number one", "best", "optimal", "state of the art") is REFUSED unless a
 * credible benchmark reference backs it. Returns an ExcellenceClaim with justified=false by default (fail-closed).
 */
function evaluateClaim(claim: string, opts?: { benchmarkRef?: string; benchmarkResult?: any }): ExcellenceClaim {
  const superlative = /\b(world|global)[-\s]?(number[-\s]?one|no\.?\s?1|leading|leader|best|#1)\b|\bbest\b|\boptimal\b|\bstate[-\s]?of[-\s]?the[-\s]?art\b|\bunbeatable\b|\bworld[-\s]?class\b/i.test(String(claim || ""));
  if (!superlative) return { claim, justified: true, reason: "non-superlative factual claim (no benchmark required)" };
  const hasBenchmark = !!(opts && opts.benchmarkRef && opts.benchmarkResult != null);
  return { claim, justified: hasBenchmark, reason: hasBenchmark
    ? `superlative claim backed by benchmark ${opts!.benchmarkRef}`
    : "superlative/marketing claim REFUSED — no credible independent benchmark reference provided (fail-closed)" };
}

/**
 * reviewForExcellence — the canonical call. Compares a component's PROVEN current practices against the selected
 * references' adopted practices, flags stale references, evaluates pre-fixed thresholds against measured metrics, and
 * renders a fail-closed verdict. Thresholds MUST be provided up-front (never retrofitted).
 */
function reviewForExcellence(input: any): ExcellenceReview {
  const domain = (input && input.domain) || "*";
  const now = (input && input.now) || "";                              // injected clock (no Date.now)
  const registry = (input && input.registry) || [];
  const currentPractices: string[] = Array.isArray(input && input.currentPractices) ? input.currentPractices : [];
  const thresholds: Record<string, number> = (input && input.thresholds) || {};
  const measured: Record<string, number> = (input && input.measured) || {};
  const claimsIn: string[] = Array.isArray(input && input.claims) ? input.claims : [];
  const notes: string[] = [];

  const { selected, issues } = selectReferences(registry, domain);

  // stale references (nextReviewDate <= now) trigger re-evaluation per the periodic-audit rule
  const stale: string[] = [];
  if (now) for (const r of selected) if (r.nextReviewDate && r.nextReviewDate !== "?" && r.nextReviewDate <= now) stale.push(r.id);

  // gap analysis: each reference's adopted practice must be present in the component's proven practices
  const gaps: ExcellenceReview["gaps"] = [];
  for (const r of selected) for (const practice of r.practicesAdopted) {
    const present = currentPractices.some(cp => cp === practice || cp.includes(practice) || practice.includes(cp));
    gaps.push({ reference: r.id, practice, present, note: present ? "present" : "GAP — adopt/adapt + test + evidence" });
  }

  // threshold evaluation (pre-fixed; measured compared as >=)
  const thresholdResults = Object.keys(thresholds).map(metric => ({ metric, threshold: thresholds[metric], measured: measured[metric], pass: typeof measured[metric] === "number" && measured[metric] >= thresholds[metric] }));

  const claims = claimsIn.map(c => evaluateClaim(c, input && input.benchmark));

  // verdict (fail-closed): no applicable in-date reference ⇒ INSUFFICIENT_EVIDENCE; any open gap or failed threshold or
  // unjustified claim ⇒ IMPROVE; otherwise MEETS.
  let verdict: ExcellenceReview["verdict"];
  const usableRefs = selected.filter(r => !stale.includes(r.id));
  if (usableRefs.length === 0) { verdict = "INSUFFICIENT_EVIDENCE"; notes.push("no applicable, in-date reference for this domain — cannot assert excellence (fail-closed)"); }
  else if (gaps.some(g => !g.present) || thresholdResults.some(t => !t.pass) || claims.some(c => !c.justified)) verdict = "IMPROVE";
  else verdict = "MEETS";

  if (issues.length) notes.push(`${issues.length} reference validation issue(s) (degraded fail-closed)`);
  if (stale.length) notes.push(`${stale.length} stale reference(s) require re-verification: ${stale.join(", ")}`);

  const openGaps = gaps.filter(g => !g.present);
  const recommendation = verdict === "MEETS"
    ? "current practices meet the selected references' adopted principles and all pre-fixed thresholds; keep evidence + re-review at nextReviewDate"
    : verdict === "INSUFFICIENT_EVIDENCE"
      ? "acquire/verify applicable references for this domain before asserting any excellence level"
      : `address ${openGaps.length} practice gap(s) and ${thresholdResults.filter(t => !t.pass).length} threshold miss(es); adapt + test + keep before/after evidence`;

  return { domain, now, verdict, referencesSelected: selected, referenceIssues: issues, staleReferences: stale, gaps, thresholds, measured, thresholdResults, recommendation, claims, notes };
}

/**
 * requireExcellence — the SHARED ENFORCEMENT boundary reused by the scheduler and by any capability, so the rule is
 * applied uniformly WITHOUT duplicating its logic. Returns { admit, reason, advisory }. FAIL-CLOSED only on a
 * PROHIBITED claim (an unjustified superlative); stale references / INSUFFICIENT_EVIDENCE (offline) / open gaps are
 * ADVISORY and still admit (admit:true) — a safe mission is never blocked merely because reference search is offline —
 * UNLESS opts.strict is set (then advisories also block). A missing/absent review is advisory (admit unless strict).
 */
function requireExcellence(review: any, opts?: any): { admit: boolean; reason: string; advisory: boolean; prohibited?: any[] } {
  const strict = !!(opts && opts.strict);
  if (!review || typeof review !== "object") return { admit: !strict, reason: strict ? "strict: no review" : "no review (advisory, non-blocking)", advisory: true };
  const prohibited = Array.isArray(review.claims) ? review.claims.filter((c: any) => c && c.justified === false) : [];
  if (prohibited.length) return { admit: false, reason: `prohibited unproven claim(s): ${prohibited.map((c: any) => c.claim).join("; ")}`, advisory: false, prohibited };
  const adv: string[] = [];
  if (Array.isArray(review.staleReferences) && review.staleReferences.length) adv.push(`stale refs: ${review.staleReferences.join(",")}`);
  if (review.verdict === "INSUFFICIENT_EVIDENCE") adv.push("insufficient reference evidence (offline?) — advisory");
  if (Array.isArray(review.gaps) && review.gaps.some((g: any) => !g.present)) adv.push("open practice gaps");
  if (strict && adv.length) return { admit: false, reason: `strict mode blocks on advisories: ${adv.join("; ")}`, advisory: true };
  return { admit: true, reason: adv.length ? `admitted with advisories: ${adv.join("; ")}` : "admitted", advisory: adv.length > 0 };
}

/** Seal a review as tamper-evident evidence (reuses the EVIDENCE primitive's provenance). */
function sealReview(review: ExcellenceReview, opts?: any): any {
  return prov.stampProvenance(review, { revision: opts && opts.revision });
}

export { classifyReference, selectReferences, evaluateClaim, reviewForExcellence, requireExcellence, sealReview };
module.exports = { classifyReference, selectReferences, evaluateClaim, reviewForExcellence, requireExcellence, sealReview };
