#!/usr/bin/env node
/**
 * p01-billing-sandbox — the realizable, SANDBOX-ONLY decomposition of `p01-billing-sandbox`. It drives a full billing
 * cycle for the P-01 offer — draft → validate → issue → (signed sandbox payment webhook) → reconcile to PAID — reusing
 * the EXISTING primitives (invoicing + payments) with NO new billing logic and NO new primitive. It proves the cycle is
 * idempotent (event replay is a no-op), refuses card data, and runs ONLY in a payment TEST_MODE: it hard-refuses to run
 * if live payments are enabled (PAYMENT_LIVE_ENABLED=1), so it can NEVER initiate a real charge.
 *
 * Everything is confined to an injected `cwd` (a temp dir in tests / CLI) — no repo writes, no network, no real
 * provider/account. This closes the "sandbox invoice→payment→reconcile, idempotent, no prod charges" acceptance.
 */
"use strict";

const crypto = require("crypto");
const invoicing = require("./invoicing.js");
const payments = require("./payments.js");

// Sandbox env: valid fiscal config + a TEST-MODE payment provider (provider + webhook secret set, LIVE NOT enabled).
function sandboxEnv(overrides: any = {}): any {
  return {
    INVOICE_SELLER_NAME: "ODG Sandbox",
    INVOICE_SELLER_ADDRESS: "1 Test Street, Testville",
    INVOICE_SELLER_TAXID: "SANDBOX-TAXID",
    INVOICE_CURRENCY: "EUR",
    INVOICE_TAX_RATE: "0.20",
    PAYMENT_PROVIDER: "sandbox",
    PAYMENT_WEBHOOK_SECRET: "sandbox-test-secret-not-a-real-key",
    // PAYMENT_LIVE_ENABLED intentionally unset ⇒ TEST_MODE.
    ...overrides,
  };
}

function sign(rawBody: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

/**
 * runSandboxCycle({ cwd, env, priceEur, requestId }): execute the sandbox billing cycle. Returns a structured report.
 * Fail-closed: refuses if live payments are enabled (never a real charge), and surfaces any step that does not advance.
 */
function runSandboxCycle(opts: any = {}): any {
  const env = sandboxEnv(opts.env || {});
  // HARD SAFETY: this is sandbox-only. If live payments are enabled, refuse outright (no real charge is ever initiated).
  if (env.PAYMENT_LIVE_ENABLED === "1") return { ok: false, code: "LIVE_REFUSED", reason: "p01-billing-sandbox runs ONLY in payment TEST_MODE; live payments are enabled — refusing to avoid any real charge" };
  const cwd = opts.cwd;
  if (typeof cwd !== "string" || !cwd) return { ok: false, code: "CWD_REQUIRED", reason: "an isolated cwd (temp dir) is required; the sandbox never writes to the repo" };
  const owner = "sandbox-owner";
  const by = "human"; // the sandbox operator stands in for the human authorizer; this is a TEST issuance only
  const price = Number.isFinite(opts.priceEur) && opts.priceEur > 0 ? opts.priceEur : 49;
  const requestId = typeof opts.requestId === "string" && opts.requestId ? opts.requestId : "p01-sandbox-req-1";

  const ready = payments.readiness({ env });
  if (ready.state !== payments.STATE.TEST_MODE) return { ok: false, code: "NOT_TEST_MODE", readiness: ready };

  // 1) draft → 2) validate → 3) issue (all confined to cwd).
  const draft = invoicing.createDraft({ requestId, lines: [{ description: "Code Health Check — P-01 (SANDBOX)", quantity: 1, unitPrice: price }] }, { cwd, env });
  if (!draft.ok) return { ok: false, step: "createDraft", result: draft };
  const val = invoicing.validateDraft(draft.id, { cwd, env, by, owner });
  if (!val.ok) return { ok: false, step: "validateDraft", result: val };
  const issued = invoicing.issue(draft.id, { cwd, env, by, owner });
  if (!issued.ok) return { ok: false, step: "issue", result: issued };

  // 4) signed sandbox payment webhook → reconcile to PAID.
  const total = issued.total;
  const evt = { eventId: "sandbox-evt-1", type: "payment_succeeded", invoiceNumber: issued.number, amount: total, reference: "sandbox-ref-1" };
  const rawBody = JSON.stringify(evt);
  const sig = sign(rawBody, env.PAYMENT_WEBHOOK_SECRET);
  const hook1 = payments.handleWebhook({ rawBody, signature: sig, env, cwd });
  if (!hook1.ok) return { ok: false, step: "handleWebhook", result: hook1 };
  const afterPay = invoicing.get(draft.id, { cwd });

  // 5) idempotency: replay the SAME event ⇒ no double-pay.
  const hook2 = payments.handleWebhook({ rawBody, signature: sig, env, cwd });
  const afterReplay = invoicing.get(draft.id, { cwd });

  // 6) card-data event ⇒ refused (never persisted).
  const cardEvt = JSON.stringify({ eventId: "sandbox-evt-card", type: "payment_succeeded", invoiceNumber: issued.number, amount: total, card_number: "4242424242424242" });
  const cardHook = payments.handleWebhook({ rawBody: cardEvt, signature: sign(cardEvt, env.PAYMENT_WEBHOOK_SECRET), env, cwd });

  // 7) tampered signature ⇒ rejected.
  const badSig = payments.handleWebhook({ rawBody, signature: "deadbeef", env, cwd });

  return {
    ok: afterPay.status === invoicing.STATUS.PAID && hook2.idempotent === true && afterReplay.paid === afterPay.paid && cardHook.code === "CARD_DATA_REFUSED" && badSig.ok === false,
    readiness: ready,
    liveEnabled: ready.liveEnabled === true,
    invoice: { id: draft.id, number: issued.number, total, statusAfterPay: afterPay.status, paid: afterPay.paid },
    idempotentReplay: hook2.idempotent === true,
    paidUnchangedOnReplay: afterReplay.paid === afterPay.paid,
    cardDataRefused: cardHook.code === "CARD_DATA_REFUSED",
    tamperedSignatureRejected: badSig.ok === false,
    note: "SANDBOX ONLY — TEST_MODE provider, isolated cwd, no network, no real account, no prod charge.",
  };
}

export { sandboxEnv, runSandboxCycle };
module.exports = { sandboxEnv, runSandboxCycle };

if (require.main === module) {
  const os = require("os"); const path = require("path"); const fs = require("fs");
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "p01-billing-sandbox-"));
  try { process.stdout.write(JSON.stringify(runSandboxCycle({ cwd }), null, 2) + "\n"); }
  finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}
