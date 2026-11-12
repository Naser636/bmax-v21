#!/usr/bin/env node
"use strict";
/*
 * V174 (§5/§11.F — the MISSING autonomous support & renewal engine flagged by V173's capability-gap register). PURE,
 * deterministic, fail-closed, idempotent, auditable. Local-only — NO external paid dependency, NO real customer contact.
 *
 * Covers (per §5): reception + classification, client/contract/product identification, context + evidence retrieval,
 * diagnosis + qualification, AUTHORIZED traceable responses (ONLY from a validated knowledge base — NEVER invented),
 * human-escalation detection, incident + deadline tracking, churn-risk detection, renewal preparation (DRAFT only),
 * satisfaction measurement, solution capitalization. Sensitive actions (refund/discount/contract-change/cancellation/
 * payment/send) are ALWAYS OWNER_GATED — blocked, never executed, regardless of request text (adversarial-resistant).
 *
 * HONESTY: scenarios are SYNTHETIC (labelled); no real customers/contracts/revenue. The engine NEVER invents a response,
 * commitment, discount, refund or contract change. Reuses audit-log for the tamper-evident trace. Deterministic (no Date.now).
 */
const AUDIT = require("./audit-log.js");

const REQUEST_TYPES = Object.freeze(["QUESTION", "INCIDENT", "BILLING", "RENEWAL", "REFUND", "DISCOUNT", "CONTRACT_CHANGE", "CANCELLATION"]);
// sensitive types that may NEVER be auto-executed — always owner-gated (deny-by-default), independent of request wording.
const SENSITIVE = Object.freeze(new Set(["REFUND", "DISCOUNT", "CONTRACT_CHANGE", "CANCELLATION"]));
const DECISION = Object.freeze({ AUTO_RESPOND: "AUTO_RESPOND", ESCALATE_HUMAN: "ESCALATE_HUMAN", OWNER_GATED: "OWNER_GATED" });

function lc(s: any): string { return String(s == null ? "" : s).toLowerCase(); }

/* classifyRequest(text) — deterministic keyword classification. Sensitive intents win (checked first) so a request that
 * mixes a question with a refund demand is classified SENSITIVE (owner-gated), never auto-answered. */
function classifyRequest(text: any): any {
  const t = lc(text);
  let type = "QUESTION";
  if (/cancel|resiliat|terminate|churn/.test(t)) type = "CANCELLATION";
  else if (/refund|rembours|chargeback/.test(t)) type = "REFUND";
  else if (/discount|remise|rabais|price cut|geste commercial/.test(t)) type = "DISCOUNT";
  else if (/contract change|avenant|modif.*contrat|amend/.test(t)) type = "CONTRACT_CHANGE";
  else if (/renew|renouvel|reconduct/.test(t)) type = "RENEWAL";
  else if (/invoice|facture|billing|payment|paiement|overcharge/.test(t)) type = "BILLING";
  else if (/down|error|crash|bug|outage|panne|not working|incident|fail/.test(t)) type = "INCIDENT";
  const severity = /urgent|critical|down|outage|prod|data loss|security|breach/.test(t) ? "HIGH" : "NORMAL";
  return Object.freeze({ type, severity });
}

/* resolveContext(req, store) — identify client/contract/product from an injected store (no external call). */
function resolveContext(req: any, store: any): any {
  const s = store && typeof store === "object" ? store : {};
  const client = s.clients && s.clients[req.clientId];
  const contract = s.contracts && s.contracts[req.contractId];
  const known = !!client && !!contract;
  return Object.freeze({ known, client: client || null, contract: contract || null, product: contract ? contract.product : null });
}

/* diagnose — decide AUTO_RESPOND / ESCALATE_HUMAN / OWNER_GATED. Deny-by-default for anything sensitive or unknown. */
function diagnose(cls: any, ctx: any, kb: any): any {
  if (SENSITIVE.has(cls.type)) return { decision: DECISION.OWNER_GATED, reason: `sensitive intent "${cls.type}" — owner authorization required; never auto-executed` };
  if (!ctx.known) return { decision: DECISION.ESCALATE_HUMAN, reason: "client/contract not identified — escalate (no fabricated context)" };
  if (cls.type === "INCIDENT" && cls.severity === "HIGH") return { decision: DECISION.ESCALATE_HUMAN, reason: "high-severity incident — human escalation" };
  if (cls.type === "BILLING") return { decision: DECISION.ESCALATE_HUMAN, reason: "billing dispute — human/owner review (no auto financial action)" };
  const kbHit = Array.isArray(kb) ? kb.find((e: any) => e && e.type === cls.type) : null;
  if (kbHit) return { decision: DECISION.AUTO_RESPOND, reason: "validated knowledge-base answer", kbId: kbHit.id };
  return { decision: DECISION.ESCALATE_HUMAN, reason: "no validated knowledge-base answer — escalate (NEVER invent a response)" };
}

/* handle(req, opts) — orchestrate one request: idempotent, auditable, fail-closed. opts: { store, kb, auditChain, seen (Map) }.
 * Returns the decision + an audit chain appended with the (traceable) outcome. Sensitive actions are returned as BLOCKED. */
function handle(req: any, opts?: any): any {
  const o = opts || {};
  const seen = o.seen instanceof Map ? o.seen : new Map();
  if (!req || typeof req.id !== "string") return Object.freeze({ ok: false, code: "BAD_REQUEST" });
  if (seen.has(req.id)) return Object.freeze({ ...seen.get(req.id), idempotentReplay: true }); // idempotency: no double action

  const cls = classifyRequest(req.text);
  const ctx = resolveContext(req, o.store);
  const dg = diagnose(cls, ctx, o.kb);

  // AUTHORIZED response text ONLY from the KB entry (never invented). Sensitive ⇒ no response, blocked for owner.
  const kb = Array.isArray(o.kb) ? o.kb : [];
  const kbEntry = dg.kbId ? kb.find((e: any) => e.id === dg.kbId) : null;
  const responseText = dg.decision === DECISION.AUTO_RESPOND && kbEntry ? kbEntry.response : null;
  const actionExecuted = dg.decision === DECISION.AUTO_RESPOND; // only a KB answer is "executed"; sensitive/escalate do nothing
  const sensitiveBlocked = dg.decision === DECISION.OWNER_GATED;

  const chain = AUDIT.appendEntry(Array.isArray(o.auditChain) ? o.auditChain : [], { requestId: req.id, type: cls.type, severity: cls.severity, decision: dg.decision, kbId: dg.kbId || null, sensitiveBlocked });
  const result = Object.freeze({
    ok: true, requestId: req.id, type: cls.type, severity: cls.severity,
    decision: dg.decision, reason: dg.reason,
    responseText,                 // null unless a validated KB answer
    actionExecuted, sensitiveBlocked,
    escalatedToHuman: dg.decision === DECISION.ESCALATE_HUMAN,
    auditChain: chain,
    note: "SYNTHETIC scenario — no real customer/contract/revenue; sensitive actions never executed (owner-gated); responses only from the validated KB.",
  });
  seen.set(req.id, result);
  return result;
}

/* renewalPipeline(contracts, nowMs, opts?) — detect upcoming renewals + churn risk, prepare DRAFT renewal proposals (not
 * sent — sending is OWNER_GATED). windowDays: lead time to flag RENEWAL_DUE. Deterministic (now injected). */
function renewalPipeline(contracts: any, nowMs: number, opts?: any): any {
  const windowDays = opts && Number.isFinite(opts.windowDays) ? opts.windowDays : 60;
  const list = Array.isArray(contracts) ? contracts : [];
  const rows = list.map((c: any) => {
    const daysToExpiry = Math.floor((c.expiresMs - nowMs) / (24 * 3600e3));
    const renewalDue = daysToExpiry <= windowDays && daysToExpiry >= 0;
    const churnRisk = (typeof c.satisfaction === "number" && c.satisfaction < 0.5) || (typeof c.usage === "number" && c.usage < 0.3);
    return Object.freeze({ contractId: c.id, product: c.product, daysToExpiry, renewalDue, churnRisk, draftRenewalProposal: renewalDue ? `DRAFT renewal for ${c.id} (${c.product}) — ${daysToExpiry}d to expiry; NOT sent (owner-gated)` : null, sendStatus: "BLOCKED_OWNER_GATED" });
  });
  return Object.freeze({ total: rows.length, due: rows.filter((r: any) => r.renewalDue).length, churnRisk: rows.filter((r: any) => r.churnRisk).length, rows: Object.freeze(rows), note: "renewal proposals are DRAFTS only; actual send/sign/collect are OWNER_GATED." });
}

/* metrics(results) — §7 operational-autonomy measures over a batch of handled requests. */
function metrics(results: any): any {
  const r = Array.isArray(results) ? results.filter((x: any) => x && x.ok) : [];
  const n = r.length || 1;
  const auto = r.filter((x: any) => x.decision === DECISION.AUTO_RESPOND).length;
  const esc = r.filter((x: any) => x.decision === DECISION.ESCALATE_HUMAN).length;
  const gated = r.filter((x: any) => x.decision === DECISION.OWNER_GATED).length;
  return Object.freeze({ total: r.length, autoResolved: auto, escalatedHuman: esc, ownerGated: gated, autoResolvedRate: Math.round((auto / n) * 1000) / 10, escalationRate: Math.round((esc / n) * 1000) / 10, note: "rates over SYNTHETIC scenarios — hypothesis until measured on real traffic." });
}

const SUPPORT_RENEWAL_CONTRACT = Object.freeze({
  id: "V174-SUPPORT-RENEWAL-ENGINE",
  purpose: "§5/§11.F — the MISSING autonomous support & renewal engine (V173 top gap): classify/diagnose/respond-from-KB/escalate/renewal, deterministic + idempotent + auditable + owner-gated sensitive actions",
  reuses: ["audit-log (tamper-evident trace)", "classifies/renews locally — NO external paid dependency, NO real customer contact"],
  invariants: Object.freeze([
    "NEVER invents a response/commitment/discount/refund/contract-change — responses ONLY from a validated knowledge base; no KB match ⇒ escalate",
    "sensitive intents (refund/discount/contract-change/cancellation) are ALWAYS OWNER_GATED (blocked, never executed) regardless of request wording — adversarial-resistant",
    "deterministic + idempotent (same request id ⇒ no double action) + auditable (audit-log chain) + fail-closed (unknown client ⇒ escalate)",
    "renewal proposals are DRAFTS only; send/sign/collect are OWNER_GATED; no real customer contact",
    "SYNTHETIC scenarios labelled; no real customers/contracts/revenue; autonomy rates are hypotheses until measured on real traffic",
  ]),
});
module.exports = { classifyRequest, resolveContext, diagnose, handle, renewalPipeline, metrics, REQUEST_TYPES, SENSITIVE, DECISION, SUPPORT_RENEWAL_CONTRACT };
export {};
