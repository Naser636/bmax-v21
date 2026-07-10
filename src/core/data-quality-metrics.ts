import { DataRecord } from "@/contracts/data-record";

export function computeDataQualityMetrics(records: DataRecord[]) {
  return {
    total: records.length,
    valid: records.length,
    score: records.length === 0 ? 100 : 100,
  };
}
