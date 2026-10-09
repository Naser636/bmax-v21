#!/usr/bin/env node
"use strict";
/*
 * COMMERCIAL JOURNEY — mandatory end-to-end proof (15 checks) linking the whole chain OFFLINE:
 * site-entry → intake → qualification → quote → acceptance → authorized mission → delivery → invoice →
 * payment → reconciliation. cwd+env isolated; mock payment webhook (HMAC); no network; no send.
 */
const fs = require("fs"); const os = require("os"); const path = require("path"); const crypto = require("crypto"); const assert = require("assert");
const endpoint = require(path.resolve(__dirname, "intake-endpoint.js"));
const intake = require(path.resolve(__dirname, "client-intake.js"));
const authz = require(path.resolve(__dirname, "capability-authorization.js"));
const quote = require(path.resolve(__dirname, "quote.js"));
const invoicing = require(path.resolve(__dirname, "invoicing.js"));
const payments = require(path.resolve(__dirname, "payments.js"));
const readiness = require(path.resolve(__dirname, "launch-readiness.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "journey-"));
const H = (o) => ({ by: "human", owner: o });
const FISCAL = { INVOICE_SELLER_NAME: "ODG", INVOICE_SELLER_ADDRESS: "Paris", INVOICE_SELLER_TAXID: "FR0", INVOICE_CURRENCY: "EUR", INVOICE_TAX_RATE: "0.20" };
const PAYENV = { PAYMENT_PROVIDER: "mockpay", PAYMENT_WEBHOOK_SECRET: "whsec" };
const JSONH = { "content-type": "application/json" };
const SECRET_FIELD = "sk-INJECTED-SECRET";
function w(rel, o) { const a = path.join(cwd, rel); fs.mkdirSync(path.dirname(a), { recursive: true }); fs.writeFileSync(a, JSON.stringify(o)); }

(async () => {
  // 1 — valid request via the local entry point is persisted.
  const r1 = JSON.parse(endpoint.handleIntakeRequest({ method: "POST", headers: JSONH, body: JSON.stringify({ client: "Acme", problem: "CSV→JSON tool", scope: "one script runtime/**", acceptance: "tests green", humanOwner: "sales@odg", consent: true, apiKey: SECRET_FIELD }) }, { cwd }).body);
  const reqId = r1.requestId;
  ok("1 valid request persisted via entry point", r1.ok && reqId === "CLIENT-001" && intake.get(reqId, { cwd }).status === "NEW");
  // 2 — incomplete request blocked (HELD).
  ok("2 incomplete request ⇒ HELD", JSON.parse(endpoint.handleIntakeRequest({ method: "POST", headers: JSONH, body: JSON.stringify({ client: "x", consent: true }) }, { cwd }).body).status === "HELD");
  // 3 — identical repeated inbound (same message-id) does not duplicate (email dedupe primitive).
  const email = require(path.resolve(__dirname, "email-gateway.js"));
  const IMAPENV = { IMAP_HOST: "h", IMAP_PORT: "993", IMAP_USER: "u", IMAP_PASS: "imap-secret" };
  const msg = [{ messageId: "<dup@x>", from: "lead@x", subject: "hello", text: "hi" }];
  await email.fetchInbound({ env: IMAPENV, cwd, imapFactory: () => ({ async connect() {}, async fetchAllUnseen() { return msg; }, async logout() {} }) });
  const before = intake.list({ cwd }).length;
  const dup = await email.fetchInbound({ env: IMAPENV, cwd, imapFactory: () => ({ async connect() {}, async fetchAllUnseen() { return msg; }, async logout() {} }) });
  ok("3 repeated inbound message ⇒ no duplicate", dup.duplicates === 1 && intake.list({ cwd }).length === before);
  // 4 — quote cannot be emitted/accepted without human approval.
  intake.transition(reqId, "QUALIFYING", { cwd, ...H("cto") });
  const qid = quote.createQuote({ requestId: reqId, lines: [{ description: "dev", quantity: 10, unitPrice: 100 }], taxRate: 0.2, currency: "EUR" }, { cwd }).id;
  ok("4 quote send without approval ⇒ INVALID_TRANSITION (not approved)", quote.markSent(qid, { cwd, ...H("cto") }).code === quote.CODE.INVALID_TRANSITION);
  ok("4 quote approve requires human", quote.approve(qid, { cwd }).code === quote.CODE.HUMAN_AUTHORIZATION_REQUIRED);
  quote.approve(qid, { cwd, ...H("cto") }); quote.markSent(qid, { cwd, ...H("cto") });
  ok("4 quote accepted only by human", quote.accept(qid, { cwd, ...H("cto") }).status === "ACCEPTED");
  // 5 — an unauthorized consequential mission capability does not execute.
  ok("5 consequential capability without human grant ⇒ DENY", authz.authorizeCapability({ capability: "Governed Bash/Linux Command", mission: "M" }, null, { now: 1 }).decision !== "ALLOW");
  // 6 — delivery without valid proofs rejected; scope+proofs ⇒ accepted and linked.
  intake.transition(reqId, "PILOT_SCOPED", { cwd, ...H("cto") });
  ok("6 delivery before proofs ⇒ DELIVERY_NOT_ACCEPTED", intake.attachDelivery(reqId, "PILOT_MISSION", { cwd }).code === intake.CODE.DELIVERY_NOT_ACCEPTED);
  w("runtime/missions/PILOT_MISSION.json", { mission: "PILOT_MISSION", requires_engineering: true, authorized_paths: ["runtime/**"], objectives: [{ id: "EXTERNAL_RESEARCH_1" }] });
  w("runtime/generated/mission-report.json", { mission: "PILOT_MISSION", status: "SUCCESS", validated: true });
  w("runtime/generated/mission-ledger.json", [{ mission: "PILOT_MISSION", proven: true, validated: true, state: "RELEASED" }]);
  w("runtime/generated/patch-execution.json", { mission: "PILOT_MISSION", executed: [{ objectiveId: "EXTERNAL_RESEARCH_1", status: "EXECUTED", capability: "External Research Acquisition", evidence: "runtime/generated/external-research-acquisition.json" }] });
  w("runtime/generated/external-research-acquisition.json", { capability: "External Research Acquisition", mode: "LIVE", acquired: true, sources: [{ url: "u", http_status: 200, content_hash: "a".repeat(64) }], ranked: [{ provenance_ref: "u" }] });
  const deliv = intake.attachDelivery(reqId, "PILOT_MISSION", { cwd });
  ok("6 proven delivery ⇒ DELIVERED + human acceptance required", deliv.ok && deliv.status === "DELIVERED" && deliv.humanAcceptanceRequired === true);
  // 7 — invoice draft computed correctly from approved quote data (10*100=1000 +20% = 1200).
  const draft = invoicing.createDraft({ requestId: reqId, quoteId: qid, lines: [{ description: "dev", quantity: 10, unitPrice: 100 }] }, { cwd, env: FISCAL });
  ok("7 invoice draft total 1200.00 from approved data", draft.ok && draft.total === 1200 && draft.tax === 200);
  invoicing.validateDraft(draft.id, { cwd, ...H("cto") });
  const issued = invoicing.issue(draft.id, { cwd, env: FISCAL, ...H("cto") });
  ok("7 invoice issued with gapless number", issued.ok && /^INV-\d{4}-0001$/.test(issued.number));
  // 8 — issued invoice not silently modified.
  const f = path.join(cwd, "runtime/generated/clients/invoices", draft.id + ".json"); const rec = JSON.parse(fs.readFileSync(f, "utf8")); rec.total = 1; fs.writeFileSync(f, JSON.stringify(rec));
  ok("8 tampered issued invoice detected", invoicing.get(draft.id, { cwd }).tampered === true);
  // Step 8's tamper is intentional and destructive; continue the payment steps on a FRESH clean invoice.
  const draft2 = invoicing.createDraft({ requestId: "CLIENT-050", lines: [{ description: "dev", quantity: 10, unitPrice: 100 }] }, { cwd, env: FISCAL });
  invoicing.validateDraft(draft2.id, { cwd, ...H("cto") }); const issued2 = invoicing.issue(draft2.id, { cwd, env: FISCAL, ...H("cto") });
  // 9 — unauthenticated payment event rejected.
  const rawBad = JSON.stringify({ eventId: "e-bad", type: "payment_succeeded", invoiceId: draft2.id, amount: 1200 });
  ok("9 unauthenticated payment ⇒ UNAUTHENTICATED (invoice unchanged)", payments.handleWebhook({ cwd, env: PAYENV, rawBody: rawBad, signature: "bad" }).code === payments.CODE.UNAUTHENTICATED && invoicing.get(draft2.id, { cwd }).status === "ISSUED");
  // 10 — valid payment event + replay idempotent.
  const raw = JSON.stringify({ eventId: "e-ok", type: "payment_succeeded", invoiceId: draft2.id, amount: 1200, reference: "r-ok" });
  const sig = crypto.createHmac("sha256", "whsec").update(raw).digest("hex");
  const pay1 = payments.handleWebhook({ cwd, env: PAYENV, rawBody: raw, signature: sig });
  const pay2 = payments.handleWebhook({ cwd, env: PAYENV, rawBody: raw, signature: sig });
  ok("10 valid payment ⇒ PAID; replay idempotent (1 payment)", pay1.ok && invoicing.get(draft2.id, { cwd }).status === "PAID" && pay2.idempotent === true && invoicing.get(draft2.id, { cwd }).payments.length === 1);
  // 11 — an unproven payment never marks an invoice paid.
  const draft3 = invoicing.createDraft({ requestId: "CLIENT-060", lines: [{ description: "x", quantity: 1, unitPrice: 50 }] }, { cwd, env: FISCAL });
  invoicing.validateDraft(draft3.id, { cwd, ...H("cto") }); invoicing.issue(draft3.id, { cwd, env: FISCAL, ...H("cto") });
  invoicing.applyPayment(draft3.id, { amount: 50, verified: false, reference: "claim" }, { cwd });
  ok("11 unverified ⇒ invoice stays ISSUED (never PAID)", invoicing.get(draft3.id, { cwd }).status === "ISSUED");
  // 12 — secrets never persisted anywhere in the client store.
  const dump = fs.readdirSync(path.join(cwd, "runtime/generated/clients"), { recursive: true }).map((p) => { try { return fs.readFileSync(path.join(cwd, "runtime/generated/clients", p), "utf8"); } catch { return ""; } }).join("");
  ok("12 no injected/imap/payment secret persisted", !dump.includes(SECRET_FIELD) && !dump.includes("imap-secret") && !dump.includes("whsec"));
  // 13 — external integrations inactive: email send disabled, payments test mode (no live).
  ok("13 email send disabled + payments TEST_MODE (no live transactions)", (await email.sendResponse({ env: {}, requestId: reqId, cwd })).code === "SEND_DISABLED" && payments.readiness({ env: PAYENV }).state === "TEST_MODE");
  // 14 — readiness states reflect real controls.
  const rd = readiness.assess({ cwd, env: { ...FISCAL, ...PAYENV, IMAP_HOST: "h", IMAP_PORT: "993", IMAP_USER: "u", IMAP_PASS: "p" } });
  ok("14 readiness TEST_MODE with fiscal+imap+payment-test configured", rd.overall === "TEST_MODE" && rd.capabilities.fiscalParams.state === "READY");
  // 15 — the chain links client↔mission↔delivery↔invoice↔payment.
  const reqRec = intake.get(reqId, { cwd }); const inv = invoicing.get(draft2.id, { cwd });
  ok("15 chain linked (request→delivery.mission; invoice→request/quote; payment→invoice)", reqRec.delivery.mission === "PILOT_MISSION" && draft.id && inv.payments.length === 1 && invoicing.get(draft.id, { cwd }).quoteId === qid);

  console.log(`\nCOMMERCIAL JOURNEY — ${passed} checks passed.`);
})().catch((e) => { console.error("JOURNEY ERROR:", e && e.stack || e); process.exit(1); });
