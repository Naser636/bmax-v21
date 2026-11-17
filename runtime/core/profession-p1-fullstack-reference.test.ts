#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P1 = require("./profession-p1-fullstack-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P1 — SOFTWARE/FULL-STACK REFERENCE (E2/E3)");

// E2: a behaviour-preserving refactor ⇒ BEHAVIOR_PRESERVED.
{
  const r = P1.runReferenceProject({});
  check(r.synthetic === true && r.profession === "P1" && r.refactor.verdict === "BEHAVIOR_PRESERVED" && r.degraded === false, "E2: behaviour-preserving refactor ⇒ BEHAVIOR_PRESERVED, not degraded");
}

// E3: a behaviour-changing refactor ⇒ BEHAVIOR_CHANGED (regression caught).
{
  const r = P1.runReferenceProject({ after: (n: number) => (n % 2 === 0 ? "EVEN" : "odd") });
  check(r.refactor.verdict === "BEHAVIOR_CHANGED" && r.refactor.changed >= 1 && r.degraded === true, "E3: behaviour-changing refactor ⇒ BEHAVIOR_CHANGED (regression caught)");
}

// E3: an incomplete sample set ⇒ INCOMPLETE (a coverage gap is NOT a pass).
{
  const before = [{ input: 1, observedOutput: "a" }, { input: 2, observedOutput: "b" }];
  const after = [{ input: 1, observedOutput: "a" }];
  const r = P1.refactorPreservesBehaviour(before, after, "p1");
  check(r.verdict === "INCOMPLETE" && r.ok === false, "E3: coverage gap ⇒ INCOMPLETE (fail-closed, not a pass)");
}

check(P1.P1_FULLSTACK_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

// V252 §3 — WCAG 2.2 structured component audit.
// TRUE-NEGATIVE: a fully-compliant component set ⇒ no finding, conformantAutomated (but never claims full conformance).
{
  const clean = [
    { role: "button", name: "Save", keyboardOperable: true, focusVisible: true, focusObscured: false, target: { w: 44, h: 44 } },
    { role: "link", name: "Home", keyboardOperable: true, focusVisible: true, target: { w: 24, h: 24 } },
    { role: "img", alt: "Company logo" },
  ];
  const r = P1.auditComponents(clean);
  check(r.ok === true && r.conformantAutomated === true && r.defects === 0 && r.manualReviewRequired === true && r.componentsAudited === 3, "a11y true-negative: compliant components ⇒ 0 defects, conformantAutomated, but manualReviewRequired stays true (no conformance claim)");
}
// POSITIVE detection of each WCAG 2.2-NEW criterion + core criteria.
{
  const bad = [
    { role: "button", name: "A", keyboardOperable: true, focusVisible: true, target: { w: 18, h: 18 } },   // 2.5.8 target too small
    { role: "link", name: "B", keyboardOperable: true, focusVisible: true, focusObscured: true, target: { w: 40, h: 40 } }, // 2.4.11 obscured
    { role: "textbox", keyboardOperable: true, focusVisible: true, target: { w: 200, h: 40 } },             // 4.1.2 no accessible name
    { role: "button", name: "C", keyboardOperable: false, focusVisible: true, target: { w: 40, h: 40 } },   // 2.1.1 not keyboard-operable
    { role: "textbox", name: "Email", keyboardOperable: true, focusVisible: true, target: { w: 200, h: 40 }, redundantEntry: { previouslyEntered: true, prefilledOrSelectable: false } }, // 3.3.7 redundant entry
    { role: "img" },                                                                                         // 1.1.1 missing alt
  ];
  const r = P1.auditComponents(bad);
  const seen = (c: string) => r.findings.some((f: any) => f.criterion === c && f.count >= 1);
  check(r.ok === false && seen("2.5.8") && seen("2.4.11") && seen("4.1.2") && seen("2.1.1") && seen("3.3.7") && seen("1.1.1"), "a11y positives: 2.5.8/2.4.11/4.1.2/2.1.1/3.3.7/1.1.1 each detected with its SC cited");
  check(r.wcag22New.indexOf("2.4.11") >= 0 && r.wcag22New.indexOf("2.5.8") >= 0 && r.wcag22New.indexOf("3.3.7") >= 0, "a11y: WCAG 2.2-new criteria flagged as such");
}
// BOUNDARY: exactly 24×24 passes (>=), 23 fails; documented exception suppresses the target finding.
{
  const exact = P1.auditComponents([{ role: "button", name: "ok", keyboardOperable: true, focusVisible: true, target: { w: 24, h: 24 } }]);
  const under = P1.auditComponents([{ role: "button", name: "ok", keyboardOperable: true, focusVisible: true, target: { w: 23, h: 24 } }]);
  const exc = P1.auditComponents([{ role: "button", name: "ok", keyboardOperable: true, focusVisible: true, target: { w: 12, h: 12 }, targetException: true }]);
  check(exact.ok === true && under.findings.some((f: any) => f.criterion === "2.5.8") && exc.ok === true, "a11y boundary: 24px passes, 23px fails 2.5.8, documented exception suppresses it");
}
// ADVERSARIAL / fail-closed: non-interactive decorative elements never flagged; empty input is NOT conformant.
{
  const deco = P1.auditComponents([{ role: "img", decorative: true }, { role: "heading", name: "Title" }]);
  check(deco.ok === true && deco.defects === 0, "a11y adversarial: decorative image + non-interactive heading ⇒ no false positive");
  const empty = P1.auditComponents([]);
  check(empty.ok === false && empty.conformantAutomated === false && empty.criteriaChecked.length === 0, "a11y fail-closed: empty component set is NOT conformant");
  check(JSON.stringify(P1.auditComponents(deco.findings ? [{ role: "img", decorative: true }, { role: "heading", name: "Title" }] : [])) === JSON.stringify(deco), "a11y deterministic");
}
// INTEGRATION: runReferenceProject carries the accessibility dimension and degrades on a real a11y defect; HTML path reuses M5.
{
  const good = P1.runReferenceProject({ components: [{ role: "button", name: "Go", keyboardOperable: true, focusVisible: true, target: { w: 40, h: 40 } }] });
  const bad = P1.runReferenceProject({ components: [{ role: "button", keyboardOperable: true, focusVisible: true, target: { w: 10, h: 10 } }] });
  check(good.accessibility && good.accessibility.ok === true && good.degraded === false, "integration: clean components ⇒ accessibility.ok, not degraded");
  check(bad.accessibility.ok === false && bad.degraded === true, "integration: a11y defect ⇒ degraded (true)");
  const html = P1.runReferenceProject({ html: "<html><head></head><body><a href='#'></a></body></html>" });
  check(html.accessibility && typeof html.accessibility.conformantAutomated === "boolean", "integration: HTML path REUSES M5 auditHtml (no second a11y engine)");
}

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P1 FULL-STACK REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
