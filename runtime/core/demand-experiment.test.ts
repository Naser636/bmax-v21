#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the WTP experiment prep: FROZEN pre-registered protocol, fail-closed signal
// validation (every required field + lawful basis + anti-fabrication), and that reality (zero signals) ⇒
// DEMAND_NOT_VALIDATED. No outreach, no fabricated prospects.
"use strict";
const assert = require("assert");
const X = require("./demand-experiment.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const goodSignal = (i) => ({ class: "willingness_to_pay", prospectId: `team-${i}`, source: `call-note-${i}#crm-4821`, capturedAt: "2026-10-28T10:00:00Z", priceEur: 49, lawfulBasis: "documented legitimate interest (B2B), opt-out offered" });

// (1) pre-registered protocol is frozen + declares the threshold up front + NOT executed.
ok("protocol frozen, threshold ≥5 pre-registered, status NOT_EXECUTED", Object.isFrozen(X.PROTOCOL) && X.SUCCESS_THRESHOLD === 5 && /NOT_EXECUTED/.test(X.PROTOCOL.status));

// (2) a complete, lawful WTP signal validates.
ok("complete lawful WTP signal ⇒ valid", X.validateSignal(goodSignal(1)).valid === true);

// (3) each required field is mandatory (fail-closed).
for (const f of ["prospectId", "source", "capturedAt", "priceEur", "lawfulBasis"]) {
  const s = goodSignal(2); delete s[f];
  ok(`missing ${f} ⇒ invalid`, X.validateSignal(s).valid === false && X.validateSignal(s).reasons.length > 0);
}

// (4) non-validating class rejected (desk research can't validate).
ok("class 'desk_research' ⇒ invalid", X.validateSignal({ ...goodSignal(3), class: "desk_research" }).valid === false);

// (5) anti-fabrication: explicit simulated flag, and synthetic placeholders, rejected.
ok("simulated:true ⇒ invalid", X.validateSignal({ ...goodSignal(4), simulated: true }).valid === false);
ok("synthetic prospectId 'example-corp' ⇒ invalid", X.validateSignal({ ...goodSignal(5), prospectId: "example-corp" }).valid === false);
ok("non-positive price ⇒ invalid", X.validateSignal({ ...goodSignal(6), priceEur: 0 }).valid === false);

// (6) tally splits valid vs invalid with reasons.
const t = X.tallySignals([goodSignal(7), { class: "willingness_to_pay" }]);
ok("tally: 1 valid, 1 invalid (reasons present)", t.validCount === 1 && t.invalidCount === 1 && t.invalid[0].reasons.length > 0);

// (7) reality: zero signals ⇒ DEMAND_NOT_VALIDATED (experiment not executed, nothing fabricated).
const live = X.assessExperiment([]);
ok("zero signals ⇒ DEMAND_NOT_VALIDATED (not executed)", live.verdict === "DEMAND_NOT_VALIDATED" && live.validCount === 0 && /NOT been executed/.test(live.note));

// (8) 4 valid < threshold ⇒ still NOT_VALIDATED; 5 valid ⇒ VALIDATED (threshold honoured exactly).
ok("4 valid < 5 ⇒ NOT_VALIDATED", X.assessExperiment([1, 2, 3, 4].map(goodSignal)).verdict === "DEMAND_NOT_VALIDATED");
ok("5 valid ⇒ DEMAND_VALIDATED (threshold met)", X.assessExperiment([1, 2, 3, 4, 5].map(goodSignal)).verdict === "DEMAND_VALIDATED");

// (9) invalid signals do NOT count toward the threshold (can't pad with junk).
ok("5 invalid signals ⇒ still NOT_VALIDATED (junk can't pad)", X.assessExperiment([1, 2, 3, 4, 5].map(() => ({ class: "willingness_to_pay" }))).verdict === "DEMAND_NOT_VALIDATED");

console.log(`\nDEMAND-EXPERIMENT suite — ${pass} assertions passed. (frozen pre-registration; fail-closed lawful WTP validation; anti-fabrication; zero-signal ⇒ NOT_VALIDATED; threshold honoured)`);
