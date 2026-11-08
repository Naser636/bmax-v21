#!/usr/bin/env node
"use strict";

/*
 * WI-P10-19 — COMPLIANCE SCENARIO (P10 AI Governance & Regulatory — industrialisation). PURE, deterministic,
 * end-to-end SYNTHETIC regulatory path: IDENTIFY → CLASSIFY-RISK → OBLIGATIONS → EVIDENCE → GAPS → ANTI-OVERCLAIM
 * → TRACEABILITY → verifiable REPORT. REUSES regulatory-assurance.assertNotCertified (hardened anti-overclaim)
 * and meta-intelligence (verifier independence). It is software ASSISTANCE: the verdict is ALWAYS NOT_CERTIFIED —
 * an accredited body certifies, never ODG. No network/clock. Dual export.
 */

const RA = require("./regulatory-assurance");
const META = require("./meta-intelligence");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function hasEvidence(v: any): boolean { return arr(v).length > 0; }

// Synthetic, honest risk mapping (NOT legal advice) from a declared AI role.
function classifyRisk(system: any): any {
  const role = isObj(system) && isStr(system.aiRole) ? system.aiRole.toLowerCase() : "";
  if (/prohibit|social.?scor|manipulat/.test(role)) return { tier: "PROHIBITED", reason: "declared role maps to a prohibited practice" };
  if (/high.?risk|safety|biometric|critical/.test(role)) return { tier: "HIGH", reason: "declared role maps to a high-risk category" };
  if (/limited|chatbot|transparency/.test(role)) return { tier: "LIMITED", reason: "declared role maps to a limited-risk (transparency) category" };
  if (role) return { tier: "MINIMAL", reason: "declared role maps to minimal risk" };
  return { tier: "UNDETERMINED", reason: "no declared aiRole ⇒ cannot classify (deny-by-default)" };
}

/** runComplianceScenario(input) -> verifiable report. input: { system, obligations:[{id,required,evidenceRefs}], claims:[str], verifier? }. */
function runComplianceScenario(input: any): any {
  const i = isObj(input) ? input : {};
  const trace: any[] = [];

  // 1) IDENTIFY
  const system = isObj(i.system) ? i.system : null;
  trace.push({ stage: "identify", ok: !!(system && isStr(system.name)) });
  if (!system || !isStr(system.name)) return Object.freeze({ verdict: "NOT_CERTIFIED", status: "INSUFFICIENT", reason: "system identification required", trace: Object.freeze(trace) });

  // 2) CLASSIFY RISK
  const risk = classifyRisk(system);
  trace.push({ stage: "classify-risk", tier: risk.tier });

  // 3) OBLIGATIONS + 4) EVIDENCE + 5) GAPS
  const obligations = arr(i.obligations).filter(isObj);
  const assessed = obligations.map((o: any) => {
    const required = o.required === true;
    const evidenced = hasEvidence(o.evidenceRefs);
    const state = !required ? "NOT_APPLICABLE" : evidenced ? "MET" : "GAP";
    return Object.freeze({ id: isStr(o.id) ? o.id : null, required, state, evidenceRefs: Object.freeze(arr(o.evidenceRefs).slice()) });
  });
  const gaps = assessed.filter((a: any) => a.state === "GAP").map((a: any) => a.id).sort();
  trace.push({ stage: "obligations", total: assessed.length, gaps: gaps.length });

  // 6) ANTI-OVERCLAIM (reuse hardened regulatory-assurance.assertNotCertified)
  const claims = arr(i.claims).filter(isStr);
  const refusedClaims = claims.map((c: string) => ({ claim: c, ...RA.assertNotCertified(c) })).filter((r: any) => r.ok === false).map((r: any) => r.claim);
  trace.push({ stage: "anti-overclaim", refused: refusedClaims.length });

  // 7) TRACEABILITY — verifier independence (reuse meta-intelligence evaluator-capture)
  const capture = META.detectEvaluatorCapture({ evaluator: { id: isStr(i.verifier) ? i.verifier : "odg-regulatory-verifier" }, subject: { id: system.name } });
  trace.push({ stage: "traceability", verifierIndependent: capture.verdict !== "DETECTED" });

  // 8) REPORT — software assistance ⇒ NEVER certification
  const blocked = risk.tier === "PROHIBITED";
  const status = blocked ? "BLOCKED_PROHIBITED" : (gaps.length > 0 ? "GAPS" : (risk.tier === "UNDETERMINED" ? "UNDETERMINED" : "READY_FOR_REVIEW"));
  return Object.freeze({
    verdict: "NOT_CERTIFIED",
    note: "software assistance only — an accredited/independent body certifies, never ODG",
    status, risk: Object.freeze(risk),
    obligations: Object.freeze(assessed), gaps: Object.freeze(gaps),
    refusedClaims: Object.freeze(refusedClaims.sort()),
    verifierIndependent: capture.verdict !== "DETECTED",
    trace: Object.freeze(trace),
  });
}

const COMPLIANCE_SCENARIO_CONTRACT = Object.freeze({
  id: "WI-P10-19-COMPLIANCE-SCENARIO",
  source: "P10 AI Governance & Regulatory — end-to-end synthetic compliance path; reuses regulatory-assurance + meta-intelligence",
  notAuthority: "software assistance; verdict is ALWAYS NOT_CERTIFIED (an accredited body certifies, never ODG); classifies no legal reality",
  invariants: Object.freeze([
    "pure/deterministic: synthetic input in → verifiable report out; no clock/random",
    "deny-by-default: no system id ⇒ INSUFFICIENT; no aiRole ⇒ UNDETERMINED risk",
    "obligations fail-closed: required without evidence ⇒ GAP",
    "anti-overclaim reuses the hardened assertNotCertified; certification/accreditation claims are refused",
    "verdict is ALWAYS NOT_CERTIFIED — a software control is never an official certification",
  ]),
});

module.exports = { COMPLIANCE_SCENARIO_CONTRACT, classifyRisk, runComplianceScenario };

if (require.main === module) {
  process.stdout.write(JSON.stringify(COMPLIANCE_SCENARIO_CONTRACT, null, 2) + "\n");
}

export {};
