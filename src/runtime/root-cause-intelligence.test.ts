#!/usr/bin/env node
/*
 * ROOT-CAUSE INTELLIGENCE (V63 Capability A) — hermetic unit tests. Injected authority seams (no real
 * root-cause-engine / self-diagnostic execution). Proves routing by failure class, the fact/inference/
 * hypothesis separation, INCONCLUSIVE-never-fabricate discipline, calibrated-only confidence, and traceability.
 *
 * Run:  node_modules/.bin/tsx src/runtime/root-cause-intelligence.test.ts
 */
import { assess } from "./root-cause-intelligence";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("ROOT-CAUSE INTELLIGENCE — tests");

// release-gate DIAGNOSED
{
  const seams = { releaseGateDiagnose: () => ({ status: "DIAGNOSED", rootCause: { gate: "gitClean", responsibleComponent: { evidenceProducer: "odg-verify.js", decisionAuthority: "release-manager", evidenceFile: "runtime/generated/x.json" } } }) };
  const a = assess({ incidentId: "INC-1", failureClass: "release-gate", evidenceRefs: ["r1"] }, seams);
  check(a.verdict === "DIAGNOSED" && a.authority === "root-cause-engine", "release-gate DIAGNOSED ⇒ verdict DIAGNOSED via root-cause-engine");
  check(a.observedFacts.some((f) => /gitClean/.test(f)) && a.inferences.some((i) => /decision authority/.test(i)), "facts vs inferences kept separate");
  check(a.actions.length >= 2 && a.actions.every((x) => typeof x.verificationCriterion === "string" && x.verificationCriterion.length > 0), "actions carry measurable verification criteria (corrective + preventive)");
  check(a.evidenceRefs.includes("r1") && a.incidentId === "INC-1", "assessment is traceable (incidentId + evidenceRefs)");
}

// release-gate EVIDENCE_MISSING / NO_BLOCKER ⇒ INCONCLUSIVE (never fabricate)
{
  const em = assess({ incidentId: "INC-2", failureClass: "release-gate", evidenceRefs: ["r"] }, { releaseGateDiagnose: () => ({ status: "EVIDENCE_MISSING" }) });
  check(em.verdict === "INCONCLUSIVE" && em.contributingCauses.length === 0, "EVIDENCE_MISSING ⇒ INCONCLUSIVE, no cause invented");
  const nb = assess({ incidentId: "INC-3", failureClass: "release-gate", evidenceRefs: ["r"] }, { releaseGateDiagnose: () => ({ status: "NO_BLOCKER" }) });
  check(nb.verdict === "INCONCLUSIVE", "NO_BLOCKER ⇒ INCONCLUSIVE (nothing to diagnose)");
}

// runtime-divergence DIAGNOSED ⇒ hypotheses populated, uncertainties noted
{
  const seams = { runtimeDiagnose: () => ({ divergences: [{ check: "state-count", candidateCauses: ["c1", "c2"], smallestDiscriminatingCheck: "probe X" }] }) };
  const a = assess({ incidentId: "INC-4", failureClass: "runtime-divergence", evidenceRefs: ["r"] }, seams);
  check(a.verdict === "DIAGNOSED" && a.authority === "self-diagnostic", "runtime-divergence with divergence ⇒ DIAGNOSED via self-diagnostic");
  check(a.hypotheses.includes("c1") && a.hypotheses.includes("c2") && a.uncertainties.length > 0, "candidate causes are HYPOTHESES + uncertainty recorded (not asserted as the cause)");
}

// runtime-divergence with no divergence ⇒ INCONCLUSIVE
{
  const a = assess({ incidentId: "INC-5", failureClass: "runtime-divergence", evidenceRefs: ["r"] }, { runtimeDiagnose: () => ({ divergences: [] }) });
  check(a.verdict === "INCONCLUSIVE", "no divergence ⇒ INCONCLUSIVE");
}

// unknown class: release-gate concludes first
{
  const a = assess({ incidentId: "INC-6", evidenceRefs: ["r"] }, { releaseGateDiagnose: () => ({ status: "DIAGNOSED", rootCause: { gate: "build", responsibleComponent: {} } }), runtimeDiagnose: () => ({ divergences: [] }) });
  check(a.verdict === "DIAGNOSED" && a.failureClass === "release-gate", "unknown class ⇒ tries release-gate first, concludes");
}

// unknown class: neither concludes ⇒ INCONCLUSIVE
{
  const a = assess({ incidentId: "INC-7", evidenceRefs: ["r"] }, { releaseGateDiagnose: () => ({ status: "EVIDENCE_MISSING" }), runtimeDiagnose: () => ({ divergences: [] }) });
  check(a.verdict === "INCONCLUSIVE", "unknown class + neither concludes ⇒ INCONCLUSIVE");
}

// confidence is null unless a VALIDATED calibration is supplied
{
  const a = assess({ incidentId: "INC-8", failureClass: "release-gate", evidenceRefs: ["r"] }, { releaseGateDiagnose: () => ({ status: "DIAGNOSED", rootCause: { gate: "g", responsibleComponent: {} } }) });
  check(a.confidence === null, "confidence null when no validated calibration");
  const b = assess({ incidentId: "INC-9", failureClass: "release-gate", evidenceRefs: ["r"], validatedConfidence: 0.8 }, { releaseGateDiagnose: () => ({ status: "DIAGNOSED", rootCause: { gate: "g", responsibleComponent: {} } }) });
  check(b.confidence === 0.8, "confidence set only from a validated calibration");
}

// missing incidentId ⇒ throws
{
  let threw = false;
  try { assess({ incidentId: "" } as any, {}); } catch { threw = true; }
  check(threw, "missing stable incidentId ⇒ throws (no untraceable assessment)");
}

// ── RACCORDEMENT RÉEL: the seam contract matches the REAL authorities (read-only, no fabrication) ──
{
  const sd: any = require("../../runtime/core/self-diagnostic.js");
  const rce: any = require("./root-cause-engine");
  // real self-diagnostic.diagnose plugs into the runtimeDiagnose seam ⇒ a well-formed Assessment.
  const aRuntime = assess({ incidentId: "INC-REAL-RT", failureClass: "runtime-divergence", evidenceRefs: ["live"] }, { runtimeDiagnose: () => sd.diagnose({}) });
  check((aRuntime.verdict === "DIAGNOSED" || aRuntime.verdict === "INCONCLUSIVE") && aRuntime.authority === "self-diagnostic", "RÉEL: real self-diagnostic.diagnose composes via the seam ⇒ valid Assessment (no fabrication)");
  // real RootCauseEngine.report plugs into the releaseGateDiagnose seam ⇒ a well-formed Assessment.
  const aGate = assess({ incidentId: "INC-REAL-RG", failureClass: "release-gate", evidenceRefs: ["live"] }, { releaseGateDiagnose: () => new rce.RootCauseEngine({}).report(null) });
  check((aGate.verdict === "DIAGNOSED" || aGate.verdict === "INCONCLUSIVE") && aGate.authority === "root-cause-engine", "RÉEL: real RootCauseEngine.report composes via the seam ⇒ valid Assessment");
}

console.log(failures === 0 ? "ALL PASS — ROOT-CAUSE INTELLIGENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
