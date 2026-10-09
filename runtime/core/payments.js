#!/usr/bin/env node
"use strict";

/*
 * PAYMENTS — governed, verification-first payment reconciliation.
 *
 * Only a provider notification whose HMAC signature verifies can advance an invoice's paid status (via
 * invoicing.applyPayment with verified:true). A browser redirect or a client claim is NEVER proof. Webhook
 * events are idempotent by provider eventId (replays/out-of-order are safe). Real OUTBOUND charge initiation
 * stays DISABLED unless explicitly configured+enabled. Card numbers / payment secrets are NEVER accepted or
 * stored. Secrets come from ENV only. Fail-closed; never throws on ordinary input.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const invoicing = require("./invoicing");

const EVENTS_DIR = "runtime/generated/clients/payments/events";
const STATE = Object.freeze({ NOT_CONFIGURED: "NOT_CONFIGURED", TEST_MODE: "TEST_MODE", READY: "READY", BLOCKED: "BLOCKED" });
const CODE = Object.freeze({
  UNAUTHENTICATED: "UNAUTHENTICATED", NOT_CONFIGURED: "NOT_CONFIGURED", MALFORMED_EVENT: "MALFORMED_EVENT",
  CARD_DATA_REFUSED: "CARD_DATA_REFUSED", INVOICE_NOT_FOUND: "INVOICE_NOT_FOUND", IGNORED_TYPE: "IGNORED_TYPE",
});

function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v) { return typeof v === "string" && v.trim().length > 0; }
function env_(o) { return o && isObj(o.env) ? o.env : process.env; }
function dir(cwd) { return path.resolve(cwd || process.cwd(), EVENTS_DIR); }
function evtPath(cwd, id) { return path.join(dir(cwd), crypto.createHash("sha256").update(String(id)).digest("hex").slice(0, 24) + ".json"); }
function readJson(f) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } }
function writeJson(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); }

function readiness(opts = {}) {
  const env = env_(opts);
  const configured = isStr(env.PAYMENT_PROVIDER) && isStr(env.PAYMENT_WEBHOOK_SECRET);
  if (!configured) return Object.freeze({ state: STATE.NOT_CONFIGURED, provider: null, liveEnabled: false });
  const live = env.PAYMENT_LIVE_ENABLED === "1";
  return Object.freeze({ state: live ? STATE.READY : STATE.TEST_MODE, provider: env.PAYMENT_PROVIDER, liveEnabled: live });
}

// HMAC-SHA256(rawBody) compared timing-safely to the provided signature hex. Missing secret ⇒ false.
function verifySignature(rawBody, signature, opts = {}) {
  const secret = env_(opts).PAYMENT_WEBHOOK_SECRET;
  if (!isStr(secret) || !isStr(signature) || typeof rawBody !== "string") return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected); const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function hasCardData(obj) {
  const bad = /(^|_)(pan|card_?number|cardnumber|cvv|cvc|card_?secret)($|_)/i;
  const scan = (o) => Object.keys(o || {}).some((k) => bad.test(k) || (isObj(o[k]) && scan(o[k])));
  return isObj(obj) && scan(obj);
}

/**
 * handleWebhook({rawBody, signature, env, cwd}) — authenticate, parse, dedupe by eventId, and (only for a
 * verified payment_succeeded) advance the matching invoice via invoicing.applyPayment(verified:true).
 */
function handleWebhook(opts = {}) {
  const cwd = opts.cwd;
  const ready = readiness(opts);
  if (ready.state === STATE.NOT_CONFIGURED) return Object.freeze({ ok: false, code: CODE.NOT_CONFIGURED });
  if (!verifySignature(opts.rawBody, opts.signature, opts)) return Object.freeze({ ok: false, code: CODE.UNAUTHENTICATED });
  let evt; try { evt = JSON.parse(opts.rawBody); } catch { return Object.freeze({ ok: false, code: CODE.MALFORMED_EVENT }); }
  if (!isObj(evt) || !isStr(evt.eventId) || !isStr(evt.type)) return Object.freeze({ ok: false, code: CODE.MALFORMED_EVENT });
  if (hasCardData(evt)) return Object.freeze({ ok: false, code: CODE.CARD_DATA_REFUSED }); // never persisted
  // Idempotency / replay: same eventId already processed ⇒ no-op.
  const ep = evtPath(cwd, evt.eventId);
  const prior = readJson(ep);
  if (prior) return Object.freeze({ ok: true, idempotent: true, eventId: evt.eventId, result: prior.result });
  if (evt.type !== "payment_succeeded") {
    writeJson(ep, { eventId: evt.eventId, type: evt.type, at: new Date().toISOString(), result: { ignored: true } });
    return Object.freeze({ ok: true, eventId: evt.eventId, code: CODE.IGNORED_TYPE });
  }
  const invId = isStr(evt.invoiceId) ? evt.invoiceId : (isStr(evt.invoiceNumber) ? (invoicing.list({ cwd }).find((i) => i.number === evt.invoiceNumber) || {}).id : null);
  // The referenced invoice must actually exist — an unknown id/number is rejected (not forwarded).
  if (!isStr(invId) || !invoicing.get(invId, { cwd })) { writeJson(ep, { eventId: evt.eventId, result: { code: CODE.INVOICE_NOT_FOUND } }); return Object.freeze({ ok: false, code: CODE.INVOICE_NOT_FOUND }); }
  const applied = invoicing.applyPayment(invId, { amount: evt.amount, verified: true, reference: evt.reference || evt.eventId }, { cwd });
  // Persist the processed event (no card data, no secrets) so replays are idempotent.
  writeJson(ep, { eventId: evt.eventId, type: evt.type, invoiceId: invId, amount: evt.amount, reference: evt.reference || evt.eventId, mode: ready.state, at: new Date().toISOString(), result: applied });
  return Object.freeze({ ok: applied.ok === true, eventId: evt.eventId, invoiceId: invId, result: applied });
}

module.exports = { STATE, CODE, readiness, verifySignature, handleWebhook };

if (require.main === module) { process.stdout.write(JSON.stringify({ payments: readiness({}) }, null, 2) + "\n"); }
