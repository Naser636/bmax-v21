import { getAuditLog } from "@/core/audit-registry";

export function getAuditEntries() {
  return getAuditLog();
}
