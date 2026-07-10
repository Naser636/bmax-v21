import { DataRecord } from "@/contracts/data-record";

export function buildDataQualityReport(records: DataRecord[]) {
  return {
    total: records.length,
    valid: records.length,
  };
}
