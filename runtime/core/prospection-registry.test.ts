#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the registry is honest-by-construction: a prepared message is NEVER sent;
// SENT requires provider proof + human auth + compliance; non-compliant/opted-out blocked; dedup across flows; opt-out
// blocks future contact. Nothing claimed sent without proof.
"use strict";
const assert = require("assert");
const R = require("./prospection-registry.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

let reg = R.newRegistry();
const human = { by: "human", owner: "CTO" };

// (1) compliant + authorized but NO provider proof ⇒ AUTHORIZED_NOT_SENT (never SENT on record).
reg = R.recordAttempt(reg, { prospect: "ACME", channel: "email", messageVersion: "v1", compliance: { ok: true }, authorization: human }).registry;
ok("authorized+compliant, no proof ⇒ AUTHORIZED_NOT_SENT (not SENT)", reg.entries[0].sendStatus === "AUTHORIZED_NOT_SENT");
// (2) non-compliant ⇒ BLOCKED_NONCOMPLIANT.
reg = R.recordAttempt(reg, { prospect: "BETA", channel: "email", compliance: { ok: false, violations: [{}] }, authorization: human }).registry;
ok("non-compliant ⇒ BLOCKED_NONCOMPLIANT", reg.entries[1].sendStatus === "BLOCKED_NONCOMPLIANT");
// (3) compliant but no auth ⇒ PREPARED_PENDING_AUTH.
reg = R.recordAttempt(reg, { prospect: "GAMMA", channel: "email", compliance: { ok: true } }).registry;
ok("compliant, no auth ⇒ PREPARED_PENDING_AUTH", reg.entries[2].sendStatus === "PREPARED_PENDING_AUTH");

// (4) markSent WITHOUT provider proof ⇒ refused (cannot claim sent).
ok("markSent without proof ⇒ refused", R.markSent(reg, reg.entries[0].id, {}, human).ok === false);
// (5) markSent with proof + auth + compliant ⇒ SENT with messageId.
const ms = R.markSent(reg, reg.entries[0].id, { messageId: "<abc@gmail>" }, human);
ok("markSent with provider proof ⇒ SENT + messageId", ms.ok && reg.entries[0].sendStatus === "SENT" && reg.entries[0].sendProof.messageId === "<abc@gmail>");
// (6) markSent on a non-compliant entry ⇒ refused.
ok("markSent non-compliant ⇒ refused", R.markSent(reg, reg.entries[1].id, { messageId: "x" }, human).ok === false);

// (7) dedup: ACME/email already attempted (non-blocked) ⇒ isDuplicate true; canContact false after SENT.
ok("dedup detects existing ACME/email; canContact false after SENT", R.isDuplicate(reg, "ACME", "email") === true && R.canContact(reg, "ACME", "email") === false);
// (8) opt-out blocks future contact + future recordAttempt.
R.optOut(reg, "DELTA");
reg = R.recordAttempt(reg, { prospect: "DELTA", channel: "email", compliance: { ok: true }, authorization: human }).registry;
ok("opt-out ⇒ BLOCKED_OPTED_OUT + canContact false", reg.entries[reg.entries.length - 1].sendStatus === "BLOCKED_OPTED_OUT" && R.canContact(reg, "DELTA", "email") === false);

// (9) summary honest: exactly 1 SENT (only the one with proof).
const sum = R.summary(reg);
ok("summary: exactly 1 SENT (proof-backed)", sum.sent === 1 && sum.total === reg.entries.length);

console.log(`\nPROSPECTION-REGISTRY suite — ${pass} assertions passed. (prepared≠sent; proof-required; dedup; opt-out)`);
