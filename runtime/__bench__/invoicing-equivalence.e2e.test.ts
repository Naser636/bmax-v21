#!/usr/bin/env node
/*
 * LOT invoicing — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/invoicing.ts → runtime/dist/core/invoicing.js.
 * invoicing is a PURE LEAF (only fs/path/crypto builtins) so the compiled .ts is self-contained in dist —
 * no co-located deps. All store ops use an explicit opts.cwd (temp dir) + an INJECTED opts.env so they NEVER
 * touch the repo and are deterministic. The non-det fields (createdAt / issuedAt / dueDate / payments[].at and
 * the issuedHash which derives from issuedAt) are normalised before comparison; everything else must be
 * BYTE-IDENTICAL. No network, no secret values, no real fiscal data.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/invoicing-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "invoicing.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "invoicing.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT invoicing — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/invoicing.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/invoicing.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["STATUS", "CODE", "fiscalReadiness", "computeTotals", "createDraft", "get", "list", "validateDraft", "issue", "applyPayment", "creditNote", "round2"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
for (const c of ["STATUS", "CODE"]) check(EQ(js[c], ts[c]) && Object.isFrozen(ts[c]), `${c} byte-identical + frozen`);

// Normalise ONLY the non-deterministic fields (real timestamps + the hash derived from issuedAt).
const normRec = (r: any) =>
  r
    ? JSON.parse(
        JSON.stringify(r)
          .replace(/"createdAt":"[^"]*"/g, '"createdAt":"<ts>"')
          .replace(/"issuedAt":"[^"]*"/g, '"issuedAt":"<ts>"')
          .replace(/"dueDate":"[^"]*"/g, '"dueDate":"<ts>"')
          .replace(/"at":"[^"]*"/g, '"at":"<ts>"')
          .replace(/"issuedHash":"[0-9a-f]{64}"/g, '"issuedHash":"<hash>"'),
      )
    : r;

const temps: string[] = [];
const cwd = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "inv-")); temps.push(d); return d; };
const FISCAL: any = { INVOICE_SELLER_NAME: "ODG SARL", INVOICE_SELLER_ADDRESS: "1 rue Exemple, Paris", INVOICE_SELLER_TAXID: "FR00000000000", INVOICE_CURRENCY: "EUR", INVOICE_TAX_RATE: "0.20" };
const LINES = [{ description: "dev", quantity: 3, unitPrice: 100 }, { description: "setup", quantity: 1, unitPrice: 49.99 }];
const H = (owner: string) => ({ by: "human", owner });

try {
  // --- pure math / readiness (no store) : fully BYTE-IDENTICAL ---
  check(EQ(js.computeTotals([{ description: "x", quantity: 3, unitPrice: 33.333 }], 0, 0.2), ts.computeTotals([{ description: "x", quantity: 3, unitPrice: 33.333 }], 0, 0.2)), "computeTotals(round half-up) BYTE-IDENTICAL");
  check(EQ(js.computeTotals([{ description: "x", quantity: 0, unitPrice: 5 }], 0, 0.2), ts.computeTotals([{ description: "x", quantity: 0, unitPrice: 5 }], 0, 0.2)), "computeTotals(invalid line) ⇒ INVALID_LINE BYTE-IDENTICAL");
  check(EQ(js.computeTotals(LINES, 1000, 0.2), ts.computeTotals(LINES, 1000, 0.2)), "computeTotals(discount>subtotal) ⇒ INVALID_INPUT BYTE-IDENTICAL");
  check(js.round2(99.999) === ts.round2(99.999) && js.round2(99.999) === 100, "round2 identical");
  check(EQ(js.fiscalReadiness({ env: {} }), ts.fiscalReadiness({ env: {} })) && js.fiscalReadiness({ env: {} }).state === "NOT_CONFIGURED", "fiscalReadiness(empty) ⇒ NOT_CONFIGURED BYTE-IDENTICAL");
  check(EQ(js.fiscalReadiness({ env: FISCAL }), ts.fiscalReadiness({ env: FISCAL })) && js.fiscalReadiness({ env: FISCAL }).state === "READY", "fiscalReadiness(configured) ⇒ READY BYTE-IDENTICAL");
  check(EQ(js.fiscalReadiness({ env: { ...FISCAL, INVOICE_TAX_RATE: "EXEMPT" } }), ts.fiscalReadiness({ env: { ...FISCAL, INVOICE_TAX_RATE: "EXEMPT" } })), "fiscalReadiness(EXEMPT) BYTE-IDENTICAL");

  // --- createDraft : persisted record BYTE-IDENTICAL (createdAt normalised); dedupe; validation ---
  const dJ = cwd(), dT = cwd();
  const drJ = js.createDraft({ requestId: "R1", lines: LINES, discount: 0 }, { cwd: dJ, env: FISCAL });
  const drT = ts.createDraft({ requestId: "R1", lines: LINES, discount: 0 }, { cwd: dT, env: FISCAL });
  check(EQ(drJ, drT) && drJ.ok === true && drJ.total === 419.99, "createDraft summary BYTE-IDENTICAL (total 419.99)");
  check(EQ(normRec(js.get(drJ.id, { cwd: dJ })), normRec(ts.get(drT.id, { cwd: dT }))), "stored DRAFT record BYTE-IDENTICAL (createdAt normalised)");
  check(EQ(js.createDraft({ requestId: "R1", lines: LINES }, { cwd: dJ, env: FISCAL }), ts.createDraft({ requestId: "R1", lines: LINES }, { cwd: dT, env: FISCAL })), "createDraft duplicate ⇒ DUPLICATE BYTE-IDENTICAL");
  check(EQ(js.createDraft({ lines: LINES }, { cwd: cwd(), env: FISCAL }), ts.createDraft({ lines: LINES }, { cwd: cwd(), env: FISCAL })), "createDraft(no requestId) ⇒ INVALID_INPUT BYTE-IDENTICAL");
  check(EQ(js.createDraft({ requestId: "R", lines: [] }, { cwd: cwd(), env: FISCAL }), ts.createDraft({ requestId: "R", lines: [] }, { cwd: cwd(), env: FISCAL })), "createDraft(no lines) ⇒ INVALID_INPUT BYTE-IDENTICAL");

  // --- validateDraft : human-gated deny-by-default, then VALIDATED ---
  check(EQ(js.validateDraft(drJ.id, { cwd: dJ }), ts.validateDraft(drT.id, { cwd: dT })) && js.validateDraft(drJ.id, { cwd: dJ }).code === "HUMAN_AUTHORIZATION_REQUIRED", "validateDraft(no human) ⇒ HUMAN_AUTHORIZATION_REQUIRED BYTE-IDENTICAL");
  check(EQ(js.validateDraft(drJ.id, { ...H("boss"), cwd: dJ }), ts.validateDraft(drT.id, { ...H("boss"), cwd: dT })), "validateDraft(human) ⇒ VALIDATED BYTE-IDENTICAL");

  // --- issue : fiscal gate, human gate, then ISSUED (number/issuedAt/hash normalised) ---
  check(EQ(js.issue(drJ.id, { ...H("boss"), cwd: dJ, env: {} }), ts.issue(drT.id, { ...H("boss"), cwd: dT, env: {} })) && js.issue(drJ.id, { ...H("boss"), cwd: dJ, env: {} }).code === "FISCAL_NOT_CONFIGURED", "issue(no fiscal) ⇒ FISCAL_NOT_CONFIGURED BYTE-IDENTICAL");
  const isJ = js.issue(drJ.id, { ...H("boss"), cwd: dJ, env: FISCAL });
  const isT = ts.issue(drT.id, { ...H("boss"), cwd: dT, env: FISCAL });
  check(isJ.ok === true && isT.ok === true && isJ.status === "ISSUED" && isT.status === "ISSUED" && isJ.number === isT.number && /^INV-\d{4}-0001$/.test(isJ.number), "issue(human+fiscal) ⇒ ISSUED, gapless number identical");
  check(EQ(normRec(js.get(drJ.id, { cwd: dJ })), normRec(ts.get(drT.id, { cwd: dT }))), "stored ISSUED record BYTE-IDENTICAL (issuedAt/dueDate/hash normalised)");
  // idempotent re-issue.
  check(EQ(js.issue(drJ.id, { ...H("boss"), cwd: dJ, env: FISCAL }), ts.issue(drT.id, { ...H("boss"), cwd: dT, env: FISCAL })) && js.issue(drJ.id, { ...H("boss"), cwd: dJ, env: FISCAL }).idempotent === true, "issue(again) ⇒ idempotent BYTE-IDENTICAL");

  // --- applyPayment : unverified blocked, partial then paid, overpay blocked ---
  check(EQ(js.applyPayment(drJ.id, { amount: 10, verified: false }, { cwd: dJ }), ts.applyPayment(drT.id, { amount: 10, verified: false }, { cwd: dT })) && js.applyPayment(drJ.id, { amount: 10, verified: false }, { cwd: dJ }).code === "PAYMENT_UNVERIFIED", "applyPayment(unverified) ⇒ PAYMENT_UNVERIFIED BYTE-IDENTICAL");
  check(EQ(js.applyPayment(drJ.id, { amount: 100, verified: true, reference: "P1" }, { cwd: dJ }), ts.applyPayment(drT.id, { amount: 100, verified: true, reference: "P1" }, { cwd: dT })) && js.get(drJ.id, { cwd: dJ }).status === "PARTIALLY_PAID", "applyPayment(partial, verified) ⇒ PARTIALLY_PAID BYTE-IDENTICAL");
  // idempotent by reference.
  check(EQ(js.applyPayment(drJ.id, { amount: 100, verified: true, reference: "P1" }, { cwd: dJ }), ts.applyPayment(drT.id, { amount: 100, verified: true, reference: "P1" }, { cwd: dT })) && js.applyPayment(drJ.id, { amount: 100, verified: true, reference: "P1" }, { cwd: dJ }).idempotent === true, "applyPayment(same ref) ⇒ idempotent BYTE-IDENTICAL");
  // overpay blocked.
  check(EQ(js.applyPayment(drJ.id, { amount: 9999, verified: true, reference: "P2" }, { cwd: dJ }), ts.applyPayment(drT.id, { amount: 9999, verified: true, reference: "P2" }, { cwd: dT })) && js.applyPayment(drJ.id, { amount: 9999, verified: true, reference: "P2" }, { cwd: dJ }).code === "OVERPAY", "applyPayment(overpay) ⇒ OVERPAY BYTE-IDENTICAL");
  // pay remainder ⇒ PAID (record normalised across payments[].at).
  js.applyPayment(drJ.id, { amount: 319.99, verified: true, reference: "P3" }, { cwd: dJ });
  ts.applyPayment(drT.id, { amount: 319.99, verified: true, reference: "P3" }, { cwd: dT });
  check(js.get(drJ.id, { cwd: dJ }).status === "PAID" && ts.get(drT.id, { cwd: dT }).status === "PAID", "applyPayment(remainder) ⇒ PAID (both)");
  check(EQ(normRec(js.get(drJ.id, { cwd: dJ })), normRec(ts.get(drT.id, { cwd: dT }))), "stored PAID record BYTE-IDENTICAL (payments[].at normalised)");

  // --- creditNote : only for issued; human-gated; negative mirror ---
  const cnJ = js.creditNote(drJ.id, { ...H("boss"), cwd: dJ, reason: "refund" });
  const cnT = ts.creditNote(drT.id, { ...H("boss"), cwd: dT, reason: "refund" });
  check(cnJ.ok === true && cnT.ok === true && cnJ.total === -419.99 && cnT.total === -419.99 && cnJ.number === cnT.number, "creditNote(issued) ⇒ negative mirror, number identical");
  check(EQ(normRec(js.get(cnJ.id, { cwd: dJ })), normRec(ts.get(cnT.id, { cwd: dT }))), "stored CREDIT_NOTE record BYTE-IDENTICAL (issuedAt/hash normalised)");

  // --- not-found / list parity ---
  check(js.get("INV-NOPE", { cwd: dJ }) === null && ts.get("INV-NOPE", { cwd: dT }) === null, "get(absent) ⇒ null (both)");
  check(js.list({ cwd: dJ }).length === ts.list({ cwd: dT }).length, "list() length identical");
  check(EQ(js.validateDraft("INV-NOPE", { cwd: dJ }), ts.validateDraft("INV-NOPE", { cwd: dT })) && js.validateDraft("INV-NOPE", { cwd: dJ }).code === "NOT_FOUND", "validateDraft(absent) ⇒ NOT_FOUND BYTE-IDENTICAL");
} finally {
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT invoicing EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
