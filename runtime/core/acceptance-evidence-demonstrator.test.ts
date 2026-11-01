// @ts-nocheck
// acceptance-evidence-demonstrator — intake→evaluate→(reality-gate)→charter composition. All criteria observed
// true ⇒ ACCEPT chartered; any false ⇒ REJECT; any unobserved ⇒ UNKNOWN (deny-by-default, not a pass); empty
// spec ⇒ INCOMPLETE; honesty/determinism/bad-input fail-closed.
"use strict";
const assert = require("assert");
const D = require("./acceptance-evidence-demonstrator.js");
const SPEC = require("./executable-spec-intake.js");

let n = 0; const ok = (name, cond) => { n++; assert.ok(cond, name); };
const gherkin = "Feature: login\n  Scenario: ok\n    Given a user\n    When they log in\n    Then they see home";
const ids = () => (SPEC.intake(gherkin).criteria || []).map((c) => c.id);
const allObs = (val) => { const o = {}; ids().forEach((id) => (o[id] = val)); return o; };

// (1) all criteria observed true ⇒ ACCEPT chartered, no gaps.
(() => {
  const r = D.runAcceptance({ gherkin, observations: allObs(true) });
  ok("accept: verdict EVALUATED", r.ok && r.verdict === D.VERDICT.EVALUATED);
  ok("accept: criteriaVerdict ACCEPT", r.summary.criteriaVerdict === "ACCEPT");
  ok("accept: chartered true", r.summary.chartered === true);
  ok("accept: zero gaps", r.summary.gapCount === 0);
})();

// (2) a criterion observed false ⇒ REJECT dominates.
(() => {
  const r = D.runAcceptance({ gherkin, observations: allObs(false) });
  ok("reject: criteriaVerdict REJECT", r.summary.criteriaVerdict === "REJECT");
  ok("reject: a reject gap reported", r.gaps.some((g) => /REJECT/i.test(g)));
})();

// (3) an unobserved criterion ⇒ UNKNOWN (deny-by-default, never a silent pass).
(() => {
  const r = D.runAcceptance({ gherkin, observations: {} });
  ok("unknown: criteriaVerdict UNKNOWN (deny-by-default)", r.summary.criteriaVerdict === "UNKNOWN");
  ok("unknown: a deny-by-default gap reported", r.gaps.some((g) => /deny-by-default|UNKNOWN/i.test(g)));
})();

// (4) empty / non-gherkin spec ⇒ INCOMPLETE (nothing to accept).
(() => {
  const r = D.runAcceptance({ gherkin: "no scenarios here" });
  ok("empty: verdict INCOMPLETE, 0 criteria", r.verdict === D.VERDICT.INCOMPLETE && r.summary.criteriaCount === 0);
})();

// (5) optional reality-gate ladder reported when evidence supplied.
(() => {
  const r = D.runAcceptance({ gherkin, observations: allObs(true), realityEvidence: { built: true } });
  ok("reality: a reality-gate state is reported when evidence given", typeof r.summary.realityState === "string");
  const r2 = D.runAcceptance({ gherkin, observations: allObs(true) });
  ok("reality: null when no evidence (honest)", r2.summary.realityState === null);
})();

// (6) HONESTY + determinism + bad-input.
(() => {
  const r = D.runAcceptance({ gherkin, observations: allObs(true) });
  ok("honesty: basis ACCEPTANCE_EVALUATION_NOT_CORRECTNESS_PROOF", r.basis === "ACCEPTANCE_EVALUATION_NOT_CORRECTNESS_PROOF");
  ok("honesty: note disclaims correctness proof", /not a correctness proof/i.test(r.note));
  ok("bad-input: non-string gherkin ⇒ INVALID_INPUT", D.runAcceptance({ gherkin: 5 }).code === "INVALID_INPUT");
  const a = D.runAcceptance({ gherkin, observations: allObs(true) });
  const b = D.runAcceptance({ gherkin, observations: allObs(true) });
  ok("determinism: identical verdict + counts", a.summary.criteriaVerdict === b.summary.criteriaVerdict && JSON.stringify(a.summary.counts) === JSON.stringify(b.summary.counts));
})();

console.log(`acceptance-evidence-demonstrator: ${n} checks passed`);
