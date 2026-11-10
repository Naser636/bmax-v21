#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V88 §14 + V88-A §7 — META-VALIDATION OF THE INCREMENTAL-ASSURANCE ENGINE (Chain B: assurance of the
 * assurance). The test-selector + evidence-invalidation engine is ITSELF a validation mechanism, so it must pass an
 * independent meta-validation (V85): seeded DEFECT scenarios where a CORRECT engine MUST re-run/invalidate/widen (a buggy
 * engine would wrongly reuse/skip) + CLEAN scenarios where reuse is genuinely correct (flagging would be a false alarm).
 * The engine is EFFECTIVE only if it catches 100% of seeded defects with 0 false alarms. Reuses inspector-meta-validation
 * (V85) + incremental-assurance (V88). Writes docs/odg/V88_INCREMENTAL_META_VALIDATION.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
const META = require("../core/inspector-meta-validation.js");
const ENG = require("../core/incremental-assurance.js");
const CACHE = require("../core/verified-result-cache.js");

const idOf = (fields: any) => CACHE.identityDigest(fields);
const base = { inputs: 1, code: "c", deps: 1, config: 1, env: 1 };
// an evidence that is genuinely independent + intact (reuse SHOULD be allowed).
const intactEvidence = (id: string, mod: string) => ({ id, forModule: mod, identity: base, provenance: "p", identityDigest: idOf(base) });

// the engine as an inspector: given a scenario, does it correctly FLAG (not wrongly reuse) when it must?
// "flagged" = the engine did NOT wrongly reuse — i.e. it invalidated the affected evidence OR selected tests/fullSuite.
function engineFlags(scenario: any): any { return ENG.assess(scenario.change, scenario.evidence, scenario.opts || {}); }
const correctlyActed = (a: any, targetId: string) => {
  const ev = a.evidence.find((e: any) => e.id === targetId);
  const invalidatedOrMeasured = ev && (ev.verdict === "INVALIDATED" || ev.verdict === "NOT_MEASURED" || ev.verdict === "BLOCKED");
  return invalidatedOrMeasured === true || a.fullSuite === true;
};
const reusedTarget = (a: any, targetId: string) => { const ev = a.evidence.find((e: any) => e.id === targetId); return ev && ev.verdict === "REUSED_VALID_EVIDENCE"; };

// SEEDED DEFECT scenarios: a CORRECT engine MUST act (not reuse). Each targets the evidence that must NOT be reused.
const cases = [
  // §14 — forgets a dependency: changed module with a consumer in the impact closure ⇒ consumer evidence must invalidate.
  { id: "forgets-dependency", label: "DEFECTIVE", target: "consumer-ev",
    input: { change: { changedModule: "lib", kind: "function", impactedModules: ["lib", "consumer"], impactedTests: ["consumer.test.ts"] }, evidence: [intactEvidence("consumer-ev", "consumer")] },
    detects: (a: any) => correctlyActed(a, "consumer-ev") },
  // §14 — reuses stale evidence: identity digest changed ⇒ must invalidate.
  { id: "reuses-stale", label: "DEFECTIVE", target: "stale-ev",
    input: { change: { changedModule: "x", kind: "function" }, evidence: [{ id: "stale-ev", forModule: "y", identity: base, provenance: "p", identityDigest: "DIFFERENT_OLD_DIGEST" }] },
    detects: (a: any) => correctlyActed(a, "stale-ev") },
  // §12 — contract change ⇒ transitive invalidation of producers/consumers (L3 ⇒ fullSuite).
  { id: "contract-transitive", label: "DEFECTIVE", target: "prod-ev",
    input: { change: { changedModule: "api", kind: "contract", impactedModules: ["api", "prod", "cons"] }, evidence: [intactEvidence("prod-ev", "prod")] },
    detects: (a: any) => a.fullSuite === true && a.depthLevel === 3 },
  // §9 — inspector change ⇒ dependent certification invalidated + re-meta-validate (L4 fullSuite).
  { id: "inspector-change", label: "DEFECTIVE", target: "cert-ev",
    input: { change: { changedModule: "insp", kind: "inspector" }, evidence: [{ id: "cert-ev", forModule: "cap", identity: base, provenance: "p", identityDigest: idOf(base), inspectorDependent: true }] },
    detects: (a: any) => correctlyActed(a, "cert-ev") && a.depthLevel === 4 },
  // §14 — masks a semantic change behind an identical format: raw content differs ⇒ FUNCTIONAL, must act.
  { id: "masked-semantic", label: "DEFECTIVE", target: null,
    input: { change: { changedModule: "m", kind: "function", prior: { content: "return 1" }, next: { content: "return 2" } }, evidence: [] },
    detects: (a: any) => a.change.semantic === "FUNCTIONAL" && a.fullSuite === true },
  // §14/§3 — unknown dependency ⇒ widen (never a clean reuse/skip).
  { id: "unknown-dependency-widen", label: "DEFECTIVE", target: null,
    input: { change: { changedModule: "u", kind: "function", unknownDependency: true }, evidence: [] },
    detects: (a: any) => a.widened === true && a.fullSuite === true },
  // §6/§11 — contradictory evidence ⇒ BLOCKED (never reused).
  { id: "contradictory-blocked", label: "DEFECTIVE", target: "contra-ev",
    input: { change: { changedModule: "z", kind: "function" }, evidence: [{ id: "contra-ev", forModule: "w", identity: base, provenance: "p", contradiction: true }] },
    detects: (a: any) => { const ev = a.evidence.find((e: any) => e.id === "contra-ev"); return ev && ev.verdict === "BLOCKED"; } },
  // §14 — drops a mandatory control: a permission change (L4) must run full control (never narrow).
  { id: "drops-mandatory-permission", label: "DEFECTIVE", target: null,
    input: { change: { changedModule: "perm", kind: "permission", impactedTests: ["one.test.ts"] }, evidence: [] },
    detects: (a: any) => a.fullSuite === true && a.depthLevel === 4 },

  // CLEAN scenarios: reuse is genuinely correct ⇒ the engine must NOT flag (flagging = false alarm).
  { id: "clean-independent-reuse", label: "CLEAN", target: "indep-ev",
    input: { change: { changedModule: "a", kind: "function", impactedModules: ["a", "b"], impactedTests: ["b.test.ts"] }, evidence: [intactEvidence("indep-ev", "unrelated")] },
    detects: (a: any) => !reusedTarget(a, "indep-ev") },   // flagged ⟺ did NOT reuse (a false alarm here)
  { id: "clean-doc-only", label: "CLEAN", target: "fn-ev",
    input: { change: { changedModule: "readme", kind: "doc", prior: { content: "# a\n" }, next: { content: "# a\n\n" } }, evidence: [{ ...intactEvidence("fn-ev", "readme"), evidenceKind: "functional" }] },
    detects: (a: any) => !reusedTarget(a, "fn-ev") },     // doc-only ⇒ functional evidence should be reused; flagging = false alarm
];

const result = META.metaValidate({ inspector: engineFlags, cases, minDetection: 1.0 });

const out = {
  "//": "CTO V88 §14 + V88-A §7 — Chain B: the incremental-assurance ENGINE meta-validated as an inspector. Seeded DEFECTS (must re-run/invalidate/widen) + CLEAN (reuse correct). EFFECTIVE ⟺ 100% seeded-defect detection + 0 false alarms. Reuses V85 inspector-meta-validation; the engine does NOT self-certify (an independent mechanism scores it).",
  effective: result.effective, valid: result.valid,
  confusion: result.confusion, detectionRate: result.detectionRate, falseNegativeRate: result.falseNegativeRate, falsePositiveRate: result.falsePositiveRate,
  seededDefects: result.seededDefects, cleanCases: result.cleanCases,
  missed: result.missed, falseAlarms: result.falseAlarms,
  perCase: result.perCase,
  honestConclusion: result.effective
    ? `The incremental-assurance engine is EFFECTIVE: it caught ${result.confusion.TP}/${result.seededDefects} seeded defects (forgotten dependency, stale reuse, contract-transitive, inspector-change, masked-semantic, unknown-dependency-widen, contradiction, dropped-mandatory) with ${result.confusion.FP} false alarms on ${result.cleanCases} clean reuse cases. The selector/invalidator does not wrongly reuse stale evidence nor drop mandatory controls, and correctly reuses genuinely-independent intact evidence.`
    : `INEFFECTIVE: missed ${result.missed.join(", ") || "-"} / false alarms ${result.falseAlarms.join(", ") || "-"} — the engine must be corrected before it may select controls (Chain B fail-closed).`,
  invariant: "the mechanism that selects controls + invalidates evidence is itself independently meta-validated (V85); EFFECTIVE ⟺ catches all seeded defects + 0 false alarms; it cannot self-certify.",
};
fs.writeFileSync(path.join(D, "V88_INCREMENTAL_META_VALIDATION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ effective: out.effective, detectionRate: out.detectionRate, falsePositiveRate: out.falsePositiveRate, missed: out.missed, falseAlarms: out.falseAlarms }, null, 2) + "\n");
export {};
