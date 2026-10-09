#!/usr/bin/env node
"use strict";

/*
 * QUOTE — governed quote generation from APPROVED data, bound to a client-intake request.
 *
 * Prices/scope/terms are caller-supplied (an operator's approved figures) — NEVER invented. Versioned.
 * External emission and client acceptance are HUMAN acts (deny-by-default); ODG never fabricates a
 * signature/acceptance. Totals reuse invoicing.computeTotals. Store cwd-relative + gitignored. Fail-closed.
 */

const fs = require("fs");
const path = require("path");
const invoicing = require("./invoicing");
const intake = require("./client-intake");

const Q_DIR = "runtime/generated/clients/quotes";
const STATUS = Object.freeze({ DRAFT: "DRAFT", APPROVED: "APPROVED", SENT: "SENT", ACCEPTED: "ACCEPTED", REJECTED: "REJECTED", EXPIRED: "EXPIRED", SUPERSEDED: "SUPERSEDED" });
const CODE = Object.freeze({ INVALID_INPUT: "INVALID_INPUT", REQUEST_NOT_FOUND: "REQUEST_NOT_FOUND", NOT_FOUND: "NOT_FOUND", HUMAN_AUTHORIZATION_REQUIRED: "HUMAN_AUTHORIZATION_REQUIRED", INVALID_TRANSITION: "INVALID_TRANSITION", EXPIRED: "EXPIRED", INVALID_LINE: "INVALID_LINE" });

function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v) { return typeof v === "string" && v.trim().length > 0; }
function dir(cwd) { return path.resolve(cwd || process.cwd(), Q_DIR); }
function qPath(cwd, id) { return path.join(dir(cwd), id + ".json"); }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); }
function requireHuman(o) { return o && o.by === "human" && isStr(o.owner); }
function newId(cwd) { let s = 1; try { const u = fs.readdirSync(dir(cwd)).filter((f) => /^QUOTE-\d+\.json$/.test(f)).map((f) => parseInt(f.slice(6, -5), 10)).filter(Number.isFinite); if (u.length) s = Math.max(...u) + 1; } catch { /* */ } return "QUOTE-" + String(s).padStart(3, "0"); }

function createQuote(input, opts = {}) {
  const cwd = opts.cwd;
  if (!isObj(input) || !isStr(input.requestId) || !Array.isArray(input.lines) || input.lines.length === 0) return Object.freeze({ ok: false, code: CODE.INVALID_INPUT, detail: "requestId + non-empty lines required" });
  if (!intake.get(input.requestId, { cwd })) return Object.freeze({ ok: false, code: CODE.REQUEST_NOT_FOUND, requestId: input.requestId });
  const taxRate = Number.isFinite(input.taxRate) ? input.taxRate : 0;
  const totals = invoicing.computeTotals(input.lines, input.discount, taxRate);
  if (!totals.ok) return Object.freeze({ ok: false, code: CODE.INVALID_LINE, detail: totals.detail });
  const id = newId(cwd);
  const rec = { id, version: Number.isInteger(input.version) ? input.version : 1, status: STATUS.DRAFT, requestId: input.requestId, currency: isStr(input.currency) ? input.currency : "EUR", lines: totals.lines, subtotal: totals.subtotal, discount: totals.discount, taxRate, tax: totals.tax, total: totals.total, terms: isStr(input.terms) ? input.terms : null, validityDays: Number.isFinite(input.validityDays) ? input.validityDays : 30, createdAt: new Date().toISOString(), expiresAt: null, supersedes: input.supersedes || null, history: [{ to: STATUS.DRAFT, by: "odg" }] };
  writeJson(qPath(cwd, id), rec);
  return Object.freeze({ ok: true, id, version: rec.version, status: STATUS.DRAFT, total: rec.total });
}

function get(id, opts = {}) { return readJson(qPath(opts.cwd, id)); }
function list(opts = {}) { try { return fs.readdirSync(dir(opts.cwd)).filter((f) => /^QUOTE-\d+\.json$/.test(f)).map((f) => readJson(path.join(dir(opts.cwd), f))).filter(Boolean); } catch { return []; } }

function advance(id, to, opts, guard) {
  const rec = get(id, opts);
  if (!rec) return Object.freeze({ ok: false, code: CODE.NOT_FOUND });
  if (!requireHuman(opts)) return Object.freeze({ ok: false, code: CODE.HUMAN_AUTHORIZATION_REQUIRED, to });
  const g = guard(rec);
  if (g) return g;
  rec.status = to; rec.history.push({ to, by: "human", owner: opts.owner, reason: opts.reason || null });
  if (to === STATUS.SENT && !rec.expiresAt) { const e = new Date(); e.setDate(e.getDate() + (rec.validityDays || 30)); rec.expiresAt = e.toISOString(); }
  writeJson(qPath(opts.cwd, id), rec);
  return Object.freeze({ ok: true, id, status: to });
}

function approve(id, opts = {}) { return advance(id, STATUS.APPROVED, opts, (r) => r.status !== STATUS.DRAFT ? Object.freeze({ ok: false, code: CODE.INVALID_TRANSITION, from: r.status }) : null); }
function markSent(id, opts = {}) { return advance(id, STATUS.SENT, opts, (r) => r.status !== STATUS.APPROVED ? Object.freeze({ ok: false, code: CODE.INVALID_TRANSITION, from: r.status }) : null); }
function accept(id, opts = {}) {
  return advance(id, STATUS.ACCEPTED, opts, (r) => {
    if (r.status !== STATUS.SENT) return Object.freeze({ ok: false, code: CODE.INVALID_TRANSITION, from: r.status });
    if (r.expiresAt && new Date().toISOString() > r.expiresAt) return Object.freeze({ ok: false, code: CODE.EXPIRED, expiresAt: r.expiresAt });
    return null;
  });
}

module.exports = { STATUS, CODE, createQuote, get, list, approve, markSent, accept };

if (require.main === module) { process.stdout.write("quote module (governed)\n"); }
