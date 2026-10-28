#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the demand dossier is honest-by-construction: documentary research NEVER
// yields DEMAND_VALIDATED; validation requires ≥ pre-registered threshold of verified willingness-to-pay signals;
// provenance + falsifiable hypothesis + pre-registered thresholds present; free DIY alternative disclosed; no
// fabricated prospects.
"use strict";
const assert = require("assert");
const D = require("./demand-evidence.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) default verdict = DEMAND_NOT_VALIDATED (desk research only).
const v = D.assessDemand();
ok("documentary research ⇒ DEMAND_NOT_VALIDATED", v.verdict === "DEMAND_NOT_VALIDATED" && v.validatingSignals === 0);
ok("verdict explains the free DIY alternative + no experiment run", /FREE DIY/.test(v.reason) && /no lawful willingness-to-pay experiment/.test(v.reason));

// (2) research evidence carries provenance + honest limitations (not buyer intent).
ok("every research item has source+url+date+limitation", D.DOSSIER.researchEvidence.every(e => e.source && e.url && e.date && e.limitation));
ok("adoption source limitation disclaims willingness-to-pay", D.DOSSIER.researchEvidence.some(e => /willingness to pay/i.test(e.limitation)));
ok("the strong FREE DIY competitor is disclosed", D.DOSSIER.alternatives.some(a => /FREE DIY/.test(a)));

// (3) hypothesis is falsifiable with PRE-REGISTERED thresholds, status UNTESTED.
ok("hypothesis falsifiable + UNTESTED + thresholds set before evaluation", D.DOSSIER.hypothesis.falsifiable === true && D.DOSSIER.hypothesis.status === "UNTESTED" && /≥5/.test(D.DOSSIER.hypothesis.thresholds.success));

// (4) ONLY verified transactional signals can validate — and they must meet the threshold.
const belowThreshold = { researchEvidence: D.DOSSIER.researchEvidence, marketSignals: [{ class: "willingness_to_pay", verified: true }, { class: "paid_pilot", verified: true }] };
ok("2 verified signals (< threshold) ⇒ still NOT_VALIDATED", D.assessDemand(belowThreshold).verdict === "DEMAND_NOT_VALIDATED");
const atThreshold = { marketSignals: Array.from({ length: 5 }, () => ({ class: "willingness_to_pay", verified: true })) };
ok("≥5 verified willingness-to-pay ⇒ DEMAND_VALIDATED (gate not permanently stuck)", D.assessDemand(atThreshold).verdict === "DEMAND_VALIDATED");
// unverified signals do NOT count (no fabricated/assumed responses).
const unverified = { marketSignals: Array.from({ length: 9 }, () => ({ class: "willingness_to_pay", verified: false })) };
ok("unverified signals ⇒ NOT_VALIDATED (no assumed responses)", D.assessDemand(unverified).verdict === "DEMAND_NOT_VALIDATED");

// (5) product readiness honestly incomplete (onboarding/billing/hosting NOT_IMPLEMENTED).
ok("product readiness: engine implemented, go-to-market parts NOT_IMPLEMENTED", /IMPLEMENTED/.test(D.DOSSIER.productReadiness.verificationEngine) && D.DOSSIER.productReadiness.billing === "NOT_IMPLEMENTED" && D.DOSSIER.productReadiness.onboarding === "NOT_IMPLEMENTED");

// (6) next test is owner-gated, not executed.
ok("next test is owner-gated + not executed (no external contact)", /OWNER-GATED/.test(D.DOSSIER.nextTest) && /NOT executed/.test(D.DOSSIER.nextTest));

console.log(`\nDEMAND-EVIDENCE suite — ${pass} assertions passed. (RESEARCH_EVIDENCE ≠ DEMAND_VALIDATED; pre-registered thresholds; provenance+limits; free DIY disclosed; no fabrication)`);
