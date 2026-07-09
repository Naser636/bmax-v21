import { Audit } from "@/contracts/audit";
import { Evidence } from "@/contracts/evidence";

const audits: Audit[] = [];
const evidences: Evidence[] = [];

export function addAudit(audit: Audit): void {
  audits.push(audit);
}

export function getAuditLog(): Audit[] {
  return [...audits];
}

export function addEvidence(evidence: Evidence): void {
  evidences.push(evidence);
}

export function getEvidenceStore(): Evidence[] {
  return [...evidences];
}
