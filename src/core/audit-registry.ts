import { Evidence } from "@/contracts/evidence";

const auditLog: Evidence[] = [];

export function addEvidence(evidence: Evidence): void {
  auditLog.push(evidence);
}

export function getAuditLog(): Evidence[] {
  return [...auditLog];
}
