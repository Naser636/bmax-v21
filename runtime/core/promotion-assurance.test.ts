#!/usr/bin/env node
"use strict";

const A = require("./promotion-assurance");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

const goodProposal = { candidateId: "frontier-prop:cand:x", status: "PROPOSED", grantsNoPermission: true };
const goodCtx = { policy: "ALLOW", truthLock: "SATISFIED", externalAuthorization: { approved: true, authorizedBy: "odg-cto" }, independentVerification: { verdict: "PASS", by: "frontier-lab/independent" } };

// (1) all controls satisfied ⇒ PROMOTE.
check(A.evaluatePromotion(goodProposal, goodCtx).verdict === "PROMOTE", "all controls satisfied ⇒ PROMOTE");

// (2) FALSIFICATION — each required control, when missing/false, must REFUSE (deny-by-default). Exhaustive.
check(A.evaluatePromotion({ ...goodProposal, status: "ACCEPTED" }, goodCtx).verdict === "REFUSE", "proposal not PROPOSED/READY ⇒ REFUSE");
check(A.evaluatePromotion({ ...goodProposal, grantsNoPermission: false }, goodCtx).verdict === "REFUSE", "proposal grants a permission (proposition=autorisation) ⇒ REFUSE");
check(A.evaluatePromotion({ ...goodProposal, selfAuthorized: true }, goodCtx).verdict === "REFUSE", "self-authorized proposal ⇒ REFUSE");
check(A.evaluatePromotion(goodProposal, { ...goodCtx, policy: "DENY" }).verdict === "REFUSE", "POLICY not ALLOW ⇒ REFUSE");
check(A.evaluatePromotion(goodProposal, { ...goodCtx, truthLock: "BLOCKED" }).verdict === "REFUSE", "Truth Lock not satisfied ⇒ REFUSE");
check(A.evaluatePromotion(goodProposal, { ...goodCtx, externalAuthorization: null }).verdict === "REFUSE", "no external authorization (Radar cannot self-authorize) ⇒ REFUSE");
check(A.evaluatePromotion(goodProposal, { ...goodCtx, externalAuthorization: { approved: false, authorizedBy: "odg-cto" } }).verdict === "REFUSE", "external authorization not approved ⇒ REFUSE");
check(A.evaluatePromotion(goodProposal, { ...goodCtx, independentVerification: null }).verdict === "REFUSE", "no independent verification ⇒ REFUSE");
check(A.evaluatePromotion(goodProposal, { ...goodCtx, independentVerification: { verdict: "FAIL", by: "frontier-lab/independent" } }).verdict === "REFUSE", "independent verification FAIL ⇒ REFUSE");

// (3) KEY FALSIFICATION — a PASS that is the PROPOSER's own measurement is NOT independent ⇒ REFUSE.
const proposerMeasured = A.evaluatePromotion(goodProposal, { ...goodCtx, independentVerification: { verdict: "PASS", by: "proposer", proposerMeasured: true } });
check(proposerMeasured.verdict === "REFUSE" && proposerMeasured.missing.includes("independentVerification"), "a proposer-measured PASS is NOT independent assurance ⇒ REFUSE");

// (4) the `missing` list names exactly the failed controls.
const twoBad = A.evaluatePromotion(goodProposal, { ...goodCtx, policy: "DENY", truthLock: "BLOCKED" });
check(twoBad.missing.includes("policyAllow") && twoBad.missing.includes("truthLockSatisfied") && twoBad.missing.length === 2, "missing lists exactly the failed controls");

// (5) empty/garbage input ⇒ REFUSE (fail-closed), never a silent PROMOTE.
check(A.evaluatePromotion(null, null).verdict === "REFUSE", "null input ⇒ REFUSE (fail-closed)");
check(A.evaluatePromotion({}, {}).verdict === "REFUSE", "empty input ⇒ REFUSE (fail-closed)");

// (6) contract invariants present.
check(/independent assurance ≠ the proposer's own measurement/i.test(JSON.stringify(A.PROMOTION_ASSURANCE_CONTRACT.invariants)), "contract: independent ≠ proposer-measured");
check(/Radar cannot self-authorize/i.test(JSON.stringify(A.PROMOTION_ASSURANCE_CONTRACT.invariants)), "contract: no self-authorization");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 PROMOTION-ASSURANCE GATE\n");
process.exit(failures === 0 ? 0 : 1);

export {};
