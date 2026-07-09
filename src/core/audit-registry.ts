import { Audit } from "@/contracts/audit";

const audits: Audit[] = [];

export function addAudit(audit: Audit): void {
  audits.push(audit);
}

export function getAudits(): Audit[] {
  return [...audits];
}
