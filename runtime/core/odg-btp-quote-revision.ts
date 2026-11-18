#!/usr/bin/env node
"use strict";
/*
 * V319 §7 — BTP quote + revision/version domain brick (extends odg-btp-client-intake). PURE, deterministic, in-memory,
 * fail-closed. A client quote carries an initial SELLING amount + an ordered list of REVISIONS (avenants). Composes the
 * EXISTING finance engine (chantier-profitability) for the revised SELLING value — builds no parallel finance math.
 *
 * Governance invariants:
 *   - a revision MUST carry a reason + source ⇒ no unjustified / fabricated change;
 *   - a revision is NEVER auto-approved: `decide` requires an explicit approver decision (models owner/client authority);
 *   - the revised SELLING value counts ONLY approved revisions (budgetReviseMinor, delegated to the engine);
 *   - SELLING ≠ COST ≠ NET (the engine keeps them distinct);
 *   - sending a quote to the client is ALWAYS OWNER_GATED — never auto-allowed;
 *   - overflow / non-integer deltas are rejected (fail-closed); no network / clock / randomness.
 */
const CHANTIER = require("./chantier-profitability.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isNonNegInt(v: any): boolean { return isInt(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }

/** openQuote({ chantierId, currency?, initialSellingMinor }) -> { ok, quote } | { ok:false, code }. */
function openQuote(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.chantierId)) return freeze({ ok: false, code: "NO_CHANTIER_ID" });
  if (!isNonNegInt(i.initialSellingMinor)) return freeze({ ok: false, code: "BAD_INITIAL_SELLING", detail: "initialSellingMinor must be a non-negative safe integer (minor units)" });
  const currency = isStr(i.currency) ? i.currency : "EUR";
  return freeze({ ok: true, quote: freeze({ chantierId: i.chantierId, currency, initialSellingMinor: i.initialSellingMinor, versions: freeze([]), status: "DRAFT" }) });
}

/** proposeRevision(quote, { deltaMinor, reason, source }) -> { ok, quote } | REJECTED. A revision is appended UNAPPROVED. */
function proposeRevision(quote: any, rev: any): any {
  const q = isObj(quote) ? quote : {};
  if (!isStr(q.chantierId) || !Array.isArray(q.versions)) return freeze({ ok: false, code: "BAD_QUOTE" });
  const r = isObj(rev) ? rev : {};
  if (!isInt(r.deltaMinor)) return freeze({ ok: false, code: "BAD_DELTA", detail: "deltaMinor must be a safe integer (may be negative for a discount); overflow/non-integer rejected" });
  if (!isStr(r.reason) || !isStr(r.source)) return freeze({ ok: false, code: "UNJUSTIFIED_REVISION", detail: "a revision MUST carry both a reason and a source — no unjustified change" });
  // overflow guard on the prospective revised value
  const prospective = q.initialSellingMinor + q.versions.filter((v: any) => v.approved === true).reduce((n: number, v: any) => n + v.deltaMinor, 0) + r.deltaMinor;
  if (!isInt(prospective) || prospective < 0) return freeze({ ok: false, code: "REVISION_OUT_OF_RANGE", detail: "resulting revised selling would be negative or beyond safe-integer precision" });
  const version = freeze({ id: "v" + (q.versions.length + 1), deltaMinor: r.deltaMinor, reason: r.reason, source: r.source, approved: false });
  return freeze({ ok: true, quote: freeze({ ...q, versions: freeze([...q.versions, version]) }) });
}

/** decide(quote, versionId, { approved, approver }) -> { ok, quote }. Explicit decision ONLY — never auto-approves. */
function decide(quote: any, versionId: string, decision: any): any {
  const q = isObj(quote) ? quote : {};
  if (!isStr(q.chantierId) || !Array.isArray(q.versions)) return freeze({ ok: false, code: "BAD_QUOTE" });
  const d = isObj(decision) ? decision : {};
  if (typeof d.approved !== "boolean") return freeze({ ok: false, code: "NO_DECISION", detail: "approved must be an explicit boolean" });
  if (!isStr(d.approver)) return freeze({ ok: false, code: "NO_APPROVER", detail: "an explicit approver identity is required — a quote is never self-approved" });
  const idx = q.versions.findIndex((v: any) => v.id === versionId);
  if (idx < 0) return freeze({ ok: false, code: "NO_SUCH_VERSION", versionId });
  const versions = q.versions.map((v: any, k: number) => k === idx ? freeze({ ...v, approved: d.approved, approver: d.approver }) : v);
  return freeze({ ok: true, quote: freeze({ ...q, versions: freeze(versions) }) });
}

/** revisedSellingMinor(quote) -> initial + Σ approved deltas (same rule as the engine). */
function revisedSellingMinor(quote: any): number {
  const q = isObj(quote) ? quote : {};
  const base = isNonNegInt(q.initialSellingMinor) ? q.initialSellingMinor : 0;
  const approved = (Array.isArray(q.versions) ? q.versions : []).filter((v: any) => v.approved === true && isInt(v.deltaMinor)).reduce((n: number, v: any) => n + v.deltaMinor, 0);
  return base + approved;
}

/** finance(quote) -> the canonical chantier-profitability view (SELLING via budgetReviseMinor; COST/NET distinct). */
function finance(quote: any): any {
  const q = isObj(quote) ? quote : {};
  const r = CHANTIER.computeChantier({ id: q.chantierId, currency: q.currency || "EUR",
    quote: { devisInitialMinor: q.initialSellingMinor || 0, versions: (Array.isArray(q.versions) ? q.versions : []).map((v: any) => ({ approved: v.approved === true, deltaMinor: v.deltaMinor })) } });
  return r && r.ok ? r.finance : null;
}

/** sendReadiness(quote, auth) -> { allowed, reason }. Client send is ALWAYS OWNER_GATED — allowed ONLY with an explicit owner authorization. */
function sendReadiness(quote: any, auth: any): any {
  const q = isObj(quote) ? quote : {};
  if (!isStr(q.chantierId)) return freeze({ allowed: false, reason: "BAD_QUOTE" });
  const a = isObj(auth) ? auth : {};
  if (a.ownerAuthorized !== true || !isStr(a.owner)) return freeze({ allowed: false, reason: "OWNER_GATED", detail: "sending a quote to the client requires an explicit owner authorization (ownerAuthorized:true + owner id); never auto-allowed" });
  const pending = (Array.isArray(q.versions) ? q.versions : []).some((v: any) => v.approved !== true);
  if (pending) return freeze({ allowed: false, reason: "PENDING_REVISIONS", detail: "unapproved revisions remain — resolve them before sending" });
  return freeze({ allowed: true, reason: "OWNER_AUTHORIZED", revisedSellingMinor: revisedSellingMinor(q) });
}

const BTP_QUOTE_REVISION_CONTRACT = Object.freeze({
  id: "V319-BTP-QUOTE-REVISION",
  purpose: "§7 — client quote + revision/version domain brick on top of the intake estimate core; justified revisions, explicit approval, owner-gated send",
  reuses: Object.freeze(["chantier-profitability (revised SELLING via budgetReviseMinor; SELLING≠COST≠NET)", "odg-btp-client-intake (produces the initial selling estimate)"]),
  invariants: Object.freeze([
    "a revision MUST carry a reason AND a source ⇒ no unjustified/fabricated change (fail-closed)",
    "a revision is NEVER auto-approved: decide() requires an explicit approved boolean + approver identity",
    "revised SELLING counts ONLY approved revisions (delegated to chantier-profitability budgetReviseMinor)",
    "SELLING ≠ COST ≠ NET (engine keeps them distinct); non-integer/overflow/negative-result deltas rejected",
    "client send is ALWAYS OWNER_GATED — allowed only with explicit owner authorization and no pending revisions",
    "PURE + deterministic + in-memory; no network/clock/randomness; builds no parallel finance engine",
  ]),
});

module.exports = { openQuote, proposeRevision, decide, revisedSellingMinor, finance, sendReadiness, BTP_QUOTE_REVISION_CONTRACT };
export {};
