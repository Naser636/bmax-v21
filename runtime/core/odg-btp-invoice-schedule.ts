#!/usr/bin/env node
"use strict";
/*
 * V319 §7 — BTP acompte/invoice schedule domain brick (extends odg-btp-quote-revision). PURE, deterministic, in-memory,
 * fail-closed. From a FULLY-APPROVED quote it derives a payment schedule (acompte + situations) whose amounts sum
 * EXACTLY to the revised SELLING value (no fabricated cent: the last line absorbs the rounding remainder, disclosed).
 * Recording a payment is ALWAYS OWNER_GATED and never auto-charged.
 *
 * Invariants:
 *   - schedule only on a quote with NO pending (unapproved) revisions (fail-closed otherwise);
 *   - basis = revised SELLING from odg-btp-quote-revision (which sources chantier-profitability budgetReviseMinor);
 *   - percent milestones are basis-points summing to EXACTLY 10000; amounts sum EXACTLY to the basis (remainder on last line);
 *   - every line starts PLANNED; markPaid requires explicit owner authorization + an evidence ref + exact amount — NEVER auto;
 *   - no network / clock / randomness; builds no parallel finance engine.
 */
const QUOTE = require("./odg-btp-quote-revision.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v); }
function isPosInt(v: any): boolean { return isInt(v) && v > 0; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * buildSchedule(quote, plan) -> { ok, schedule } | { ok:false, code }.
 * plan = { milestones: [{ label, percentBps }] } — basis points (10000 = 100%), summing to EXACTLY 10000.
 */
function buildSchedule(quote: any, plan: any): any {
  const q = isObj(quote) ? quote : {};
  if (!isStr(q.chantierId) || !Array.isArray(q.versions)) return freeze({ ok: false, code: "BAD_QUOTE" });
  if (q.versions.some((v: any) => v.approved !== true)) return freeze({ ok: false, code: "PENDING_REVISIONS", detail: "cannot schedule payments while a revision is unapproved" });
  const basis = QUOTE.revisedSellingMinor(q);
  if (!isPosInt(basis)) return freeze({ ok: false, code: "BAD_BASIS", detail: "revised selling must be a positive safe integer to schedule payments" });
  const p = isObj(plan) ? plan : {};
  const ms = Array.isArray(p.milestones) ? p.milestones : [];
  if (!ms.length) return freeze({ ok: false, code: "NO_MILESTONES" });
  if (!ms.every((m: any) => isObj(m) && isStr(m.label) && isPosInt(m.percentBps))) return freeze({ ok: false, code: "BAD_MILESTONE", detail: "each milestone needs a label + positive integer percentBps" });
  const totalBps = ms.reduce((n: number, m: any) => n + m.percentBps, 0);
  if (totalBps !== 10000) return freeze({ ok: false, code: "BPS_NOT_100", detail: `percentBps sum to ${totalBps}, must be exactly 10000 (100%)` });

  // EXACT split: floor each but the last; last absorbs the remainder so Σ === basis (no fabricated cent).
  let allocated = 0;
  const lines = ms.map((m: any, idx: number) => {
    const last = idx === ms.length - 1;
    const amt = last ? basis - allocated : Math.floor((basis * m.percentBps) / 10000);
    allocated += amt;
    return freeze({ ref: "pay" + (idx + 1), label: m.label, percentBps: m.percentBps, amountMinor: amt, roundingAdjusted: last && amt !== Math.floor((basis * m.percentBps) / 10000), status: "PLANNED", payment: null });
  });
  const sum = lines.reduce((n: number, l: any) => n + l.amountMinor, 0);
  if (sum !== basis) return freeze({ ok: false, code: "SPLIT_MISMATCH", detail: `internal split ${sum} ≠ basis ${basis}` }); // defensive; should never fire
  return freeze({ ok: true, schedule: freeze({ chantierId: q.chantierId, currency: q.currency || "EUR", basisSellingMinor: basis, lines: freeze(lines) }) });
}

/** markPaid(schedule, lineRef, payment) -> { ok, schedule }. OWNER_GATED: needs ownerAuthorized + owner + evidenceRef + exact amount. */
function markPaid(schedule: any, lineRef: string, payment: any): any {
  const s = isObj(schedule) ? schedule : {};
  if (!Array.isArray(s.lines)) return freeze({ ok: false, code: "BAD_SCHEDULE" });
  const pay = isObj(payment) ? payment : {};
  if (pay.ownerAuthorized !== true || !isStr(pay.owner)) return freeze({ ok: false, code: "OWNER_GATED", detail: "recording a payment requires explicit owner authorization (ownerAuthorized:true + owner); never auto-charged" });
  if (!isStr(pay.evidenceRef)) return freeze({ ok: false, code: "NO_EVIDENCE", detail: "a payment evidence reference is required (receipt/transfer id)" });
  const idx = s.lines.findIndex((l: any) => l.ref === lineRef);
  if (idx < 0) return freeze({ ok: false, code: "NO_SUCH_LINE", lineRef });
  const line = s.lines[idx];
  if (line.status === "PAID") return freeze({ ok: false, code: "ALREADY_PAID", lineRef });
  if (!isInt(pay.amountMinor) || pay.amountMinor !== line.amountMinor) return freeze({ ok: false, code: "AMOUNT_MISMATCH", detail: `payment amount must exactly equal the planned ${line.amountMinor}` });
  const lines = s.lines.map((l: any, k: number) => k === idx ? freeze({ ...l, status: "PAID", payment: freeze({ owner: pay.owner, evidenceRef: pay.evidenceRef, amountMinor: pay.amountMinor }) }) : l);
  return freeze({ ok: true, schedule: freeze({ ...s, lines: freeze(lines) }) });
}

/** outstandingMinor(schedule) -> sum of non-PAID planned amounts. */
function outstandingMinor(schedule: any): number {
  const s = isObj(schedule) ? schedule : {};
  return (Array.isArray(s.lines) ? s.lines : []).filter((l: any) => l.status !== "PAID").reduce((n: number, l: any) => n + (isInt(l.amountMinor) ? l.amountMinor : 0), 0);
}

const BTP_INVOICE_SCHEDULE_CONTRACT = Object.freeze({
  id: "V319-BTP-INVOICE-SCHEDULE",
  purpose: "§7 — derive an acompte/invoice schedule from a fully-approved quote; exact-sum amounts; payments owner-gated, never auto-charged",
  reuses: Object.freeze(["odg-btp-quote-revision (revised SELLING basis; approval state)", "chantier-profitability (via the quote, budgetReviseMinor)"]),
  invariants: Object.freeze([
    "schedule only on a quote with NO pending revisions (fail-closed)",
    "percentBps must sum to EXACTLY 10000; line amounts sum EXACTLY to the basis (last line absorbs remainder, disclosed) — no fabricated cent",
    "every line starts PLANNED; markPaid is OWNER_GATED — requires ownerAuthorized + owner + evidenceRef + an EXACT amount; never auto-charged",
    "no partial/over payment accepted (exact match only); no double payment (ALREADY_PAID)",
    "PURE + deterministic + in-memory; no network/clock/randomness; builds no parallel finance engine",
  ]),
});

module.exports = { buildSchedule, markPaid, outstandingMinor, BTP_INVOICE_SCHEDULE_CONTRACT };
export {};
