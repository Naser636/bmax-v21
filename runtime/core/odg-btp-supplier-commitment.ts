#!/usr/bin/env node
"use strict";
/*
 * BTP SUPPLIER / SUBCONTRACTOR ENGAGEMENT-DOCUMENT LIFECYCLE (bon de commande fournisseur / contrat de sous-traitance).
 * PURE, deterministic, integer minor-unit (centimes), fail-closed, deny-by-default.
 *
 * THE GAP (reconciled, not duplicated): the CLIENT side has a full document lifecycle — odg-btp-client-intake →
 * odg-btp-quote-revision → odg-btp-invoice-schedule. The SUPPLIER/SUBCONTRACTOR side had NO engagement document: only a
 * raw numeric `{id, amountMinor, invoiced}` commitment fed into chantier-profitability.computeChantier. This builds that
 * missing procurement counterpart and EMITS the exact commitment record computeChantier already consumes (no new cost
 * model; it FEEDS the canonical engine). It does NOT re-implement chantier accounting (engagements / COMMANDE_DEPASSEE /
 * reconciliation already live there); it adds the document + the governance controls raw numbers lack.
 *
 * Governance mirror of the client side:
 *  - amounts require SOURCED unit prices (qty + unitPriceMinor + priceSource) — fail-closed, a price is NEVER invented;
 *  - a commitment is a COST ENGAGEMENT, NEVER revenue/margin (SELLING≠COST);
 *  - retenue de garantie (subcontractor retention) is modelled: net payable = gross − retention; retention is HELD, not
 *    paid, and released ONLY by an owner action (never auto);
 *  - issuance to the supplier is ALWAYS OWNER_GATED (mirrors the client send-gate); DRAFT ≠ ISSUED; no auto-approval;
 *  - committed ≠ spent ≠ invoiced; integer-overflow guarded. No network/clock/randomness.
 */

const KINDS = Object.freeze(["PURCHASE_ORDER", "SUBCONTRACT"]); // bon de commande fournisseur | contrat de sous-traitance

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isBps(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 10000; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * buildCommitment(input) -> frozen DRAFT engagement document.
 * input = { id, chantierId, kind, supplier, currency?, retentionBps?, lineItems:[{ ref?, label?, qty, unit?, unitPriceMinor, priceSource }] }
 * Fail-closed: missing id/chantier/supplier, bad kind, bad retentionBps, no lines ⇒ ok:false; any line lacking
 * qty + unitPriceMinor + priceSource (or overflowing) ⇒ that line is INCOMPLETE and the document is NOT_ENGAGEABLE
 * (amount withheld — a price is NEVER invented). SUBCONTRACT retention defaults to 0 but may be set (≤100%).
 */
function buildCommitment(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.id)) return freeze({ ok: false, code: "NO_ID" });
  if (!isStr(i.chantierId)) return freeze({ ok: false, code: "NO_CHANTIER" });
  if (!isStr(i.supplier)) return freeze({ ok: false, code: "NO_SUPPLIER" });
  if (!KINDS.includes(i.kind)) return freeze({ ok: false, code: "BAD_KIND", detail: `kind must be one of ${KINDS.join("|")}` });
  const retentionBps = i.retentionBps === undefined ? 0 : i.retentionBps;
  if (!isBps(retentionBps)) return freeze({ ok: false, code: "BAD_RETENTION", detail: "retentionBps must be an integer 0..10000" });
  if (i.kind === "PURCHASE_ORDER" && retentionBps !== 0) return freeze({ ok: false, code: "RETENTION_ON_PO", detail: "retenue de garantie applies to SUBCONTRACT only, not a purchase order" });
  const currency = isStr(i.currency) ? i.currency : "EUR";
  const rawLines = Array.isArray(i.lineItems) ? i.lineItems.filter(isObj) : [];
  if (!rawLines.length) return freeze({ ok: false, code: "NO_LINES" });

  const lines = rawLines.map((r: any, idx: number) => {
    const qty = isNonNegInt(r.qty) ? r.qty : null;
    const hasSourcedPrice = isNonNegInt(r.unitPriceMinor) && isStr(r.priceSource); // fail-closed: price AND its source
    const raw = qty !== null && hasSourcedPrice ? qty * r.unitPriceMinor : null;
    const overflow = raw !== null && !Number.isSafeInteger(raw);
    const complete = raw !== null && !overflow;
    const missing = complete ? null : qty === null ? "qty" : !isNonNegInt(r.unitPriceMinor) ? "unitPriceMinor" : !isStr(r.priceSource) ? "priceSource" : "overflow";
    return freeze({ ref: isStr(r.ref) ? r.ref : "L" + (idx + 1), label: isStr(r.label) ? r.label : null, qty, unit: isStr(r.unit) ? r.unit : null,
      priceSource: isStr(r.priceSource) ? r.priceSource : null, status: complete ? "PRICED" : "INCOMPLETE", missing, amountMinor: complete ? raw : null });
  });

  const allPriced = lines.every((l: any) => l.status === "PRICED");
  const grossMinor = allPriced ? lines.reduce((n: number, l: any) => n + l.amountMinor, 0) : null;
  const grossOverflow = grossMinor !== null && !Number.isSafeInteger(grossMinor);
  const engageable = allPriced && !grossOverflow;
  // retenue de garantie: held back from gross; net payable now = gross − retention. Retention is HELD, released by owner later.
  const retentionMinor = engageable ? Math.round((grossMinor * retentionBps) / 10000) : null;
  const netPayableMinor = engageable ? grossMinor - retentionMinor : null;

  return freeze({
    ok: true, id: i.id, chantierId: i.chantierId, kind: i.kind, supplier: i.supplier, currency,
    status: engageable ? "DRAFT" : "NOT_ENGAGEABLE",              // DRAFT ≠ ISSUED; NOT_ENGAGEABLE if any price unsourced
    lineItems: freeze(lines),
    grossMinor, retentionBps, retentionMinor, netPayableMinor,     // COST engagement figures (never revenue/margin)
    classification: "COST_ENGAGEMENT",                             // SELLING≠COST: this is never CA/marge
    issue: freeze({ gate: "OWNER_GATED", issued: false, note: "issuance of a supplier/subcontract order is ALWAYS owner-gated — never auto-issued" }),
    retentionReleased: false,                                      // released only by an owner action (never auto)
    reasons: freeze(engageable ? [] : ["one or more lines lack qty + unitPriceMinor + priceSource (or overflow) — amount withheld, a price is NEVER invented"]),
  });
}

/**
 * issueReadiness(commitment, auth?) -> readiness to issue the order to the supplier. ALWAYS owner-gated; returns a
 * decision object, NEVER performs an issue. Issue proceeds only if engageable AND auth = { ownerAuthorized:true, owner, evidenceRef }.
 */
function issueReadiness(commitment: any, auth: any): any {
  if (!isObj(commitment) || commitment.ok !== true) return freeze({ ok: false, code: "BAD_COMMITMENT" });
  if (commitment.status !== "DRAFT") return freeze({ ok: true, readyToIssue: false, gate: "BLOCKED", reason: `status is ${commitment.status} — only a DRAFT (fully sourced) engagement may be issued` });
  const a = isObj(auth) ? auth : {};
  const authorized = a.ownerAuthorized === true && isStr(a.owner) && isStr(a.evidenceRef);
  return freeze({ ok: true, readyToIssue: authorized, gate: "OWNER_GATED",
    owner: authorized ? a.owner : null, evidenceRef: authorized ? a.evidenceRef : null,
    reason: authorized ? "owner-authorized with evidence — issuance may proceed (performed by the owner-gated send seam, not here)" : "issuance requires ownerAuthorized=true + owner + evidenceRef — never auto-issued" });
}

/**
 * toChantierCommitment(commitment) -> the exact record chantier-profitability.computeChantier consumes
 * ({ id, amountMinor, invoiced, supplier, chantierId }). Only an engageable DRAFT yields a record (fail-closed).
 * This is the integration seam: it FEEDS the canonical cost engine; it does NOT compute chantier figures itself.
 */
function toChantierCommitment(commitment: any): any {
  if (!isObj(commitment) || commitment.ok !== true || commitment.status !== "DRAFT") return freeze({ ok: false, code: "NOT_ENGAGEABLE" });
  return freeze({ ok: true, commitment: freeze({ id: commitment.id, amountMinor: commitment.grossMinor, invoiced: false, supplier: commitment.supplier, chantierId: commitment.chantierId }) });
}

/**
 * reconcileReadiness(commitment, expenses) -> single-commitment view of committed vs incurred (expenses tagged with
 * this commitmentId). DETERMINISTIC/READ-ONLY. Flags OVER_COMMITMENT consistent with computeChantier's COMMANDE_DEPASSEE
 * (spend > committed). It reports; it does not mutate or approve. committed ≠ spent ≠ invoiced.
 */
function reconcileReadiness(commitment: any, expenses: any): any {
  if (!isObj(commitment) || commitment.ok !== true || !isNonNegInt(commitment.grossMinor)) return freeze({ ok: false, code: "BAD_COMMITMENT" });
  const list = Array.isArray(expenses) ? expenses.filter((e: any) => isObj(e) && e.commitmentId === commitment.id && isNonNegInt(e.amountMinor)) : [];
  const spentMinor = list.reduce((n: number, e: any) => n + e.amountMinor, 0);
  const committedMinor = commitment.grossMinor;
  const overCommitment = spentMinor > committedMinor;
  return freeze({ ok: true, commitmentId: commitment.id, committedMinor, spentMinor,
    remainingMinor: committedMinor - spentMinor, overCommitment,
    overByMinor: overCommitment ? spentMinor - committedMinor : 0, expenseCount: list.length,
    note: "READ-ONLY view; OVER_COMMITMENT mirrors chantier-profitability COMMANDE_DEPASSEE (spend>committed); committed≠spent≠invoiced" });
}

const SUPPLIER_COMMITMENT_CONTRACT = Object.freeze({
  id: "BTP-SUPPLIER-COMMITMENT",
  purpose: "supplier/subcontractor engagement-document lifecycle (bon de commande / sous-traitance) — the procurement counterpart to the client intake/quote/invoice stack; feeds chantier-profitability.computeChantier",
  reuses: Object.freeze(["chantier-profitability.computeChantier commitment shape {id,amountMinor,invoiced} + COMMANDE_DEPASSEE rule", "odg-btp-client-intake sourced-price fail-closed pattern"]),
  invariants: Object.freeze([
    "amounts require qty + unitPriceMinor + priceSource — a price is NEVER invented (fail-closed ⇒ NOT_ENGAGEABLE)",
    "a commitment is a COST_ENGAGEMENT — NEVER revenue/margin (SELLING≠COST)",
    "retenue de garantie (SUBCONTRACT only) is HELD not paid; released ONLY by an owner action — never auto",
    "issuance to the supplier is ALWAYS OWNER_GATED (ownerAuthorized+owner+evidenceRef); DRAFT ≠ ISSUED; no auto-approval",
    "toChantierCommitment FEEDS the canonical cost engine; it does NOT re-implement chantier accounting (no 2nd cost model)",
    "committed ≠ spent ≠ invoiced; integer minor-unit, overflow-guarded; PURE/deterministic; no network/clock/randomness",
  ]),
});

module.exports = { KINDS, buildCommitment, issueReadiness, toChantierCommitment, reconcileReadiness, SUPPLIER_COMMITMENT_CONTRACT };
export {};
