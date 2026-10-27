#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the demo renderer produces a REAL, honest dossier from the proven buildDossier
// on a SYNTHETIC profile (no fabricated client/data). Hermetic, no clock.
"use strict";
const assert = require("assert");
const D = require("./demo-dossier.js");
const prov = require("./evidence-provenance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const NOW = "2026-10-27";
const REG = [
  { id: "GDPR-2016-679", authority: "EU", domain: "data-protection", version: "2016/679", date: "2016-04-27", source: "Regulation (EU) 2016/679", normativeStatus: "legal-obligation", usageRights: "public-regulation", practicesAdopted: [], limits: [], nextReviewDate: "2027-01-01", verificationStatus: "verified", accessLevel: "open-document" },
  { id: "ISO27001-2022", authority: "ISO/IEC", domain: "information-security", version: "2022", date: "2022-10-25", source: "ISO/IEC 27001:2022", normativeStatus: "voluntary-standard", usageRights: "principles-only", practicesAdopted: [], limits: [], nextReviewDate: "2027-10-01", verificationStatus: "offline-pending-reverify", accessLevel: "metadata-only" },
  { id: "RA-METHOD", authority: "ODG", domain: "regulatory-assurance", version: "1.0", date: "2026-10-26", source: "ODG method", normativeStatus: "industry-practice", usageRights: "own", practicesAdopted: ["obligation-mapping", "applicability-justification", "gap-analysis", "traceability-requirement-to-evidence", "evidence-independent-verification", "no-certification-claim"], limits: [], nextReviewDate: "2027-06-01", verificationStatus: "offline-pending-reverify", accessLevel: "open-document" },
];
// SYNTHETIC demo prospect — clearly fictional, EU SME shipping an LLM agent (matches the chosen beachhead).
const DEMO = { tenantId: "DEMО-PROSPECT", sector: "saas", size: "sme", country: "FR", processesEUPersonalData: true, dataCategories: ["personal"], targetFrameworks: ["GDPR", "ISO27001"],
  declaredEvidence: [
    { id: "e1", obligationId: "GDPR-ROPA", tenantId: "DEMО-PROSPECT", artifact: "VERIFIED:ropa.xlsx", owner: "DPO" },
    { id: "e2", obligationId: "GDPR-LAWFUL", tenantId: "DEMО-PROSPECT", artifact: "lawful.md (unproven)", owner: "DPO" },
  ] };
const verifier = (id, ev) => ev && typeof ev.artifact === "string" && ev.artifact.startsWith("VERIFIED:") ? { verified: true, reason: "ok" } : { verified: false, reason: "not corroborated" };

const { dossier, markdown } = D.renderDemoDossier(DEMO, { registry: REG, now: NOW, verifier });

// (1) renders a real dossier (string, honesty header present)
ok("demo renders markdown with NOT_CERTIFIED honesty header", typeof markdown === "string" && /NOT_CERTIFIED|not a certification/.test(markdown) && markdown.includes("# Regulatory-readiness dossier"));
// (2) a VERIFIED evidence ⇒ SATISFIED_VERIFIED; a declared-only ⇒ DECLARED_UNVERIFIED (shown honestly)
ok("verified vs declared-unverified shown honestly", dossier.findings.find(f => f.obligationId === "GDPR-ROPA").status === "SATISFIED_VERIFIED" && dossier.findings.find(f => f.obligationId === "GDPR-LAWFUL").status === "DECLARED_UNVERIFIED" && /client-declared/.test(markdown));
// (3) ISO applicable obligations present + a gap surfaced (no evidence) ⇒ remediation listed
ok("gaps + remediation surfaced", dossier.summary.gaps >= 1 && /Prioritized remediation/.test(markdown));
// (4) excellence self-review auto-included
ok("excellence self-review rendered", /Excellence self-review/.test(markdown) && typeof dossier.excellenceReview.verdict === "string");
// (5) reproducible: same inputs ⇒ identical markdown
ok("reproducible render (identical inputs ⇒ identical output)", D.renderDemoDossier(DEMO, { registry: REG, now: NOW, verifier }).markdown === markdown);
// (6) honesty: no certification claim leaks; assertNotCertified refuses a 'certified' statement
ok("no certification claim; a 'certified' statement is refused", !/is certified|fully compliant/i.test(markdown) && require("./regulatory-assurance.js").assertNotCertified("DEMO is ISO 27001 certified").ok === false);
// (7) sealed dossier is tenant-attributable + tamper-evident (demo can prove provenance)
const sealed = require("./regulatory-assurance.js").sealDossier(dossier, { revision: { commit: "t", treeDirty: false, available: true } });
ok("demo dossier sealable + tamper-evident", prov.verifyProvenance(sealed).ok === true && (() => { const t = { ...sealed, tenantId: "OTHER" }; return prov.verifyProvenance(t).ok === false; })());

console.log(`\nDEMO-DOSSIER suite — ${pass} assertions passed. (synthetic profile; no real client/data)`);
