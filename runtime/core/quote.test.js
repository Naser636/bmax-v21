#!/usr/bin/env node
"use strict";
/* QUOTE — governed generation + human-gated emission/acceptance. cwd isolated. */
const fs = require("fs"); const os = require("os"); const path = require("path"); const assert = require("assert");
const Q = require(path.resolve(__dirname, "quote.js"));
const intake = require(path.resolve(__dirname, "client-intake.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "quote-")); }
const H = (o) => ({ by: "human", owner: o });
const VALID = { client: "Acme", problem: "p", scope: "s", acceptance: "a", humanOwner: "o", consent: true };
function withRequest(cwd) { return intake.intake(VALID, { cwd }).requestId; }

// 1 — create requires an existing request + valid lines; price caller-supplied.
{
  const cwd = tmp();
  ok("1 unknown request ⇒ REQUEST_NOT_FOUND", Q.createQuote({ requestId: "CLIENT-999", lines: [{ description: "x", quantity: 1, unitPrice: 10 }] }, { cwd }).code === Q.CODE.REQUEST_NOT_FOUND);
  const id = withRequest(cwd);
  const q = Q.createQuote({ requestId: id, lines: [{ description: "dev", quantity: 2, unitPrice: 500 }], taxRate: 0.2, validityDays: 14, terms: "50% upfront" }, { cwd });
  ok("1 quote created total=1000*1.2=1200, v1 DRAFT", q.ok && q.total === 1200 && q.version === 1 && q.status === "DRAFT");
}
// 2 — human-gated lifecycle.
{
  const cwd = tmp(); const id = withRequest(cwd);
  const qid = Q.createQuote({ requestId: id, lines: [{ description: "x", quantity: 1, unitPrice: 100 }] }, { cwd }).id;
  ok("2 approve without human ⇒ denied", Q.approve(qid, { cwd }).code === Q.CODE.HUMAN_AUTHORIZATION_REQUIRED);
  ok("2 approve (human) ok", Q.approve(qid, { cwd, ...H("cto") }).ok);
  ok("2 accept before sent ⇒ INVALID_TRANSITION", Q.accept(qid, { cwd, ...H("cto") }).code === Q.CODE.INVALID_TRANSITION);
  ok("2 markSent (human) ok", Q.markSent(qid, { cwd, ...H("cto") }).ok);
  ok("2 accept (human) ok", Q.accept(qid, { cwd, ...H("cto") }).status === "ACCEPTED");
}
// 3 — expiry blocks acceptance.
{
  const cwd = tmp(); const id = withRequest(cwd);
  const qid = Q.createQuote({ requestId: id, lines: [{ description: "x", quantity: 1, unitPrice: 100 }], validityDays: 1 }, { cwd }).id;
  Q.approve(qid, { cwd, ...H("cto") }); Q.markSent(qid, { cwd, ...H("cto") });
  // Force expiry by rewriting expiresAt into the past (simulates time passing; no clock dependency in test).
  const f = path.join(cwd, "runtime/generated/clients/quotes", qid + ".json"); const r = JSON.parse(fs.readFileSync(f, "utf8")); r.expiresAt = "2000-01-01T00:00:00Z"; fs.writeFileSync(f, JSON.stringify(r));
  ok("3 accept after expiry ⇒ EXPIRED", Q.accept(qid, { cwd, ...H("cto") }).code === Q.CODE.EXPIRED);
}
console.log(`\nQUOTE — ${passed} assertions passed.`);
