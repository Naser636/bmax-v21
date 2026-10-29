#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the Legal/Compliance capability composes the AI-Act role classifier + the
// framework readiness dossier into one source-cited, fail-closed deliverable: deny-by-default AI-Act (UNDETERMINED
// without a declared activity), GDPR obligations become GAP findings when unevidenced, an obligation whose source is
// absent is REFUSED (never asserted), an injected independent verifier flips declared evidence to SATISFIED_VERIFIED,
// certification is ALWAYS NOT_CERTIFIED (and a "certified" claim is refused), and findings emit valid SARIF.
"use strict";
const assert = require("assert");
const R = require("./regulatory-dossier-service.js");
const SARIF = require("./sarif-report.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const baseProfile = { tenantId: "t1", country: "FR", processesEUPersonalData: true, targetFrameworks: ["GDPR"] };

// (1) deny-by-default: no declared activity ⇒ AI-Act UNDETERMINED, no roles, no obligation asserted.
{
  const r = R.buildRegulatoryDossier({ profile: baseProfile, activities: {}, now: "2026-10-29" });
  ok("no activity ⇒ AI-Act UNDETERMINED, roles empty, deny-by-default note present",
     r.ok && r.dossier.aiAct.undetermined === true && r.dossier.aiAct.roles.length === 0 && r.dossier.aiAct.notes.some((n) => /UNDETERMINED/.test(n)));
}
// (2) declared activities ⇒ DEPLOYER role + an Art.50 transparency obligation.
{
  const r = R.buildRegulatoryDossier({ profile: baseProfile, activities: { usesAiSystemUnderOwnAuthority: true, systemInteractsWithHumans: true }, now: "2026-10-29" });
  ok("declared activities ⇒ DEPLOYER role + Art.50 finding (MEDIUM)",
     r.dossier.aiAct.roles.includes("DEPLOYER") && r.dossier.aiAct.art50.length === 1 && r.dossier.findings.some((f) => f.area === "ai-act" && f.severity === "MEDIUM"));
}
// (3) GDPR applies but unevidenced ⇒ compliance GAP findings with a cited (valid) source; always NOT_CERTIFIED.
{
  const r = R.buildRegulatoryDossier({ profile: baseProfile, now: "2026-10-29" });
  const gap = r.dossier.findings.find((f) => f.area === "compliance" && /GDPR-/.test(f.id));
  ok("GDPR unevidenced ⇒ compliance GAP finding citing GDPR-2016-679; certification NOT_CERTIFIED",
     !!gap && /GDPR-2016-679/.test(gap.evidence) && r.dossier.frameworks.summary.gaps > 0 && /NOT_CERTIFIED/.test(r.dossier.certificationStatus));
}
// (4) source refusal: an empty reference registry ⇒ every targeted obligation is REFUSED (HIGH), none asserted applicable.
{
  const r = R.buildRegulatoryDossier({ profile: baseProfile, registry: [], now: "2026-10-29" });
  ok("empty registry ⇒ obligations refused (source-integrity HIGH), 0 applicable (nothing asserted without a source)",
     r.dossier.frameworks.refusedObligations.length > 0 && r.dossier.findings.some((f) => f.area === "source-integrity" && f.severity === "HIGH") && r.dossier.frameworks.summary.applicable === 0);
}
// (5) injected INDEPENDENT verifier confirms declared evidence ⇒ SATISFIED_VERIFIED (no GAP for that obligation).
{
  const profile = { ...baseProfile, declaredEvidence: [{ id: "E1", obligationId: "GDPR-ROPA", tenantId: "t1", artifact: "ropa.xlsx", owner: "DPO" }] };
  const verifier = (obId, ev) => ({ verified: obId === "GDPR-ROPA", reason: "artifact inspected" });
  const r = R.buildRegulatoryDossier({ profile, now: "2026-10-29" }, { verifier });
  ok("independent verifier ⇒ GDPR-ROPA SATISFIED_VERIFIED; no GAP finding for it",
     r.dossier.frameworks.summary.satisfiedVerified >= 1 && !r.dossier.findings.some((f) => f.id === "compliance:GDPR-ROPA"));
}
// (6) certification claim is refused; a neutral readiness statement is accepted.
{
  ok("assertNotCertified refuses 'ISO 27001 certified', accepts a neutral readiness statement",
     R.assertNotCertified("We are ISO 27001 certified").ok === false && R.assertNotCertified("We prepared a GDPR readiness dossier").ok === true);
}
// (7) fail-closed on bad input (no profile / no tenantId).
{
  ok("missing profile/tenantId ⇒ INVALID_INPUT", R.buildRegulatoryDossier({}).code === "INVALID_INPUT" && R.buildRegulatoryDossier({ profile: {} }).code === "INVALID_INPUT");
}
// (8) findings emit valid SARIF 2.1.0 (refused-source HIGH→error).
{
  const r = R.buildRegulatoryDossier({ profile: baseProfile, registry: [], now: "2026-10-29" });
  const s = SARIF.toSarif({ ok: true, project: "regulatory", findings: r.dossier.findings }, { toolName: "ODG-Regulatory-Dossier", version: "1" });
  ok("dossier findings ⇒ valid SARIF 2.1.0 (HIGH→error)", s.ok && SARIF.isValidSarif(s.sarif) && s.sarif.runs[0].results.some((x) => x.level === "error"));
}

console.log(`\nREGULATORY-DOSSIER-SERVICE suite — ${pass} assertions passed. (AI-Act deny-by-default; GDPR GAP source-cited; empty-registry⇒refused; independent verifier⇒SATISFIED_VERIFIED; always NOT_CERTIFIED; cert-claim refused; fail-closed; valid SARIF)`);
