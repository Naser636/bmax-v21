#!/usr/bin/env node
"use strict";

/*
 * V12.4 §43 P1 — Software/Full-Stack reference project (E2 + E3). PURE, deterministic. The P1 capability signal is
 * "change software WITHOUT regressing observed behaviour". It REUSES characterization-baseline (captureBaseline +
 * compareToBaseline — a sealed behavioural net, fail-closed) with NO second baseline engine, and DEMONSTRATES: a
 * behaviour-preserving refactor => BEHAVIOR_PRESERVED; a behaviour-changing one => BEHAVIOR_CHANGED (regression
 * caught); an incomplete sample set => INCOMPLETE (a coverage gap is NOT a pass). Synthetic; dual export.
 */

const CB = require("./characterization-baseline");
const AC = require("./accessibility-check");   // V145 M5 WCAG 2.1 HTML auditor — REUSED for the HTML path (no second a11y engine)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

// V252 §3 — WCAG 2.2 front-end accessibility is a core FULL-STACK concern P1 did not cover. The M5 auditHtml (AC) checks a
// WCAG 2.1 subset over an HTML STRING; it does NOT cover the WCAG 2.2-NEW, machine-checkable criteria on a STRUCTURED
// component model. auditComponents fills exactly that gap (no duplication): a clean automated pass is NEVER a conformance
// declaration — cognitive/contrast/reading-order criteria still require manual expert + browser review. Reference:
// W3C WCAG 2.2 (Recommendation 2023-10-05) https://www.w3.org/TR/WCAG22/ . Fail-closed; deterministic.
const WCAG22_TARGET_MIN = 24;   // SC 2.5.8 Target Size (Minimum): 24×24 CSS px, with documented exceptions
const INTERACTIVE_ROLES = Object.freeze(["button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox", "menuitem", "tab", "switch", "slider", "option", "spinbutton"]);

/** auditComponents(components, opts) -> AUTOMATED WCAG 2.2 subset over a structured component list. Each finding cites its SC.
 * components: [{ role, name?, interactive?, keyboardOperable?, focusVisible?, focusObscured?, target?:{w,h}, targetException?,
 * redundantEntry?:{previouslyEntered, prefilledOrSelectable, exception?}, nonText?, alt?, decorative? }]. */
function auditComponents(components: any, _opts?: any): any {
  const list = arr(components).filter(isObj);
  if (list.length === 0) return Object.freeze({ ok: false, conformantAutomated: false, automatedOnly: true, manualReviewRequired: true, componentsAudited: 0, defects: 0, findings: Object.freeze([Object.freeze({ criterion: "INPUT", level: "N/A", detail: "no components supplied — cannot audit (fail-closed)", count: 0, kind: "FAIL_CLOSED" })]), criteriaChecked: Object.freeze([]), wcag22New: Object.freeze([]), note: "fail-closed: empty input is NOT conformant" });
  const isInteractive = (c: any) => INTERACTIVE_ROLES.indexOf(String(c.role || "").toLowerCase()) >= 0 || c.interactive === true;
  let kbd = 0, name = 0, focusVis = 0, focusObsc = 0, targetSize = 0, redundant = 0, altText = 0;
  for (const c of list) {
    const interactive = isInteractive(c);
    if (interactive && c.keyboardOperable === false) kbd++;                                                   // 2.1.1 Keyboard (A)
    if (interactive && !isStr(c.name)) name++;                                                                // 4.1.2 Name, Role, Value (A)
    if (interactive && c.focusVisible === false) focusVis++;                                                  // 2.4.7 Focus Visible (AA)
    if (interactive && c.focusObscured === true) focusObsc++;                                                 // 2.4.11 Focus Not Obscured (AA, NEW 2.2)
    if (interactive && isObj(c.target) && typeof c.target.w === "number" && typeof c.target.h === "number" && (c.target.w < WCAG22_TARGET_MIN || c.target.h < WCAG22_TARGET_MIN) && c.targetException !== true) targetSize++; // 2.5.8 Target Size (AA, NEW 2.2)
    if (isObj(c.redundantEntry) && c.redundantEntry.previouslyEntered === true && c.redundantEntry.prefilledOrSelectable !== true && c.redundantEntry.exception !== true) redundant++; // 3.3.7 Redundant Entry (A, NEW 2.2)
    if ((String(c.role || "").toLowerCase() === "img" || c.nonText === true) && !isStr(c.alt) && c.decorative !== true) altText++; // 1.1.1 Non-text Content (A)
  }
  const findings: any[] = [];
  const add = (criterion: string, level: string, detail: string, count: number) => { if (count > 0) findings.push(Object.freeze({ criterion, level, detail, count, kind: "AUTOMATABLE" })); };
  add("2.1.1", "A", "interactive control not keyboard-operable", kbd);
  add("4.1.2", "A", "interactive control without an accessible name", name);
  add("2.4.7", "AA", "interactive control without a visible focus indicator", focusVis);
  add("2.4.11", "AA", "focused control entirely obscured by author content (WCAG 2.2-new)", focusObsc);
  add("2.5.8", "AA", "pointer target smaller than 24×24 CSS px without exception (WCAG 2.2-new)", targetSize);
  add("3.3.7", "A", "previously-entered information required to be re-entered (WCAG 2.2-new)", redundant);
  add("1.1.1", "A", "non-text content without a text alternative", altText);
  const defects = findings.reduce((a: number, f: any) => a + f.count, 0);
  return Object.freeze({
    ok: defects === 0, conformantAutomated: defects === 0, automatedOnly: true, manualReviewRequired: true,
    componentsAudited: list.length, defects, findings: Object.freeze(findings),
    criteriaChecked: Object.freeze(["2.1.1", "4.1.2", "2.4.7", "2.4.11", "2.5.8", "3.3.7", "1.1.1"]),
    wcag22New: Object.freeze(["2.4.11", "2.5.8", "3.3.7"]),
    note: "AUTOMATED SUBSET of WCAG 2.2 (incl. 2.2-NEW 2.4.11/2.5.8/3.3.7) over a STRUCTURED component model — a clean automated pass is NOT a conformance declaration. Contrast, meaningful name quality, reading order, focus management and cognitive criteria (e.g. 3.3.8 Accessible Authentication) REQUIRE manual expert/browser review. Reference: W3C WCAG 2.2 (Recommendation 2023-10-05).",
  });
}

/** refactorPreservesBehaviour(samplesBefore, samplesAfter, target) -> { ok, verdict, preserved, changed, missing }. */
function refactorPreservesBehaviour(samplesBefore: any, samplesAfter: any, target: any): any {
  const cap = CB.captureBaseline({ target: typeof target === "string" && target ? target : "p1-module", samples: samplesBefore });
  if (!cap.ok) return Object.freeze({ ok: false, verdict: "NO_BASELINE", reason: cap.reason });
  const cmp = CB.compareToBaseline(cap.baseline, samplesAfter);
  return Object.freeze({ ok: cmp.verdict === "BEHAVIOR_PRESERVED", verdict: cmp.verdict, changed: Array.isArray(cmp.changed) ? cmp.changed.length : 0, missing: Array.isArray(cmp.missing) ? cmp.missing.length : 0 });
}

function runReferenceProject(opts: any): any {
  const o = isObj(opts) ? opts : {};
  // A tiny deterministic "function under refactor": fizz-ish mapping over inputs 1..5.
  const inputs = [1, 2, 3, 4, 5];
  const v1 = (n: number) => (n % 2 === 0 ? "even" : "odd");
  const before = inputs.map((n) => ({ input: n, observedOutput: v1(n) }));
  const impl = typeof o.after === "function" ? o.after : v1;         // a behaviour-preserving refactor by default
  const after = inputs.map((n) => ({ input: n, observedOutput: impl(n) }));
  const preserve = refactorPreservesBehaviour(before, after, "p1-fizz");
  // V252 §3 — full-stack accessibility dimension (opt-in; default behaviour unchanged). Structured components ⇒ WCAG 2.2
  // component audit; an HTML string ⇒ REUSE the M5 auditHtml (no second a11y engine). A real a11y defect ⇒ degraded.
  let accessibility: any = null, accessibilityClean = true;
  if (Array.isArray(o.components)) { accessibility = auditComponents(o.components, o); accessibilityClean = accessibility.ok === true; }
  else if (typeof o.html === "string") { accessibility = AC.auditHtml(o.html); accessibilityClean = accessibility.conformantAutomated === true; }
  const degraded = !preserve.ok || !accessibilityClean;
  return Object.freeze({
    synthetic: true, profession: "P1", refactor: preserve, accessibility,
    level: "E2", degraded, note: "SYNTHETIC code-under-refactor (not a real client codebase, not E5); behaviour-preservation is the P1 signal via characterization-baseline (sealed, fail-closed); accessibility = AUTOMATED WCAG 2.2 subset (never a conformance declaration); real external legacy case (E5) owner-gated NOT_RUN",
  });
}

const P1_FULLSTACK_REFERENCE_CONTRACT = Object.freeze({
  id: "V124-P1-FULLSTACK-REFERENCE",
  source: "V12.4 §43 P1 (Software/Full-Stack) — E2 reference + E3 (behaviour-changing refactor / coverage gap)",
  levels: Object.freeze(["E0", "E1", "E2", "E3", "E4(owner/independent)", "E5(owner-gated NOT_RUN)"]),
  reuses: Object.freeze(["characterization-baseline (captureBaseline + compareToBaseline, sealed, fail-closed)", "accessibility-check.auditHtml (M5 WCAG 2.1 HTML subset) for the HTML path — no second a11y engine"]),
  notAuthority: "a runnable refactor-safety + automated-WCAG-2.2 reference over SYNTHETIC code/components; no real client codebase, no conformance declaration, no E5 claim",
  invariants: Object.freeze([
    "behaviour-preservation is the P1 capability signal (not line count); verified against a SEALED characterization baseline",
    "a behaviour change is a regression (BEHAVIOR_CHANGED), a coverage gap is NOT a pass (INCOMPLETE) — fail-closed",
    "SYNTHETIC code only; real external legacy case (E5) owner-gated NOT_RUN (no inflated level)",
    "reuses characterization-baseline; no second baseline/diff engine",
    "V252 WCAG 2.2: auditComponents checks the 2.2-NEW machine-testable criteria (2.4.11/2.5.8/3.3.7) + 2.1.1/4.1.2/2.4.7/1.1.1 over a STRUCTURED component model; a clean automated pass is NEVER a conformance declaration (manualReviewRequired always true); empty input ⇒ fail-closed; reuses M5 auditHtml for HTML",
  ]),
});

module.exports = { refactorPreservesBehaviour, auditComponents, runReferenceProject, P1_FULLSTACK_REFERENCE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P1_FULLSTACK_REFERENCE_CONTRACT, demo: runReferenceProject({}) }, null, 2) + "\n"); }

export {};
