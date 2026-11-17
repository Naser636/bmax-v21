#!/usr/bin/env node
"use strict";

/*
 * V258/V259 §5 — reconcile the V251 "230" scan against the CURRENT HEAD, and CLASSIFY honestly. READ-ONLY. It REUSES
 * odg-transform-catalog (scanSource/runTransform) — no second engine, no file written. The "230" is a SCAN-OCCURRENCE count
 * (how many files a deterministic transform WOULD change), NOT 230 independent defects.
 *
 * HONESTY (directive §1.1/§5): most occurrences are CONVENTION/STYLE conformance, not functional defects. Classifying a valid
 * existing pattern as a "defect" — or applying transforms repo-wide merely to reduce the count — is explicitly forbidden.
 * APPLICATION STAYS OWNER_GATED: this module proposes/classifies only; it writes nothing and this global mandate is NOT an
 * implicit authorization to apply (appliedCount is always 0). Pure/deterministic over injected scan counts.
 */

const OCCURRENCE_CLASS = Object.freeze(["CONFIRMED_DEFECT", "DUPLICATE", "FALSE_POSITIVE", "VALID_EXISTING_PATTERN", "STALE", "NEEDS_CONTEXT", "FIXED_AND_VERIFIED"]);

// The V251 baseline scan (dual-export 177 / use-strict 36 / strict-eq 10 / dedupe-require 4 / sort-destructure 3 = 230).
const V251_BASELINE = Object.freeze({ total: 230, perClass: Object.freeze({ "ensure-dual-export@1": 177, "ensure-use-strict@1": 36, "normalize-strict-equality@1": 10, "dedupe-require-lines@1": 4, "sort-named-destructure@1": 3 }) });

// Honest per-class disposition (domain judgment). isDefect=false ⇒ a valid pattern, NOT to be "repaired" to cut the count.
const CLASS_DISPOSITION = Object.freeze([
  Object.freeze({ classId: "ensure-dual-export@1", disposition: "VALID_EXISTING_PATTERN", isDefect: false, risk: "LOW",
    rationale: "appends a trailing `export {};` to CJS-style modules; the files already function via module.exports+require (and many are already ES modules via other export statements). A missing trailing `export {};` is a repo CONVENTION, not a functional defect — applying to 177 files is cosmetic churn forbidden by §5.",
    rollback: "git revert of the batch; each edit is append-only + structurally verified by the catalog" }),
  Object.freeze({ classId: "ensure-use-strict@1", disposition: "VALID_EXISTING_PATTERN", isDefect: false, risk: "LOW",
    rationale: "adds a \"use strict\" directive; ES modules are ALWAYS strict and the CJS path works without it — cosmetic, not a functional defect.",
    rollback: "git revert; prepend-only edit" }),
  Object.freeze({ classId: "normalize-strict-equality@1", disposition: "NEEDS_CONTEXT", isDefect: false, risk: "MEDIUM",
    rationale: "upgrades unambiguous loose ==/!= to ===/!== (the catalog REFUSES the ambiguous `== null` idiom). Potential minor quality improvement, but each site needs per-site review to confirm no intended coercion — not a confirmed functional bug without context.",
    rollback: "git revert; per-operator replacement, length-verified" }),
  Object.freeze({ classId: "dedupe-require-lines@1", disposition: "CONFIRMED_DEFECT", isDefect: true, risk: "LOW",
    rationale: "removes EXACT-duplicate `const X = require(...)` lines — a genuinely redundant (dead) duplicate. The smallest safe real cleanup; still OWNER_GATED to apply.",
    rollback: "git revert; removes only exact-duplicate contiguous lines, structurally verified" }),
  Object.freeze({ classId: "sort-named-destructure@1", disposition: "VALID_EXISTING_PATTERN", isDefect: false, risk: "LOW",
    rationale: "sorts named-destructure keys — pure ordering/style, no semantic change; not a defect.",
    rollback: "git revert; same key set, re-ordered" }),
]);

/** reconcile(liveCounts) -> compare the live scan to the V251 baseline + classify. liveCounts: { perClass:{id:n} } or {}. */
function reconcile(liveCounts: any): any {
  const live = (liveCounts && typeof liveCounts === "object" && liveCounts.perClass && typeof liveCounts.perClass === "object") ? liveCounts.perClass : null;
  const classes = CLASS_DISPOSITION.map((d: any) => {
    const baseN = (V251_BASELINE.perClass as any)[d.classId] || 0;
    const liveN = live ? (typeof live[d.classId] === "number" ? live[d.classId] : null) : null;
    const drift = liveN === null ? "NOT_RESCANNED" : (liveN === baseN ? "STABLE" : (liveN < baseN ? "REDUCED(" + (baseN - liveN) + ")" : "INCREASED(" + (liveN - baseN) + ")"));
    return Object.freeze({ classId: d.classId, baselineCount: baseN, liveCount: liveN, drift, disposition: d.disposition, isDefect: d.isDefect, risk: d.risk, rationale: d.rationale, rollback: d.rollback });
  });
  const liveTotal = live ? classes.reduce((a: number, c: any) => a + (typeof c.liveCount === "number" ? c.liveCount : 0), 0) : null;
  const confirmedDefectInstances = classes.filter((c: any) => c.isDefect).reduce((a: number, c: any) => a + (typeof c.liveCount === "number" ? c.liveCount : c.baselineCount), 0);
  const validPatternInstances = classes.filter((c: any) => c.disposition === "VALID_EXISTING_PATTERN").reduce((a: number, c: any) => a + c.baselineCount, 0);
  return Object.freeze({
    baselineTotal: V251_BASELINE.total, liveTotal, scanStable: liveTotal === V251_BASELINE.total,
    classes: Object.freeze(classes),
    confirmedDefectClasses: classes.filter((c: any) => c.isDefect).map((c: any) => c.classId),
    confirmedDefectInstances, needsContextInstances: classes.filter((c: any) => c.disposition === "NEEDS_CONTEXT").reduce((a: number, c: any) => a + c.baselineCount, 0), validPatternInstances,
    appliedCount: 0, ownerGated: true, writesDisk: false,
    note: "the '230' is a SCAN-OCCURRENCE count, NOT 230 defects. Only dedupe-require-lines@1 (" + confirmedDefectInstances + " exact-duplicate-require occurrences) is a CONFIRMED minor defect; the remaining " + validPatternInstances + " are VALID_EXISTING_PATTERN (convention/style — not to be 'repaired' to cut the count), with normalize-strict-equality NEEDS_CONTEXT. APPLICATION STAYS OWNER_GATED — appliedCount:0, nothing written. This global mandate is NOT an implicit authorization to apply.",
  });
}

const V251_REPAIR_RECONCILIATION_CONTRACT = Object.freeze({
  id: "V258-V251-REPAIR-RECONCILIATION",
  source: "V258/V259 §5 — reconcile + classify the V251 230-occurrence scan against current HEAD (read-only; OWNER_GATED application)",
  occurrenceClasses: OCCURRENCE_CLASS, baseline: V251_BASELINE,
  notAuthority: "a read-only reconciliation/classification; it writes no file, applies no repair, and this mandate does not unlock OWNER_GATED application",
  invariants: Object.freeze([
    "the '230' is a SCAN-OCCURRENCE count, NOT 230 defects; a VALID_EXISTING_PATTERN is NEVER classified as a defect, and code is never changed merely to reduce the count (§5)",
    "only dedupe-require-lines@1 (exact-duplicate requires) is a CONFIRMED minor defect; dual-export/use-strict/sort-destructure are convention/style (VALID_EXISTING_PATTERN); strict-equality is NEEDS_CONTEXT",
    "APPLICATION STAYS OWNER_GATED: appliedCount is always 0, writesDisk false; the global mandate is NOT an implicit authorization to apply",
    "REUSES odg-transform-catalog (the live scan is fed in) — no second engine; pure/deterministic; no new primitive",
  ]),
});

module.exports = { OCCURRENCE_CLASS, V251_BASELINE, CLASS_DISPOSITION, reconcile, V251_REPAIR_RECONCILIATION_CONTRACT };

export {};
