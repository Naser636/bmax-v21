#!/usr/bin/env node
/**
 * proposal-generator — assembles a commercial proposal from CALLER-SUPPLIED, verifiable inputs
 * (scope, deliverables, limits, exclusions, price). It NEVER invents a client, a price, a deliverable
 * or a capability. Two fail-closed guardrails run before any proposal is emitted:
 *   1. structural: client + scope + deliverables + at least one explicit LIMITATION + a price are required
 *      (a proposal with no stated limits is refused — honesty by construction);
 *   2. anti-overclaim: free text is scanned for forbidden promises — certification "obtained", "fully/
 *      guaranteed compliant", result/outcome guarantees, "100% secure", unbenchmarked superlatives —
 *      and the proposal is REFUSED (not softened) if any appear.
 * Pricing reuses invoicing.computeTotals (no second money path). Pure/deterministic: no clock, no IO,
 * no network; `now` is an injected string so renders are reproducible. Tiers (ENTRY/B2B/PARTNERSHIP)
 * are presentation metadata only — they never relax the guardrails. Links to revenue-model /
 * pipeline-ledger via pipelineEntry()/expectedValue() (a PROPOSAL-stage value, never counted as signed).
 */
"use strict";

const invoicing: any = require("./invoicing");

const OFFER_TIERS: Record<string, { id: string; label: string; intent: string }> = {
  ENTRY: { id: "ENTRY", label: "Entry diagnostic", intent: "scoped, low-risk first engagement" },
  B2B: { id: "B2B", label: "B2B engagement", intent: "larger multi-framework / multi-phase engagement" },
  PARTNERSHIP: { id: "PARTNERSHIP", label: "Partnership / white-label", intent: "delivery through or with a partner" },
};

const CODE = Object.freeze({
  INVALID_INPUT: "INVALID_INPUT", MISSING_LIMITATIONS: "MISSING_LIMITATIONS",
  MISSING_PRICE: "MISSING_PRICE", INVALID_LINE: "INVALID_LINE",
  UNKNOWN_TIER: "UNKNOWN_TIER", OVERCLAIM: "OVERCLAIM",
});

// Forbidden promises. Each is a claim ODG cannot truthfully make: certification is an accredited body's act,
// compliance/security/outcomes cannot be guaranteed, superlatives need a benchmark. FAIL-CLOSED: any hit ⇒ refuse.
const PROHIBITED: Array<{ re: RegExp; why: string }> = [
  // certification CLAIM, but allow honest framings: "certification readiness/preparation" (followed) and
  // "not/no/towards/prepare… certify" (preceded) are NOT violations.
  { re: /(?<!\b(?:not|no|towards|prepares?|preparing)\s)\bcertif(?:y|ied|ication)\b(?!\s+(?:readiness|preparation|prep))/i, why: "certification is issued by an accredited body, not by ODG" },
  { re: /\b(fully|100%|totally)\s+(compliant|secure|conform)/i, why: "no absolute compliance/security claim" },
  { re: /\b(guarantee|guaranteed|ensures?)\s+(compliance|conformity|security|results?|outcomes?|success|pass)/i, why: "no compliance/result/outcome guarantee" },
  { re: /\bwill\s+(pass|clear)\s+(the\s+)?(audit|certification|assessment)\b/i, why: "cannot promise a third-party audit/certification will pass" },
  { re: /\bmakes?\s+you\s+(compliant|certified|secure)\b/i, why: "a service does not by itself make a client compliant/certified" },
  { re: /\b(zero|no)\s+risk\b/i, why: "no zero-risk claim" },
  { re: /\b(best|world[-\s]?(class|leading)|number\s*one|#1|unbeatable|market[-\s]?leading)\b/i, why: "superlative requires a published benchmark (unbenchmarked ⇒ refused)" },
];

/** scanClaims(text): returns { ok, violations[] }. Checks a single string against every prohibited pattern. */
function scanClaims(text: any): { ok: boolean; violations: Array<{ term: string; why: string }> } {
  const s = String(text == null ? "" : text);
  const violations: Array<{ term: string; why: string }> = [];
  for (const p of PROHIBITED) { const m = s.match(p.re); if (m) violations.push({ term: m[0], why: p.why }); }
  return { ok: violations.length === 0, violations };
}

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function strArr(v: any): string[] { return Array.isArray(v) ? v.filter(isStr).map((x) => String(x).trim()) : []; }

/**
 * buildProposal(input, opts?): assemble a proposal from verifiable inputs. Fail-closed.
 *   input = { client, tier, problem, scope[], deliverables[], limitations[], exclusions[], evidenceRefs[],
 *             lines[]|{fixedPrice,currency}, discount?, taxRate?, currency?, validityDays?, assumptions[] }
 * Returns { ok:false, code, ... } on any guardrail failure, else { ok:true, proposal, markdown }.
 */
function buildProposal(input: any, opts: any = {}): any {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return { ok: false, code: CODE.INVALID_INPUT, detail: "object required" };
  const tierId = isStr(input.tier) ? String(input.tier).toUpperCase() : "ENTRY";
  const tier = OFFER_TIERS[tierId];
  if (!tier) return { ok: false, code: CODE.UNKNOWN_TIER, detail: `tier must be one of ${Object.keys(OFFER_TIERS).join(", ")}` };
  if (!isStr(input.client)) return { ok: false, code: CODE.INVALID_INPUT, detail: "client (caller-supplied) required — never invented" };
  const scope = strArr(input.scope), deliverables = strArr(input.deliverables), limitations = strArr(input.limitations);
  if (scope.length === 0 || deliverables.length === 0) return { ok: false, code: CODE.INVALID_INPUT, detail: "non-empty scope[] and deliverables[] required" };
  if (limitations.length === 0) return { ok: false, code: CODE.MISSING_LIMITATIONS, detail: "at least one explicit limitation required (a proposal with no stated limits is refused)" };

  // Pricing: either priced lines (reuse invoicing.computeTotals) or an explicit fixedPrice. No price ⇒ refuse.
  let totals: any;
  if (Array.isArray(input.lines) && input.lines.length > 0) {
    const t = invoicing.computeTotals(input.lines, input.discount, Number.isFinite(input.taxRate) ? input.taxRate : 0);
    if (!t || !t.ok) return { ok: false, code: CODE.INVALID_LINE, detail: (t && t.detail) || "invalid price lines" };
    totals = { subtotal: t.subtotal, discount: t.discount, tax: t.tax, total: t.total, lines: t.lines };
  } else if (Number.isFinite(input.fixedPrice) && input.fixedPrice >= 0) {
    totals = { subtotal: input.fixedPrice, discount: 0, tax: 0, total: input.fixedPrice, lines: [{ label: "Fixed-price engagement", amount: input.fixedPrice }] };
  } else {
    return { ok: false, code: CODE.MISSING_PRICE, detail: "priced lines[] or a numeric fixedPrice required — price is never invented" };
  }

  // Anti-overclaim: scan every free-text field the client would read.
  const texts = [input.problem, ...scope, ...deliverables, ...strArr(input.assumptions), ...strArr(input.valueStatements)];
  const allViol: Array<{ in: string; term: string; why: string }> = [];
  for (const t of texts) { const r = scanClaims(t); for (const v of r.violations) allViol.push({ in: String(t).slice(0, 60), term: v.term, why: v.why }); }
  if (allViol.length > 0) return { ok: false, code: CODE.OVERCLAIM, violations: allViol, detail: "proposal refused — remove unprovable promises (see violations)" };

  const currency = isStr(input.currency) ? input.currency : "EUR";
  const validityDays = Number.isFinite(input.validityDays) ? input.validityDays : 30;
  const now = isStr(opts.now) ? opts.now : "";
  const proposal = {
    client: String(input.client).trim(), tier: tier.id, tierLabel: tier.label,
    problem: isStr(input.problem) ? String(input.problem).trim() : null,
    scope, deliverables, limitations, exclusions: strArr(input.exclusions),
    assumptions: strArr(input.assumptions), evidenceRefs: strArr(input.evidenceRefs),
    currency, totals, validityDays, now,
    honesty: [
      "ODG prepares evidence and readiness; it does NOT issue certification — certification is an accredited body's decision.",
      "No compliance, security, or outcome is guaranteed; this engagement reduces risk and produces evidence, it does not eliminate risk.",
      "Scope, deliverables, price and limits above are the agreement; anything not listed is excluded.",
    ],
  };
  return { ok: true, proposal, markdown: render(proposal) };
}

function render(p: any): string {
  const L: string[] = [];
  const money = (n: number) => `${n.toFixed(2)} ${p.currency}`;
  L.push(`# Proposal — ${p.client} (${p.tierLabel})`);
  if (p.now) L.push(`_Date: ${p.now} · valid ${p.validityDays} days_`);
  L.push("");
  if (p.problem) { L.push(`## Problem`); L.push(p.problem); L.push(""); }
  L.push(`## Scope`); for (const s of p.scope) L.push(`- ${s}`); L.push("");
  L.push(`## Deliverables`); for (const d of p.deliverables) L.push(`- ${d}`); L.push("");
  if (p.assumptions.length) { L.push(`## Assumptions`); for (const a of p.assumptions) L.push(`- ${a}`); L.push(""); }
  L.push(`## Limitations`); for (const l of p.limitations) L.push(`- ${l}`); L.push("");
  if (p.exclusions.length) { L.push(`## Out of scope (excluded)`); for (const e of p.exclusions) L.push(`- ${e}`); L.push(""); }
  if (p.evidenceRefs.length) { L.push(`## Evidence / proof referenced`); for (const e of p.evidenceRefs) L.push(`- ${e}`); L.push(""); }
  L.push(`## Price`);
  for (const ln of p.totals.lines) { const amt = Number(ln.lineTotal != null ? ln.lineTotal : (ln.amount != null ? ln.amount : ln.total)) || 0; L.push(`- ${ln.description || ln.label || "line"}: ${money(amt)}`); }
  L.push(`- **Subtotal:** ${money(p.totals.subtotal)}${p.totals.discount ? ` · discount ${money(p.totals.discount)}` : ""}${p.totals.tax ? ` · tax ${money(p.totals.tax)}` : ""}`);
  L.push(`- **Total:** ${money(p.totals.total)}`);
  L.push("");
  L.push(`## Honest terms`); for (const h of p.honesty) L.push(`> ${h}`);
  return L.join("\n");
}

/** expectedValue(proposal): the PROPOSAL-stage value for the pipeline. Not signed — a proposal is not a contract. */
function expectedValue(proposal: any): { value: number; currency: string; stage: string } {
  const total = proposal && proposal.totals && Number.isFinite(proposal.totals.total) ? proposal.totals.total : 0;
  return { value: total, currency: (proposal && proposal.currency) || "EUR", stage: "PROPOSAL" };
}

/** pipelineEntry(proposal, id): a pipeline-ledger-ready PROPOSAL entry (never SIGNED — human signature required). */
function pipelineEntry(proposal: any, id: string): { id: string; stage: string; value: number; currency: string } {
  const ev = expectedValue(proposal);
  return { id: isStr(id) ? id : (proposal && proposal.client) || "?", stage: "PROPOSAL", value: ev.value, currency: ev.currency };
}

export { OFFER_TIERS, CODE, scanClaims, buildProposal, expectedValue, pipelineEntry };
module.exports = { OFFER_TIERS, CODE, scanClaims, buildProposal, expectedValue, pipelineEntry };

if (require.main === module) { process.stdout.write("proposal-generator (fail-closed, anti-overclaim)\n"); }
