#!/usr/bin/env node
"use strict";
/* INVOICING — contract test. cwd+env isolated, deterministic money math, immutability + payment gates. */
const fs = require("fs"); const os = require("os"); const path = require("path"); const assert = require("assert");
const I = require(path.resolve(__dirname, "invoicing.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "inv-")); }
const FISCAL = { INVOICE_SELLER_NAME: "ODG SARL", INVOICE_SELLER_ADDRESS: "1 rue Exemple, Paris", INVOICE_SELLER_TAXID: "FR00000000000", INVOICE_CURRENCY: "EUR", INVOICE_TAX_RATE: "0.20" };
const LINES = [{ description: "dev", quantity: 3, unitPrice: 100 }, { description: "setup", quantity: 1, unitPrice: 49.99 }];
const H = (owner) => ({ by: "human", owner });

// 1 — totals + rounding half-up.
{
  const t = I.computeTotals([{ description: "x", quantity: 3, unitPrice: 33.333 }], 0, 0.2);
  ok("1 line rounds half-up (3*33.333=99.999→100.00)", t.ok && t.subtotal === 100 && t.tax === 20 && t.total === 120);
}
// 2 — invalid line fails closed.
{
  const cwd = tmp();
  ok("2 invalid qty ⇒ INVALID_LINE", I.createDraft({ requestId: "R1", lines: [{ description: "x", quantity: 0, unitPrice: 5 }] }, { cwd, env: FISCAL }).code === I.CODE.INVALID_LINE);
  ok("2 no lines ⇒ INVALID_INPUT", I.createDraft({ requestId: "R1", lines: [] }, { cwd, env: FISCAL }).code === I.CODE.INVALID_INPUT);
}
// 3 — draft, dedupe, totals persisted.
{
  const cwd = tmp();
  const d = I.createDraft({ requestId: "R1", lines: LINES, discount: 0 }, { cwd, env: FISCAL });
  ok("3 draft created, total=(349.99*1.2)=419.99", d.ok && d.total === 419.99);
  const dup = I.createDraft({ requestId: "R1", lines: LINES }, { cwd, env: FISCAL });
  ok("3 duplicate open invoice for same request ⇒ DUPLICATE", dup.code === I.CODE.DUPLICATE);
}
// 4 — human gate + fiscal gate + gapless number + idempotent issue.
{
  const cwd = tmp();
  const d = I.createDraft({ requestId: "R1", lines: LINES }, { cwd, env: FISCAL }).id;
  ok("4 validate without human ⇒ denied", I.validateDraft(d, { cwd }).code === I.CODE.HUMAN_AUTHORIZATION_REQUIRED);
  I.validateDraft(d, { cwd, ...H("cto") });
  ok("4 issue without fiscal ⇒ FISCAL_NOT_CONFIGURED", I.issue(d, { cwd, env: {}, ...H("cto") }).code === I.CODE.FISCAL_NOT_CONFIGURED);
  const iss = I.issue(d, { cwd, env: FISCAL, ...H("cto") });
  ok("4 issue ⇒ gapless number INV-YYYY-0001", iss.ok && /^INV-\d{4}-0001$/.test(iss.number));
  const again = I.issue(d, { cwd, env: FISCAL, ...H("cto") });
  ok("4 re-issue is idempotent (same number, no new sequence)", again.idempotent === true && again.number === iss.number);
  // second invoice gets 0002
  const d2 = I.createDraft({ requestId: "R2", lines: LINES }, { cwd, env: FISCAL }).id;
  I.validateDraft(d2, { cwd, ...H("cto") });
  ok("4 next invoice ⇒ 0002 (gapless)", /0002$/.test(I.issue(d2, { cwd, env: FISCAL, ...H("cto") }).number));
}
// 5 — immutability: tampering an ISSUED invoice is detected.
{
  const cwd = tmp();
  const d = I.createDraft({ requestId: "R1", lines: LINES }, { cwd, env: FISCAL }).id;
  I.validateDraft(d, { cwd, ...H("cto") }); I.issue(d, { cwd, env: FISCAL, ...H("cto") });
  const f = path.join(cwd, "runtime/generated/clients/invoices", d + ".json");
  const rec = JSON.parse(fs.readFileSync(f, "utf8")); rec.total = 1; rec.lines[0].unitPrice = 1; fs.writeFileSync(f, JSON.stringify(rec));
  ok("5 tampered issued invoice flagged", I.get(d, { cwd }).tampered === true);
}
// 6 — credit note corrects without rewriting the original.
{
  const cwd = tmp();
  const d = I.createDraft({ requestId: "R1", lines: LINES }, { cwd, env: FISCAL }).id;
  I.validateDraft(d, { cwd, ...H("cto") }); const num = I.issue(d, { cwd, env: FISCAL, ...H("cto") }).number;
  ok("6 credit note without human ⇒ denied", I.creditNote(d, { cwd }).code === I.CODE.HUMAN_AUTHORIZATION_REQUIRED);
  const cn = I.creditNote(d, { cwd, ...H("cto"), reason: "scope reduced" });
  ok("6 credit note negative total, references original, original still ISSUED", cn.ok && cn.total === -419.99 && cn.correctsInvoice === num && I.get(d, { cwd }).status === I.STATUS.ISSUED && I.get(d, { cwd }).tampered !== true);
}
// 7 — payment gates: unverified rejected; partial then full; overpay rejected; idempotent by reference.
{
  const cwd = tmp();
  const d = I.createDraft({ requestId: "R1", lines: LINES }, { cwd, env: FISCAL }).id;
  I.validateDraft(d, { cwd, ...H("cto") }); I.issue(d, { cwd, env: FISCAL, ...H("cto") });
  ok("7 unverified payment ⇒ PAYMENT_UNVERIFIED (never paid)", I.applyPayment(d, { amount: 419.99, verified: false, reference: "x" }, { cwd }).code === I.CODE.PAYMENT_UNVERIFIED);
  const p1 = I.applyPayment(d, { amount: 200, verified: true, reference: "p1" }, { cwd });
  ok("7 partial ⇒ PARTIALLY_PAID", p1.ok && p1.status === I.STATUS.PARTIALLY_PAID && p1.paid === 200);
  ok("7 replay same reference ⇒ idempotent", I.applyPayment(d, { amount: 200, verified: true, reference: "p1" }, { cwd }).idempotent === true);
  ok("7 overpay (200+300 > 419.99) ⇒ OVERPAY, not applied", I.applyPayment(d, { amount: 300, verified: true, reference: "pX" }, { cwd }).code === I.CODE.OVERPAY);
  const p2 = I.applyPayment(d, { amount: 219.99, verified: true, reference: "p2" }, { cwd });
  ok("7 remainder ⇒ PAID", p2.ok && p2.status === I.STATUS.PAID);
}
console.log(`\nINVOICING — ${passed} assertions passed.`);
