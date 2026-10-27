#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves axis-D partner readiness is honest + fail-closed: qualification rubric,
// conflict/compliance disqualify, incomplete gating, one-step-only state transitions (no conflation), commission as a
// cost on collected cash, duplicate-attribution guard, and a delivery kit that ≠ partner acceptance.
"use strict";
const assert = require("assert");
const P = require("./partner-channel.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const good = { customerAccess: "mid-market CISOs", expertise: "appsec", reputation: "established", deliveryCapacity: "5 engineers", geography: "EU", targetMarket: "SaaS", compliance: { ok: true }, commercialFit: "strong" };

// (1) complete partner ⇒ QUALIFIED (not accepted).
const q = P.qualifyPartner(good);
ok("complete ⇒ QUALIFIED + state QUALIFIED + honest note", q.ok && q.verdict === "QUALIFIED" && q.state === "QUALIFIED" && /NOT an accepted partner/i.test(q.note));

// (2) conflict ⇒ DISQUALIFIED; compliance failure ⇒ DISQUALIFIED.
ok("conflict ⇒ DISQUALIFIED", P.qualifyPartner({ ...good, conflicts: true }).verdict === "DISQUALIFIED");
ok("compliance failure ⇒ DISQUALIFIED", P.qualifyPartner({ ...good, compliance: false }).verdict === "DISQUALIFIED");

// (3) missing required ⇒ INCOMPLETE (stays CANDIDATE), names missing.
const inc = P.qualifyPartner({ customerAccess: "x" });
ok("missing required ⇒ INCOMPLETE + CANDIDATE + names missing", inc.verdict === "INCOMPLETE" && inc.state === "CANDIDATE" && inc.missingRequired.includes("expertise"));

// (4) state machine: one forward step only; no skipping/conflation; DISQUALIFIED terminal.
ok("CANDIDATE→QUALIFIED ok", P.advanceState("CANDIDATE", "QUALIFIED").ok === true);
ok("skip CANDIDATE→ACCEPTED rejected (no conflation)", P.advanceState("CANDIDATE", "ACCEPTED").code === "ILLEGAL_TRANSITION");
ok("backward rejected", P.advanceState("ACCEPTED", "QUALIFIED").code === "ILLEGAL_TRANSITION");
ok("any→DISQUALIFIED allowed (terminal)", P.advanceState("NEGOTIATING", "DISQUALIFIED").ok === true);

// (5) commission is a cost on collected cash; fail-closed on invalid economics.
const c = P.commission({ dealValue: 10000, pct: 0.2, type: "referral" });
ok("commission computed + net reduced + basis collected", c.ok && c.commissionAmount === 2000 && c.netAfterCommission === 8000 && c.basis === "collected" && c.marginImpactPct === 20);
ok("fail-closed: invalid pct / negative deal ⇒ INVALID_ECONOMICS", P.commission({ dealValue: 100, pct: 1.5 }).code === "INVALID_ECONOMICS" && P.commission({ dealValue: -1, pct: 0.1 }).code === "INVALID_ECONOMICS");

// (6) duplicate-attribution guard: a deal counts for ONE partner only.
const attr = P.attributeDeals([{ dealId: "D1", partner: "PA" }, { dealId: "D1", partner: "PB" }, { dealId: "D2", partner: "PA" }]);
ok("duplicate attribution dropped (one deal ⇒ one partner)", attr.uniqueCount === 2 && attr.duplicateCount === 1 && attr.duplicates[0].dealId === "D1");

// (7) delivery kit covers A/B/C/E + states a kit ≠ acceptance.
const kit = P.deliveryKit();
ok("delivery kit covers A/B/C/E + kit≠acceptance", kit.serviceCatalogue.map(x => x.axis).sort().join("") === "ABCE" && kit.reusableKit.handoffChecklist.length > 0 && /does NOT mean a partner is accepted/i.test(kit.note));

// (8) fail-closed input.
ok("fail-closed: non-object ⇒ INVALID_INPUT", P.qualifyPartner(null).code === "INVALID_INPUT");

console.log(`\nPARTNER-CHANNEL suite — ${pass} assertions passed. (qualification; disqualify; one-step states; commission cost; dedup; kit≠acceptance)`);
