#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves executable-spec-intake (G-03): parse client Gherkin into named
// acceptance criteria and evaluate with mechanical-acceptance's deny-by-default precedence — fail-closed and
// honest: PARSE_ERROR on no Feature/Scenario, NO_CRITERIA when a spec yields no Then, an UNOBSERVED criterion
// ⇒ UNKNOWN (never auto-ACCEPT), a false observation ⇒ REJECT, ACCEPT only when every criterion is observed
// true, And-after-When is NOT a criterion. Reuses mechanical-acceptance VERDICT/PRECEDENCE (no duplication).
"use strict";
const assert = require("assert");
const X = require("./executable-spec-intake.js");
const MA = require("./mechanical-acceptance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) FAIL-CLOSED parse: no Feature, no Scenario, empty.
{
  ok("empty ⇒ PARSE_ERROR", X.parseGherkin("").code === "PARSE_ERROR");
  ok("no Feature ⇒ PARSE_ERROR", X.parseGherkin("Scenario: x\n Then y").code === "PARSE_ERROR");
  ok("Feature but no Scenario ⇒ PARSE_ERROR", X.parseGherkin("Feature: f").code === "PARSE_ERROR");
}

// (2) a scenario with no Then ⇒ NO_CRITERIA (cannot accept against nothing).
{
  const r = X.intake("Feature: f\n Scenario: s\n  Given a\n  When b");
  ok("scenario without Then ⇒ NO_CRITERIA", r.ok === false && r.code === "NO_CRITERIA");
}

// (3) parse + extract: Then and And-after-Then are criteria; And-after-When is NOT.
{
  const spec = "Feature: invoice\n  Scenario: round-trip\n    Given a valid CII invoice\n    And it has two lines\n    When it is exported and re-parsed\n    Then the totals are preserved\n    And the schema still validates\n";
  const r = X.intake(spec);
  ok("extracts exactly 2 criteria (the Then + the And-after-Then), NOT the And-after-Given/When", r.ok && r.count === 2);
  ok("criteria carry id + scenario + text", r.criteria[0].id === "s1-then1" && r.criteria[1].id === "s1-then2" && /totals are preserved/.test(r.criteria[0].text));
}

// (4) HONESTY: an UNOBSERVED criterion ⇒ UNKNOWN overall (deny-by-default, never auto-ACCEPT).
{
  const r = X.intake("Feature: f\n Scenario: s\n  Then a holds\n  And b holds");
  const ev = X.evaluateCriteria(r.criteria, { "s1-then1": true }); // then2 unobserved
  ok("one observed-true, one unobserved ⇒ overall UNKNOWN (not ACCEPT)", ev.overall === MA.VERDICT.UNKNOWN && ev.counts.unknown === 1 && ev.counts.accept === 1);
  ok("UNKNOWN note says the spec is NOT accepted", /NOT accepted/.test(ev.note));
}

// (5) a FALSE observation ⇒ REJECT (precedence over unknown/accept).
{
  const r = X.intake("Feature: f\n Scenario: s\n  Then a\n  And b\n  And c");
  const ev = X.evaluateCriteria(r.criteria, { "s1-then1": true, "s1-then2": false }); // then3 unobserved
  ok("any false ⇒ overall REJECT (precedence)", ev.overall === MA.VERDICT.REJECT && ev.counts.reject === 1);
}

// (6) ACCEPT only when EVERY criterion is observed true.
{
  const r = X.intake("Feature: f\n Scenario: s\n  Then a\n  And b");
  const ev = X.evaluateCriteria(r.criteria, { "s1-then1": true, "s1-then2": true });
  ok("all observed true ⇒ overall ACCEPT, counts.accept === criteria count", ev.overall === MA.VERDICT.ACCEPT && ev.counts.accept === 2 && ev.counts.unknown === 0 && ev.counts.reject === 0);
}

// (7) non-boolean / object observation shapes handled; non-boolean ⇒ UNKNOWN (deny-by-default).
{
  const r = X.intake("Feature: f\n Scenario: s\n  Then a\n  And b");
  const ev = X.evaluateCriteria(r.criteria, { "s1-then1": { result: true }, "s1-then2": "yes" }); // "yes" is not boolean ⇒ UNKNOWN
  ok("{result:true} ⇒ ACCEPT for that criterion; a non-boolean observation ⇒ UNKNOWN (not coerced true)",
     ev.criteria.find((c) => c.id === "s1-then1").verdict === MA.VERDICT.ACCEPT &&
     ev.criteria.find((c) => c.id === "s1-then2").verdict === MA.VERDICT.UNKNOWN && ev.overall === MA.VERDICT.UNKNOWN);
}

// (8) reuses mechanical-acceptance's own precedence (no parallel vocabulary).
{
  const r = X.intake("Feature: f\n Scenario: s\n  Then a");
  const ev = X.evaluateCriteria(r.criteria, {});
  ok("precedence echoed from mechanical-acceptance (REJECT>BLOCKED>UNKNOWN>ACCEPT)", JSON.stringify(ev.precedence) === JSON.stringify(MA.PRECEDENCE));
  ok("empty observations ⇒ all UNKNOWN ⇒ overall UNKNOWN", ev.overall === MA.VERDICT.UNKNOWN);
}

// (9) multi-scenario ids are namespaced per scenario.
{
  const spec = "Feature: f\n Scenario: one\n  Then a\n Scenario: two\n  Then b\n  And c";
  const r = X.intake(spec);
  ok("scenario-namespaced ids (s1-then1, s2-then1, s2-then2), count 3", r.count === 3 && r.criteria.map((c) => c.id).join(",") === "s1-then1,s2-then1,s2-then2");
}

console.log(`\nexecutable-spec-intake: ${pass} assertions passed`);
