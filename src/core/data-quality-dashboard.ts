import { DataRecord } from "@/contracts/data-record";

export function buildDataQualityDashboard(records: DataRecord[]) {
  return {
    total: records.length,
  };
}
