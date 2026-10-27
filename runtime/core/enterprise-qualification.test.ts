#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves axis-C qualification is honest + fail-closed: a complete record QUALIFIES
// (maps to the commercial-pipeline QUALIFIED stage), a missing required fact ⇒ INCOMPLETE (never QUALIFIED), an
// explicit no-budget/no-authority ⇒ DISQUALIFIED, estimated probability is an assumption separate from (NO_DATA)
// observed conversion, and no prospect/budget is invented.
"use strict";
const assert = require("assert");
const Q = require("./enterprise-qualification.js");
const CP = require("./commercial-pipeline.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const fullRecord = {
  problem: "release blocked by unverified supply-chain risk",
  impact: "delays enterprise security review by weeks",
  budget: { range: "8k-15k", status: "FUNDED" },
  authority: { identified: true, role: "CISO" },
  timeline: "this quarter",
  deliveryCapacity: "1 specialist + subcontractor",
  acceptanceCriteria: ["evidence-mapped controls", "signed roadmap"],
  urgency: "high", procurement: "standard PO", complianceNeeds: ["ISO 27001 evidence"], paymentMilestones: [{ pct: 50 }, { pct: 50 }],
};

// (1) complete record ⇒ QUALIFIED + pipeline stage QUALIFIED.
const q = Q.qualify(fullRecord);
ok("complete record ⇒ QUALIFIED", q.ok && q.verdict === "QUALIFIED" && q.missingRequired.length === 0 && q.disqualifiers.length === 0);
ok("maps to the real commercial-pipeline QUALIFIED stage", q.pipelineStage === "QUALIFIED" && CP.STAGES.includes(q.pipelineStage) && q.stageIndex === CP.STAGES.indexOf("QUALIFIED"));

// (2) estimated probability is an ASSUMPTION, observed conversion is NO_DATA.
ok("estimatedProbability is an estimate (0,1]; observedConversion NO_DATA", q.estimatedProbability > 0 && q.estimatedProbability <= 1 && q.observedConversion === null);
ok("note separates estimate from observed + 'not a won deal'", /ASSUMPTION/i.test(q.note) && /NO_DATA/i.test(q.note) && /NOT a won deal/i.test(q.note));

// (3) missing a REQUIRED dimension ⇒ INCOMPLETE (never QUALIFIED), probability 0.
const { acceptanceCriteria, ...noAccept } = fullRecord;
const inc = Q.qualify(noAccept);
ok("missing required ⇒ INCOMPLETE + names it + prob 0 + no pipeline stage", inc.verdict === "INCOMPLETE" && inc.missingRequired.includes("acceptanceCriteria") && inc.estimatedProbability === 0 && inc.pipelineStage === null);

// (4) explicit no-budget ⇒ DISQUALIFIED.
const noBudget = { ...fullRecord, budget: { status: "NONE" } };
const dq = Q.qualify(noBudget);
ok("no budget ⇒ DISQUALIFIED with reason", dq.verdict === "DISQUALIFIED" && dq.disqualifiers.some(r => /budget/i.test(r)));

// (5) no authority ⇒ DISQUALIFIED.
const noAuth = { ...fullRecord, authority: { identified: false } };
ok("no decision authority ⇒ DISQUALIFIED", Q.qualify(noAuth).verdict === "DISQUALIFIED" && Q.qualify(noAuth).disqualifiers.some(r => /authority/i.test(r)));

// (6) disqualifier takes precedence over missing required.
const both = { budget: { status: "NONE" } };
ok("disqualifier precedes incompleteness", Q.qualify(both).verdict === "DISQUALIFIED");

// (7) coverage flags each dimension; required set is the gating subset.
ok("coverage + required exposed", Object.keys(q.coverage).length === Q.DIMENSIONS.length && Q.REQUIRED.length >= 5 && Q.REQUIRED.every(k => Q.DIMENSIONS.find(d => d.key === k).required));

// (8) higher coverage ⇒ higher estimate (monotone), still an assumption.
const lean = { problem: "p", impact: "i", budget: { range: "x", status: "FUNDED" }, authority: { identified: true }, timeline: "t", deliveryCapacity: "c", acceptanceCriteria: ["a"] };
ok("fuller record ⇒ higher estimated probability", Q.qualify(fullRecord).estimatedProbability > Q.qualify(lean).estimatedProbability);

// (9) fail-closed input.
ok("fail-closed: non-object ⇒ INVALID_INPUT", Q.qualify(null).code === "INVALID_INPUT" && Q.qualify(42).code === "INVALID_INPUT");

// (10) deterministic.
ok("reproducible", JSON.stringify(Q.qualify(fullRecord)) === JSON.stringify(Q.qualify(fullRecord)));

console.log(`\nENTERPRISE-QUALIFICATION suite — ${pass} assertions passed. (QUALIFIED/INCOMPLETE/DISQUALIFIED; estimate≠observed; pipeline stage; fail-closed)`);
