#!/usr/bin/env node
"use strict";
/* INTAKE ENDPOINT — pure handler; method/ctype/size/JSON validation; persistence-confirmed. cwd isolated. */
const fs = require("fs"); const os = require("os"); const path = require("path"); const assert = require("assert");
const E = require(path.resolve(__dirname, "intake-endpoint.js"));
const intake = require(path.resolve(__dirname, "client-intake.js"));
let passed = 0; function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), "endpoint-")); }
const JSONH = { "content-type": "application/json" };
const COMPLETE = { client: "Acme", problem: "convert csv", scope: "one script", acceptance: "tests green", humanOwner: "sales@odg.example", consent: true };

// 1 — valid POST ⇒ 201 + persisted requestId (confirmed only because persisted).
{
  const cwd = tmp();
  const r = E.handleIntakeRequest({ method: "POST", headers: JSONH, body: JSON.stringify(COMPLETE) }, { cwd });
  const b = JSON.parse(r.body);
  ok("1 complete POST ⇒ 201 ok + CLIENT-001 NEW", r.status === 201 && b.ok && b.requestId === "CLIENT-001" && b.status === "NEW");
  ok("1 record actually persisted", intake.get("CLIENT-001", { cwd }).problem === "convert csv");
}
// 2 — incomplete ⇒ 202 HELD (persisted, honestly reported).
{
  const cwd = tmp();
  const r = E.handleIntakeRequest({ method: "POST", headers: JSONH, body: JSON.stringify({ client: "x", problem: "y", consent: true }) }, { cwd });
  const b = JSON.parse(r.body);
  ok("2 incomplete ⇒ 202 not-ok HELD + missing listed", r.status === 202 && b.ok === false && b.status === "HELD" && b.missing.includes("scope"));
}
// 3 — method/content-type/size/JSON failures fail closed.
{
  const cwd = tmp();
  ok("3 GET ⇒ 405", E.handleIntakeRequest({ method: "GET", headers: JSONH, body: "" }, { cwd }).status === 405);
  ok("3 non-json ctype ⇒ 415", E.handleIntakeRequest({ method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }, { cwd }).status === 415);
  ok("3 oversize body ⇒ 413", E.handleIntakeRequest({ method: "POST", headers: JSONH, body: "x".repeat(E.MAX_BODY_BYTES + 1) }, { cwd }).status === 413);
  ok("3 malformed JSON ⇒ 400", E.handleIntakeRequest({ method: "POST", headers: JSONH, body: "{bad" }, { cwd }).status === 400);
}
// 4 — untrusted content stored as data (consent must be explicit true; injected consent-ish strings ignored).
{
  const cwd = tmp();
  const r = E.handleIntakeRequest({ method: "POST", headers: JSONH, body: JSON.stringify({ ...COMPLETE, consent: "yes" }) }, { cwd });
  const b = JSON.parse(r.body);
  ok("4 consent!=boolean true ⇒ HELD (not auto-consented)", b.status === "HELD");
}
console.log(`\nINTAKE ENDPOINT — ${passed} assertions passed.`);
