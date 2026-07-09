import { Audit } from "@/contracts/audit";
import { getAuditLog } from "@/core/audit-registry";

export function getAuditEntries(): Audit[] {
  return getAuditLog();
}
