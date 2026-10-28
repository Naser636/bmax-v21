#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the SANDBOX-ONLY P-01 billing cycle over the real invoicing+payments primitives:
// draft→validate→issue→signed webhook→PAID, idempotent replay, card-data refused, tampered signature rejected, and the
// hard LIVE_REFUSED / CWD_REQUIRED safety guards. Confined to a temp dir — no repo writes, no network, no real charge.
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const S = require("./p01-billing-sandbox.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "p01-bill-test-"));

// (1) full sandbox cycle in an isolated cwd.
{
  const cwd = tmp();
  try {
    const r = S.runSandboxCycle({ cwd, priceEur: 49 });
    ok("cycle ⇒ ok (draft→validate→issue→PAID)", r.ok === true && r.invoice.statusAfterPay === "PAID");
    ok("reconciled amount == invoice total (exact)", r.invoice.paid === r.invoice.total && r.invoice.total > 0);
    ok("TEST_MODE, live disabled (no real charge path)", r.readiness.state === "TEST_MODE" && r.liveEnabled === false);
    ok("event replay is idempotent (paid unchanged)", r.idempotentReplay === true && r.paidUnchangedOnReplay === true);
    ok("card data refused", r.cardDataRefused === true);
    ok("tampered signature rejected", r.tamperedSignatureRejected === true);
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

// (2) HARD SAFETY: live payments enabled ⇒ refuse outright (never initiate a real charge).
{
  const cwd = tmp();
  try {
    const r = S.runSandboxCycle({ cwd, env: { PAYMENT_LIVE_ENABLED: "1" } });
    ok("PAYMENT_LIVE_ENABLED=1 ⇒ LIVE_REFUSED (sandbox-only)", r.ok === false && r.code === "LIVE_REFUSED");
    // nothing should have been written (refused before any invoice creation)
    ok("live-refused leaves no invoices written", !fs.existsSync(path.join(cwd, "runtime/generated/clients/invoices")));
  } finally { fs.rmSync(cwd, { recursive: true, force: true }); }
}

// (3) cwd required (never writes to the repo).
ok("missing cwd ⇒ CWD_REQUIRED", S.runSandboxCycle({}).code === "CWD_REQUIRED");

// (4) determinism: two independent runs in separate temp dirs both reconcile to PAID.
{
  const a = tmp(), b = tmp();
  try {
    const ra = S.runSandboxCycle({ cwd: a }), rb = S.runSandboxCycle({ cwd: b });
    ok("two isolated runs both ⇒ PAID (repeatable)", ra.ok === true && rb.ok === true && ra.invoice.statusAfterPay === "PAID" && rb.invoice.statusAfterPay === "PAID");
  } finally { fs.rmSync(a, { recursive: true, force: true }); fs.rmSync(b, { recursive: true, force: true }); }
}

console.log(`\nP01-BILLING-SANDBOX suite — ${pass} assertions passed. (sandbox invoice→payment→reconcile; idempotent; card refused; tamper rejected; LIVE_REFUSED guard; isolated cwd)`);
