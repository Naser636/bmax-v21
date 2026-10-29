#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves PRODUCT D7: an integrated, EXECUTABLE AI-assurance assessment composing
// ai-act-role-classifier + regulatory-dossier + sbom-audit. Fail-closed: no evidence ⇒ NOT_ASSURED; a control is PASS
// only when a real check ran AND evidence was independently verified; AI-Act obligations listed-but-not-tested ⇒
// INSUFFICIENT_EVIDENCE (never PASS); a real SBOM check runs on a real projectDir; always NOT_CERTIFIED (technical ≠ legal).
"use strict";
const assert = require("assert");
const A = require("./ai-assurance-assessment.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const baseProfile = { tenantId: "t1", country: "FR", processesEUPersonalData: true, targetFrameworks: ["GDPR"] };

// (1) no evidence ⇒ NOT_ASSURED, framework FAIL>0, AI-Act obligations INSUFFICIENT, 0 PASS; real checks executed.
{
  const r = A.assessAISystem({ system: { id: "s1", activities: { usesAiSystemUnderOwnAuthority: true, systemInteractsWithHumans: true }, profile: baseProfile }, now: "2026-10-29" });
  const a = r.assessment;
  ok("no evidence ⇒ NOT_ASSURED, FAIL>0, INSUFFICIENT>0, PASS 0; ai-act+framework checks executed",
     r.ok && a.overall === "NOT_ASSURED" && a.tally.FAIL > 0 && a.tally.INSUFFICIENT_EVIDENCE > 0 && a.tally.PASS === 0 && a.executedChecks.includes("ai-act-role-classification") && a.executedChecks.includes("framework-evidence-assessment"));
}
// (2) listed-but-not-run honesty: AI-Act role present ⇒ its obligations are INSUFFICIENT_EVIDENCE, NEVER PASS by listing.
{
  const r = A.assessAISystem({ system: { id: "s1", activities: { usesAiSystemUnderOwnAuthority: true }, profile: baseProfile } });
  const aiActControls = r.assessment.controls.filter((c) => c.group === "ai-act");
  ok("AI-Act obligation controls are INSUFFICIENT_EVIDENCE (listed, no automated test) — never PASS",
     aiActControls.length > 0 && aiActControls.every((c) => c.status === "INSUFFICIENT_EVIDENCE"));
}
// (3) ASSURED path: no AI-Act activity (undetermined) + all GDPR obligations independently verified ⇒ ASSURED_TECHNICAL.
{
  const profile = { ...baseProfile, declaredEvidence: [
    { id: "E1", obligationId: "GDPR-ROPA", tenantId: "t1", artifact: "ropa.xlsx" },
    { id: "E2", obligationId: "GDPR-LAWFUL", tenantId: "t1", artifact: "basis.pdf" },
    { id: "E3", obligationId: "GDPR-BREACH", tenantId: "t1", artifact: "breach.md" },
  ] };
  const verifier = () => ({ verified: true, reason: "artifact inspected" });
  const r = A.assessAISystem({ system: { id: "s1", activities: {}, profile }, now: "2026-10-29", verifier });
  const a = r.assessment;
  ok("verified evidence + no AI-Act activity + no projectDir ⇒ ASSURED_TECHNICAL (PASS>0, 0 FAIL, 0 INSUFFICIENT)",
     a.overall === "ASSURED_TECHNICAL" && a.tally.PASS > 0 && a.tally.FAIL === 0 && a.tally.INSUFFICIENT_EVIDENCE === 0 && a.aiAct.undetermined === true);
}
// (4) a WRONG verifier (rejects) ⇒ NOT_ASSURED (declared-but-unverified ⇒ INSUFFICIENT_EVIDENCE, not PASS).
{
  const profile = { ...baseProfile, declaredEvidence: [{ id: "E1", obligationId: "GDPR-ROPA", tenantId: "t1" }] };
  const r = A.assessAISystem({ system: { id: "s1", activities: {}, profile }, verifier: () => ({ verified: false, reason: "not confirmed" }) });
  ok("verifier rejects ⇒ NOT_ASSURED (no false PASS on unverified evidence)", r.assessment.overall === "NOT_ASSURED" && r.assessment.tally.PASS === 0);
}
// (5) REAL supply-chain check runs on a real projectDir (this repo).
{
  const r = A.assessAISystem({ system: { id: "s1", activities: {}, profile: baseProfile, projectDir: process.cwd() }, verifier: () => ({ verified: true }) });
  const a = r.assessment;
  ok("projectDir ⇒ real sbom-license-audit executed + a supply-chain control present", a.executedChecks.includes("sbom-license-audit") && a.controls.some((c) => c.group === "supply-chain") && typeof a.supplyChain.componentCount === "number" && a.supplyChain.componentCount > 0);
}
// (6) always NOT_CERTIFIED (technical ≠ legal) + limitations enumerated.
{
  const r = A.assessAISystem({ system: { id: "s1", activities: {}, profile: baseProfile } });
  ok("certificationStatus NOT_CERTIFIED + limitations disclose technical≠legal and listed≠PASS",
     /NOT_CERTIFIED/.test(r.assessment.certificationStatus) && r.assessment.limitations.some((l) => /NOT legal certification/i.test(l)) && r.assessment.limitations.some((l) => /listed-but-untested|never PASS/i.test(l)));
}
// (7) fail-closed input.
{
  ok("missing system/tenantId ⇒ INVALID_INPUT", A.assessAISystem({}).code === "INVALID_INPUT" && A.assessAISystem({ system: { id: "s1", profile: {} } }).ok === false);
}

console.log(`\nAI-ASSURANCE-ASSESSMENT suite — ${pass} assertions passed. (fail-closed NOT_ASSURED default; PASS only on verified evidence; AI-Act listed⇒INSUFFICIENT never PASS; real sbom check; always NOT_CERTIFIED; fail-closed input)`);
