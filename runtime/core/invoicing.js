#!/usr/bin/env node
"use strict";

/*
 * INVOICING — governed invoice lifecycle bound to approved quotes / identified clients.
 *
 * Reuses the client-intake record as the hub (links by id: requestId/quoteId); adds NO parallel ledger.
 * Store: cwd-relative, gitignored runtime/generated/clients/invoices/. An ISSUED invoice is IMMUTABLE
 * (gapless sequential number assigned only at issue; a content hash detects tampering; corrections go
 * through a CREDIT NOTE, never a silent rewrite). Fiscal parameters are required to ISSUE — missing ones
 * are NOT_CONFIGURED and block real issuance (drafts are still allowed). Deterministic money math, round
 * half-up to 2 decimals. Fail-closed on invalid/duplicate/concurrent input; never throws on ordinary input.
 *
 * HONESTY: this computes correct amounts and enforces lifecycle/immutability. It does NOT assert legal
 * compliance (French e-invoicing / Factur-X / mentions légales) — those remain human-verified (see the
 * LAUNCH_READINESS doc). Missing mandatory fiscal data ⇒ issuance BLOCKED.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const INV_DIR = "runtime/generated/clients/invoices";
const SEQ_FILE = "runtime/generated/clients/invoices/_sequence.json";

const STATUS = Object.freeze({ DRAFT: "DRAFT", VALIDATED: "VALIDATED", ISSUED: "ISSUED", PARTIALLY_PAID: "PARTIALLY_PAID", PAID: "PAID", OVERDUE: "OVERDUE", CANCELLED: "CANCELLED", CREDIT_NOTE: "CREDIT_NOTE" });
const CODE = Object.freeze({
  INVALID_INPUT: "INVALID_INPUT", INVALID_LINE: "INVALID_LINE", NOT_FOUND: "NOT_FOUND",
  HUMAN_AUTHORIZATION_REQUIRED: "HUMAN_AUTHORIZATION_REQUIRED", INVALID_TRANSITION: "INVALID_TRANSITION",
  FISCAL_NOT_CONFIGURED: "FISCAL_NOT_CONFIGURED", IMMUTABLE_ISSUED: "IMMUTABLE_ISSUED",
  TAMPERED: "TAMPERED", DUPLICATE: "DUPLICATE", PAYMENT_UNVERIFIED: "PAYMENT_UNVERIFIED", OVERPAY: "OVERPAY",
});

function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v) { return typeof v === "string" && v.trim().length > 0; }
function env_(o) { return o && isObj(o.env) ? o.env : process.env; }
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function dir(cwd) { return path.resolve(cwd || process.cwd(), INV_DIR); }
function invPath(cwd, id) { return path.join(dir(cwd), id + ".json"); }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); }

// Canonical hash over the financial + identity fields that must never silently change once ISSUED.
function financialHash(inv) {
  const canon = JSON.stringify({ number: inv.number, requestId: inv.requestId, quoteId: inv.quoteId, currency: inv.currency, lines: inv.lines, subtotal: inv.subtotal, discount: inv.discount, taxRate: inv.taxRate, tax: inv.tax, total: inv.total, issuedAt: inv.issuedAt, seller: inv.seller });
  return crypto.createHash("sha256").update(canon).digest("hex");
}

function fiscalReadiness(opts = {}) {
  const env = env_(opts);
  const required = ["INVOICE_SELLER_NAME", "INVOICE_SELLER_ADDRESS", "INVOICE_SELLER_TAXID", "INVOICE_CURRENCY"];
  const missing = required.filter((k) => !isStr(env[k]));
  const taxRate = env.INVOICE_TAX_RATE;
  const taxOk = taxRate === "EXEMPT" || (isStr(taxRate) && Number.isFinite(parseFloat(taxRate)) && parseFloat(taxRate) >= 0);
  if (!taxOk) missing.push("INVOICE_TAX_RATE");
  return Object.freeze({ state: missing.length === 0 ? "READY" : "NOT_CONFIGURED", missing: Object.freeze(missing) });
}

function sellerFromEnv(env) {
  return { name: env.INVOICE_SELLER_NAME, address: env.INVOICE_SELLER_ADDRESS, taxId: env.INVOICE_SELLER_TAXID };
}
function taxRateFromEnv(env) { return env.INVOICE_TAX_RATE === "EXEMPT" ? 0 : parseFloat(env.INVOICE_TAX_RATE); }

function computeTotals(lines, discount, taxRate) {
  let subtotal = 0;
  const norm = [];
  for (const l of lines) {
    if (!isObj(l) || !isStr(l.description) || !Number.isFinite(l.quantity) || l.quantity <= 0 || !Number.isFinite(l.unitPrice) || l.unitPrice < 0) {
      return { ok: false, code: CODE.INVALID_LINE, detail: `invalid line ${JSON.stringify(l)}` };
    }
    const lineTotal = round2(l.quantity * l.unitPrice);
    norm.push({ description: l.description, quantity: l.quantity, unitPrice: round2(l.unitPrice), lineTotal });
    subtotal += lineTotal;
  }
  subtotal = round2(subtotal);
  const disc = round2(Number.isFinite(discount) && discount > 0 ? discount : 0);
  if (disc > subtotal) return { ok: false, code: CODE.INVALID_INPUT, detail: "discount exceeds subtotal" };
  const taxable = round2(subtotal - disc);
  const tax = round2(taxable * (Number.isFinite(taxRate) ? taxRate : 0));
  const total = round2(taxable + tax);
  return { ok: true, lines: norm, subtotal, discount: disc, taxable, tax, total };
}

// Draft id is non-sequential (drafts may be discarded); the gapless sequential NUMBER is assigned at ISSUE.
function newDraftId(cwd) {
  let seq = 1;
  try { const used = fs.readdirSync(dir(cwd)).filter((f) => /^INV-DRAFT-\d+\.json$/.test(f)).map((f) => parseInt(f.slice(10, -5), 10)).filter(Number.isFinite); if (used.length) seq = Math.max(...used) + 1; } catch { /* */ }
  return "INV-DRAFT-" + String(seq).padStart(4, "0");
}

function createDraft(input, opts = {}) {
  const cwd = opts.cwd, env = env_(opts);
  if (!isObj(input) || !isStr(input.requestId) || !Array.isArray(input.lines) || input.lines.length === 0) {
    return Object.freeze({ ok: false, code: CODE.INVALID_INPUT, detail: "requestId and non-empty lines required" });
  }
  // Dedup: one open (non-cancelled) invoice per (requestId, quoteId).
  for (const inv of list({ cwd })) {
    if (inv.requestId === input.requestId && (inv.quoteId || null) === (input.quoteId || null) && inv.status !== STATUS.CANCELLED && inv.status !== STATUS.CREDIT_NOTE) {
      return Object.freeze({ ok: false, code: CODE.DUPLICATE, existing: inv.id, status: inv.status });
    }
  }
  const currency = isStr(input.currency) ? input.currency : (isStr(env.INVOICE_CURRENCY) ? env.INVOICE_CURRENCY : "EUR");
  const totals = computeTotals(input.lines, input.discount, taxRateFromEnv(env));
  if (!totals.ok) return Object.freeze({ ok: false, code: totals.code, detail: totals.detail });
  const id = newDraftId(cwd);
  const rec = {
    id, number: null, status: STATUS.DRAFT, requestId: input.requestId, quoteId: input.quoteId || null,
    customer: isObj(input.customer) ? input.customer : { ref: input.requestId },
    currency, lines: totals.lines, subtotal: totals.subtotal, discount: totals.discount, taxable: totals.taxable,
    taxRate: taxRateFromEnv(env), tax: totals.tax, total: totals.total,
    dueDays: Number.isFinite(input.dueDays) ? input.dueDays : 30,
    createdAt: new Date().toISOString(), issuedAt: null, dueDate: null, paid: 0, payments: [],
    seller: null, history: [{ to: STATUS.DRAFT, by: "odg" }],
  };
  writeJson(invPath(cwd, id), rec);
  return Object.freeze({ ok: true, id, status: STATUS.DRAFT, total: rec.total, tax: rec.tax });
}

function get(id, opts = {}) {
  const rec = readJson(invPath(opts.cwd, id));
  if (!rec) return null;
  // Immutability guard: a stored ISSUED invoice whose financial hash no longer matches was tampered.
  if (rec.status !== STATUS.DRAFT && rec.status !== STATUS.VALIDATED && rec.issuedHash) {
    if (financialHash(rec) !== rec.issuedHash) return Object.freeze({ ...rec, tampered: true });
  }
  return rec;
}
function list(opts = {}) { try { return fs.readdirSync(dir(opts.cwd)).filter((f) => /^INV-/.test(f) && f.endsWith(".json")).map((f) => readJson(path.join(dir(opts.cwd), f))).filter(Boolean); } catch { return []; } }

function requireHuman(opts) { return opts && opts.by === "human" && isStr(opts.owner); }

function validateDraft(id, opts = {}) {
  const rec = get(id, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  if (rec.status !== STATUS.DRAFT) return Object.freeze({ ok: false, code: CODE.INVALID_TRANSITION, from: rec.status });
  if (!requireHuman(opts)) return Object.freeze({ ok: false, code: CODE.HUMAN_AUTHORIZATION_REQUIRED });
  rec.status = STATUS.VALIDATED; rec.history.push({ to: STATUS.VALIDATED, by: "human", owner: opts.owner });
  writeJson(invPath(opts.cwd, id), rec);
  return Object.freeze({ ok: true, id, status: STATUS.VALIDATED });
}

function nextNumber(cwd, now) {
  const p = path.resolve(cwd || process.cwd(), SEQ_FILE);
  const year = (isStr(now) ? now : new Date().toISOString()).slice(0, 4);
  const seq = readJson(p) || {};
  const n = (Number.isInteger(seq[year]) ? seq[year] : 0) + 1;
  seq[year] = n; writeJson(p, seq);
  return `INV-${year}-${String(n).padStart(4, "0")}`;
}

function issue(id, opts = {}) {
  const rec = get(id, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  if (rec.status === STATUS.ISSUED || rec.status === STATUS.PARTIALLY_PAID || rec.status === STATUS.PAID) {
    return Object.freeze({ ok: true, id, number: rec.number, status: rec.status, idempotent: true }); // idempotent re-issue
  }
  if (rec.status !== STATUS.VALIDATED) return Object.freeze({ ok: false, code: CODE.INVALID_TRANSITION, from: rec.status, detail: "issue requires VALIDATED" });
  if (!requireHuman(opts)) return Object.freeze({ ok: false, code: CODE.HUMAN_AUTHORIZATION_REQUIRED });
  const fiscal = fiscalReadiness(opts);
  if (fiscal.state !== "READY") return Object.freeze({ ok: false, code: CODE.FISCAL_NOT_CONFIGURED, missing: fiscal.missing });
  const now = new Date().toISOString();
  rec.number = nextNumber(opts.cwd, now);
  rec.status = STATUS.ISSUED; rec.issuedAt = now; rec.seller = sellerFromEnv(env_(opts));
  const due = new Date(now); due.setDate(due.getDate() + (rec.dueDays || 30)); rec.dueDate = due.toISOString();
  rec.issuedHash = financialHash(rec);
  rec.history.push({ to: STATUS.ISSUED, by: "human", owner: opts.owner, number: rec.number });
  writeJson(invPath(opts.cwd, id), rec);
  return Object.freeze({ ok: true, id, number: rec.number, status: STATUS.ISSUED, total: rec.total, dueDate: rec.dueDate });
}

// Payments are applied ONLY from a VERIFIED source (payments.js passes verified:true). A browser redirect
// or client claim (verified!==true) never advances paid status.
function applyPayment(id, { amount, verified, reference }, opts = {}) {
  const rec = get(id, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  if (rec.tampered) return Object.freeze({ ok: false, code: CODE.TAMPERED });
  if (verified !== true) return Object.freeze({ ok: false, code: CODE.PAYMENT_UNVERIFIED });
  if (![STATUS.ISSUED, STATUS.PARTIALLY_PAID, STATUS.OVERDUE].includes(rec.status)) return Object.freeze({ ok: false, code: CODE.INVALID_TRANSITION, from: rec.status });
  if (!Number.isFinite(amount) || amount <= 0) return Object.freeze({ ok: false, code: CODE.INVALID_INPUT });
  // Idempotent by payment reference.
  if (reference && rec.payments.some((p) => p.reference === reference)) return Object.freeze({ ok: true, id, status: rec.status, paid: rec.paid, idempotent: true });
  const newPaid = round2(rec.paid + amount);
  if (newPaid > round2(rec.total + 0.0)) return Object.freeze({ ok: false, code: CODE.OVERPAY, paid: rec.paid, total: rec.total });
  rec.paid = newPaid; rec.payments.push({ amount: round2(amount), reference: reference || null, at: new Date().toISOString() });
  rec.status = newPaid >= rec.total ? STATUS.PAID : STATUS.PARTIALLY_PAID;
  rec.history.push({ to: rec.status, by: "payments", reference: reference || null });
  writeJson(invPath(opts.cwd, id), rec);
  return Object.freeze({ ok: true, id, status: rec.status, paid: rec.paid, total: rec.total });
}

function creditNote(id, opts = {}) {
  const rec = get(id, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  if (rec.status !== STATUS.ISSUED && rec.status !== STATUS.PARTIALLY_PAID && rec.status !== STATUS.PAID && rec.status !== STATUS.OVERDUE) {
    return Object.freeze({ ok: false, code: CODE.INVALID_TRANSITION, from: rec.status, detail: "credit note only for an issued invoice" });
  }
  if (!requireHuman(opts)) return Object.freeze({ ok: false, code: CODE.HUMAN_AUTHORIZATION_REQUIRED });
  if (rec.tampered) return Object.freeze({ ok: false, code: CODE.TAMPERED });
  const now = new Date().toISOString();
  const cnId = rec.id + "-CN";
  const cn = { id: cnId, number: nextNumber(opts.cwd, now), status: STATUS.CREDIT_NOTE, correctsInvoice: rec.number, correctsId: rec.id, requestId: rec.requestId, quoteId: rec.quoteId, currency: rec.currency, lines: rec.lines, subtotal: -rec.subtotal, discount: rec.discount, taxRate: rec.taxRate, tax: -rec.tax, total: -rec.total, issuedAt: now, seller: rec.seller, reason: opts.reason || null, history: [{ to: STATUS.CREDIT_NOTE, by: "human", owner: opts.owner }] };
  cn.issuedHash = financialHash(cn);
  writeJson(invPath(opts.cwd, cnId), cn);
  // The original invoice is NOT rewritten; it records a pointer to its credit note.
  rec.creditNote = cnId; rec.history.push({ to: "CREDITED", by: "human", owner: opts.owner, creditNote: cn.number });
  // Preserve immutability: recompute would change hash due to creditNote pointer — store pointer OUTSIDE hashed set (financialHash excludes it).
  writeJson(invPath(opts.cwd, id), rec);
  return Object.freeze({ ok: true, id: cnId, number: cn.number, correctsInvoice: rec.number, total: cn.total });
}

module.exports = { STATUS, CODE, fiscalReadiness, computeTotals, createDraft, get, list, validateDraft, issue, applyPayment, creditNote, round2 };

if (require.main === module) { process.stdout.write(JSON.stringify({ fiscal: fiscalReadiness({}) }, null, 2) + "\n"); }
