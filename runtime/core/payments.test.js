#!/usr/bin/env node
"use strict";
/* PAYMENTS — HMAC auth, idempotent webhooks, verified-only advance, card refusal. Offline, cwd/env isolated. */
const fs = require("fs"); const os = require("os"); const path = require("path"); const crypto = require("crypto"); const assert = require("assert");
const P = require(path.resolve(__dirname, "payments.js"));
const I = require(path.resolve(__dirname, "invoicing.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "pay-")); }
const FISCAL = { INVOICE_SELLER_NAME: "ODG", INVOICE_SELLER_ADDRESS: "Paris", INVOICE_SELLER_TAXID: "FR0", INVOICE_CURRENCY: "EUR", INVOICE_TAX_RATE: "0" };
const SECRET = "whsec_test_123";
const ENV = { PAYMENT_PROVIDER: "mockpay", PAYMENT_WEBHOOK_SECRET: SECRET };
const sign = (raw) => crypto.createHmac("sha256", SECRET).update(raw).digest("hex");
const H = { by: "human", owner: "cto" };

function issuedInvoice(cwd, total) {
  const d = I.createDraft({ requestId: "R1", lines: [{ description: "x", quantity: 1, unitPrice: total }] }, { cwd, env: FISCAL }).id;
  I.validateDraft(d, { cwd, ...H }); return I.issue(d, { cwd, env: FISCAL, ...H }); // {id, number}
}

// 1 — readiness states.
ok("1 no config ⇒ NOT_CONFIGURED", P.readiness({ env: {} }).state === "NOT_CONFIGURED");
ok("1 configured ⇒ TEST_MODE by default", P.readiness({ env: ENV }).state === "TEST_MODE");
ok("1 live only with PAYMENT_LIVE_ENABLED=1", P.readiness({ env: { ...ENV, PAYMENT_LIVE_ENABLED: "1" } }).state === "READY");
// 2 — signature verify.
ok("2 valid HMAC verifies", P.verifySignature("body", sign("body"), { env: ENV }) === true);
ok("2 wrong signature fails", P.verifySignature("body", "deadbeef", { env: ENV }) === false);
ok("2 missing secret fails", P.verifySignature("body", sign("body"), { env: {} }) === false);
// 3 — unauthenticated webhook rejected (never touches invoice).
{
  const cwd = tmp(); const inv = issuedInvoice(cwd, 100);
  const raw = JSON.stringify({ eventId: "e1", type: "payment_succeeded", invoiceId: inv.id, amount: 100 });
  ok("3 bad signature ⇒ UNAUTHENTICATED", P.handleWebhook({ cwd, env: ENV, rawBody: raw, signature: "bad" }).code === P.CODE.UNAUTHENTICATED);
  ok("3 invoice NOT advanced", I.get(inv.id, { cwd }).status === I.STATUS.ISSUED);
}
// 4 — card data refused.
{
  const cwd = tmp(); const inv = issuedInvoice(cwd, 100);
  const raw = JSON.stringify({ eventId: "e1", type: "payment_succeeded", invoiceId: inv.id, amount: 100, card_number: "4111111111111111" });
  ok("4 payload with card_number ⇒ CARD_DATA_REFUSED", P.handleWebhook({ cwd, env: ENV, rawBody: raw, signature: sign(raw) }).code === P.CODE.CARD_DATA_REFUSED);
}
// 5 — malformed event.
{
  const cwd = tmp(); const raw = "{not json";
  ok("5 malformed ⇒ MALFORMED_EVENT", P.handleWebhook({ cwd, env: ENV, rawBody: raw, signature: sign(raw) }).code === P.CODE.MALFORMED_EVENT);
}
// 6 — valid verified payment advances invoice; replay idempotent.
{
  const cwd = tmp(); const inv = issuedInvoice(cwd, 100);
  const raw = JSON.stringify({ eventId: "evt-1", type: "payment_succeeded", invoiceId: inv.id, amount: 100, reference: "ref-1" });
  const r1 = P.handleWebhook({ cwd, env: ENV, rawBody: raw, signature: sign(raw) });
  ok("6 verified event ⇒ invoice PAID", r1.ok && I.get(inv.id, { cwd }).status === I.STATUS.PAID);
  const r2 = P.handleWebhook({ cwd, env: ENV, rawBody: raw, signature: sign(raw) });
  ok("6 replay same eventId ⇒ idempotent (no double)", r2.idempotent === true && I.get(inv.id, { cwd }).payments.length === 1);
}
// 7 — only a verified provider notification advances paid (no redirect/claim path exists).
{
  const cwd = tmp(); const inv = issuedInvoice(cwd, 100);
  ok("7 direct applyPayment verified:false never pays (defense in depth)", I.applyPayment(inv.id, { amount: 100, verified: false, reference: "z" }, { cwd }).code === I.CODE.PAYMENT_UNVERIFIED && I.get(inv.id, { cwd }).status === I.STATUS.ISSUED);
}
// 8 — unknown invoice reference.
{
  const cwd = tmp(); const raw = JSON.stringify({ eventId: "e9", type: "payment_succeeded", invoiceId: "INV-DRAFT-9999", amount: 10 });
  ok("8 unknown invoice ⇒ INVOICE_NOT_FOUND", P.handleWebhook({ cwd, env: ENV, rawBody: raw, signature: sign(raw) }).code === P.CODE.INVOICE_NOT_FOUND);
}
console.log(`\nPAYMENTS — ${passed} assertions passed.`);
