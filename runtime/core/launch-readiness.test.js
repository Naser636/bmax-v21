#!/usr/bin/env node
"use strict";
/* LAUNCH READINESS — states reflect real controls, not env presence alone. cwd/env isolated. */
const fs = require("fs"); const os = require("os"); const path = require("path"); const assert = require("assert");
const L = require(path.resolve(__dirname, "launch-readiness.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "launch-")); }

// 1 — nothing configured ⇒ code ready but overall NOT_CONFIGURED; email/fiscal/payments NOT_CONFIGURED.
{
  const r = L.assess({ cwd: tmp(), env: {} });
  ok("1 code capabilities READY", r.codeReady === true);
  ok("1 overall NOT_CONFIGURED (launch config missing)", r.overall === "NOT_CONFIGURED" && r.launchConfigured === false);
  ok("1 email/fiscal/payments NOT_CONFIGURED", r.capabilities.emailInbound.state === "NOT_CONFIGURED" && r.capabilities.fiscalParams.state === "NOT_CONFIGURED" && r.capabilities.payments.state === "NOT_CONFIGURED");
  ok("1 site intake handler READY locally but deployment NOT_CONFIGURED (not claimed reachable)", r.capabilities.siteIntakeHandler.state === "READY" && r.capabilities.siteIntakeDeployment.state === "NOT_CONFIGURED" && r.capabilities.siteIntakeDeployment.deploymentVerified === false);
}
// 2 — fully test-configured ⇒ overall TEST_MODE (payments in test).
{
  const env = { IMAP_HOST: "h", IMAP_PORT: "993", IMAP_USER: "u", IMAP_PASS: "p", INVOICE_SELLER_NAME: "ODG", INVOICE_SELLER_ADDRESS: "Paris", INVOICE_SELLER_TAXID: "FR0", INVOICE_CURRENCY: "EUR", INVOICE_TAX_RATE: "0.20", PAYMENT_PROVIDER: "mockpay", PAYMENT_WEBHOOK_SECRET: "s" };
  const r = L.assess({ cwd: tmp(), env });
  ok("2 overall TEST_MODE when payments in test", r.overall === "TEST_MODE" && r.launchConfigured === true && r.capabilities.payments.state === "TEST_MODE");
}
// 3 — live-enabled everything ⇒ READY.
{
  const env = { IMAP_HOST: "h", IMAP_PORT: "993", IMAP_USER: "u", IMAP_PASS: "p", SMTP_HOST: "s", SMTP_PORT: "465", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_SEND_ENABLED: "1", INVOICE_SELLER_NAME: "ODG", INVOICE_SELLER_ADDRESS: "Paris", INVOICE_SELLER_TAXID: "FR0", INVOICE_CURRENCY: "EUR", INVOICE_TAX_RATE: "0.20", PAYMENT_PROVIDER: "mockpay", PAYMENT_WEBHOOK_SECRET: "s", PAYMENT_LIVE_ENABLED: "1" };
  const r = L.assess({ cwd: tmp(), env });
  ok("3 overall READY when all live-configured", r.overall === "READY" && r.capabilities.payments.state === "READY");
}
// 4 — human prerequisites always surfaced.
ok("4 human prerequisites surfaced", L.assess({ cwd: tmp(), env: {} }).humanPrerequisites.some((p) => /qualified client/.test(p)));
console.log(`\nLAUNCH READINESS — ${passed} assertions passed.`);
