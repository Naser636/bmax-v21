#!/usr/bin/env node
/**
 * field-validation-readiness — the §4 artifact: for each of the five delivered business domains, the EXACT external
 * case required to move the domain from PARTIAL to a higher proof level (required data/environment, consent, success
 * criteria, expected results, risks, owner action). It is machine-checkable and FAIL-CLOSED: a domain is
 * NOT_FIELD_VALIDATED until REAL field evidence is supplied AND meets the pre-registered success criteria — the
 * module never declares a field result without evidence, and never contacts anyone or transmits data (pure/offline).
 *
 * This is a readiness CONTRACT, not a claim of validation. It composes nothing executable beyond the honesty
 * discipline already used across ODG; NO new primitive.
 */
"use strict";

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Per-domain field-validation contract. currentStatus is PARTIAL for all five (real-data/real-execution proven,
// but no real external-client engagement). Each states the EXACT external prerequisite to raise the proof level.
const DOMAINS = Object.freeze([
  {
    domain: "Enterprise Software Engineering", capabilityLot: "ese-code-review-service", currentStatus: "PARTIAL",
    requiredEvidence: {
      data: "a REAL third-party/client code repository (not ODG's own, not a synthetic fixture)",
      environment: "the client's language toolchains available locally or in an authorized CI runner",
      consent: "repository owner's authorization to review the code + handle its contents",
      successCriteria: "findings reproduced by the client's own toolchain; ≥1 real defect confirmed by the owner; 0 false PASS on a broken file",
      expectedResults: "a SARIF report the client loads into their CI; owner-confirmed true/false-positive rates",
      risks: "false positives on project-specific patterns; exposure of proprietary source — handle under NDA",
    },
    ownerAction: "authorize a real client/OSS repo review engagement (NDA + toolchain access)",
  },
  {
    domain: "Cyber & Supply Chain", capabilityLot: "sbom-audit-service", currentStatus: "PARTIAL",
    requiredEvidence: {
      data: "a REAL target project's lockfiles + an authorized offline CVE/advisory feed (e.g. OSV export)",
      environment: "the feed mounted read-only; no network egress",
      consent: "project owner's authorization to audit dependencies + disclose findings",
      successCriteria: "SBOM matches the project's actual dependency tree; license findings confirmed; ≥1 real advisory matched against a pinned version",
      expectedResults: "a CycloneDX SBOM + license/advisory report cross-checked by the owner or an independent scanner",
      risks: "advisory staleness; license mis-identification — flagged for manual review, never auto-cleared",
    },
    ownerAction: "authorize a real audit engagement + provision an authorized offline advisory feed",
  },
  {
    domain: "Documents & Data", capabilityLot: "data-quality-service", currentStatus: "PARTIAL",
    requiredEvidence: {
      data: "a REAL client dataset at representative scale + the client's declared schema",
      environment: "sufficient memory for the dataset; a benchmark harness for throughput/memory",
      consent: "data owner's authorization; PII handling agreement if personal data present",
      successCriteria: "computed completeness/validity/uniqueness confirmed against the client's known ground truth on a labelled sample; measured throughput/memory recorded",
      expectedResults: "a quality report + a reproducible throughput/memory benchmark the client accepts",
      risks: "schema drift; PII exposure — minimise/anonymise; synthetic≠anonymous (evaluate privacy separately)",
    },
    ownerAction: "authorize use of a real client dataset (with any PII agreement) + a benchmark environment",
  },
  {
    domain: "Financial Auditing", capabilityLot: "finance-reconciliation-service", currentStatus: "PARTIAL",
    requiredEvidence: {
      data: "a REAL client invoice ledger + payment records (test/sandboxed copy; exact integer minor units)",
      environment: "a secured, access-controlled environment; no production financial system access",
      consent: "finance owner's authorization; auditor sign-off on the reconciliation method",
      successCriteria: "reconciliation matches the client's books on a known period; discrepancies (unmatched/overpaid/duplicate) confirmed by the client; no false reconciliation",
      expectedResults: "a discrepancy audit report accepted by the client's finance/audit function",
      risks: "ambiguous references; multi-currency — never auto-FX; an anomaly is NOT proof of fraud; NO real financial action without authorization",
    },
    ownerAction: "authorize a reconciliation engagement on a sandboxed copy of real ledger data",
  },
  {
    domain: "Legal & Compliance", capabilityLot: "regulatory-dossier-service", currentStatus: "PARTIAL",
    requiredEvidence: {
      data: "a REAL system/company profile + the current official source texts (versioned, with effective dates)",
      environment: "access to the authoritative source registry (versioned); no unversioned/outdated citations",
      consent: "the entity's authorization; review by a QUALIFIED legal professional",
      successCriteria: "AI-Act role classification + obligation mapping reviewed and endorsed by a qualified professional; every obligation source-cited with an effective date",
      expectedResults: "a readiness dossier a qualified reviewer signs off (still NOT a certification)",
      risks: "readiness≠certification; principle-level≠legal opinion; NEVER auto-change customer policies without authorized human review",
    },
    ownerAction: "authorize a real engagement + a qualified legal professional to review the dossier",
  },
]);

/**
 * assessFieldValidation(domainName, evidence?): FAIL-CLOSED. Returns NOT_FIELD_VALIDATED unless `evidence` is a real
 * field result with { realCaseRef, ownerConfirmed:true, meetsSuccessCriteria:true } (all present). Never declares a
 * field result on its own; this module only grades supplied evidence, it does not produce it.
 */
function assessFieldValidation(domainName: string, evidence?: any): any {
  const d = DOMAINS.find((x) => x.domain === domainName);
  if (!d) return { ok: false, code: "UNKNOWN_DOMAIN", reason: `no field-validation contract for '${domainName}'` };
  const e = isObj(evidence) ? evidence : null;
  const validated = !!(e && typeof e.realCaseRef === "string" && e.realCaseRef && e.ownerConfirmed === true && e.meetsSuccessCriteria === true);
  return {
    ok: true, domain: d.domain, capabilityLot: d.capabilityLot,
    status: validated ? "FIELD_VALIDATED" : "NOT_FIELD_VALIDATED",
    reason: validated ? `field evidence supplied (${e.realCaseRef}), owner-confirmed, meets success criteria` : "no real field evidence meeting the pre-registered success criteria (fail-closed; PARTIAL until an authorized external case)",
    requiredEvidence: d.requiredEvidence, ownerAction: d.ownerAction,
  };
}

/** readiness(): all five domains with their current status + field-validation contract (none are field-validated yet). */
function readiness(): any {
  return {
    model: "field-validation-readiness/1",
    note: "Each domain is PARTIAL (real-data/real-execution proven; NO real external-client engagement, €0). This lists the EXACT external case to raise each to a higher proof level. No contact/data-transfer/field claim is made without authorization + real evidence.",
    domains: DOMAINS.map((d) => ({ domain: d.domain, capabilityLot: d.capabilityLot, currentStatus: d.currentStatus, status: "NOT_FIELD_VALIDATED", ownerAction: d.ownerAction, requiredEvidence: d.requiredEvidence })),
  };
}

export { DOMAINS, assessFieldValidation, readiness };
module.exports = { DOMAINS, assessFieldValidation, readiness };

if (require.main === module) {
  process.stdout.write(JSON.stringify(readiness(), null, 2) + "\n");
}
