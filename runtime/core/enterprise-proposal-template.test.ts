#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves axis-C proposal templates are gated to QUALIFIED opportunities, separate known
// facts from hypotheses, derive price from scope (not a target), invent no customer data, flag legal-review items, and
// reject overclaiming language. PREPARED only.
"use strict";
const assert = require("assert");
const T = require("./enterprise-proposal-template.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const qualified = {
  problem: "unverified supply-chain risk blocks the enterprise security review",
  impact: "delays a major deal by weeks",
  budget: { range: "8k-15k", status: "FUNDED" },
  authority: { identified: true, role: "CISO" },
  timeline: "this quarter",
  deliveryCapacity: "1 specialist + subcontractor",
  acceptanceCriteria: ["evidence-mapped controls", "signed roadmap"],
  contractualConstraints: ["MSA required"],
};
const mission = { ref: "E1", scope: "s", deliverables: ["d"], milestones: [{ hours: 120, qaHours: 20 }], acceptanceCriteria: ["a"], exclusions: ["e"], assumptions: ["x"], paymentSchedule: [{ pct: 50 }, { pct: 50 }], supportBoundary: "b", changeControl: "c", proposedPrice: 14000, hourlyRate: 95, soloCapacityHours: 2000 };

// (1) QUALIFIED + mission ⇒ template PREPARED with scope-derived price.
const r = T.buildTemplate({ customerRef: "PROSPECT-001", qualification: qualified, mission });
ok("QUALIFIED opportunity ⇒ PREPARED template", r.ok && r.template.status === "PREPARED" && r.verdict === "QUALIFIED");
ok("price is scope-derived (enterprise-mission-model), not a target", r.template.pricing.source === "scope-derived" && typeof r.template.pricing.justifiedPrice === "number");

// (2) known facts separated from hypotheses/open questions.
ok("known facts from the record; hypotheses + open questions separate", isObjNonEmpty(r.template.verifiedRequirements) && r.template.hypotheses.length > 0 && r.template.openQuestions.length > 0 && r.template.verifiedRequirements.problem === qualified.problem);
function isObjNonEmpty(o) { return o && typeof o === "object" && Object.keys(o).length > 0; }

// (3) no fabricated customer identity (ref only, caller-supplied).
ok("customer identity is a ref only (no invented name)", r.template.customerRef === "PROSPECT-001");
const r2 = T.buildTemplate({ qualification: qualified, mission });
ok("absent customerRef ⇒ placeholder, never invented", /no real name/i.test(r2.template.customerRef));

// (4) legal-review items flagged (incl. recorded contractual constraints).
ok("legal-review items flagged", r.template.legalReviewItems.some(x => /liability/i.test(x)) && r.template.legalReviewItems.some(x => /contractual constraints/i.test(x)));

// (5) anti-overclaim scan ran (clean for a factual narrative).
ok("anti-overclaim scan present + clean for factual text", r.antiOverclaim && typeof r.antiOverclaim.clean === "boolean" && r.antiOverclaim.clean === true);

// (6) NOT qualified ⇒ refused (no template emitted).
const incomplete = { problem: "p" }; // missing required dims
const ri = T.buildTemplate({ qualification: incomplete });
ok("incomplete qualification ⇒ NOT_QUALIFIED, no template", ri.ok === false && ri.code === "NOT_QUALIFIED" && Array.isArray(ri.missing) && ri.missing.length > 0);
const noBudget = { ...qualified, budget: { status: "NONE" } };
ok("disqualified ⇒ NOT_QUALIFIED refusal", T.buildTemplate({ qualification: noBudget }).code === "NOT_QUALIFIED");

// (7) no mission ⇒ price is an OPEN QUESTION (never a target).
const noMission = T.buildTemplate({ qualification: qualified });
ok("no mission SOW ⇒ price OPEN_QUESTION (scope-dependent, never a target)", noMission.template.pricing.source === "OPEN_QUESTION" && noMission.template.openQuestions.some(x => /price/i.test(x)));

// (8) honesty note + estimated probability is an assumption; fail-closed; reproducible.
ok("note: PREPARED, facts≠hypotheses, price scope-derived, estimate assumption", /PREPARED/i.test(r.note) && /ASSUMPTION/i.test(r.note) && typeof r.estimatedProbability === "number");
ok("fail-closed: no qualification ⇒ INVALID_INPUT", T.buildTemplate({}).code === "INVALID_INPUT" && T.buildTemplate(null).code === "INVALID_INPUT");
ok("reproducible", JSON.stringify(T.buildTemplate({ customerRef: "PROSPECT-001", qualification: qualified, mission })) === JSON.stringify(r));

console.log(`\nENTERPRISE-PROPOSAL-TEMPLATE suite — ${pass} assertions passed. (QUALIFIED-gated; facts≠hypotheses; scope-derived price; no invented data; anti-overclaim; PREPARED)`);
