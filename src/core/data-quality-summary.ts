import { DataRecord } from "@/contracts/data-record";

export function summarizeDataQuality(records: DataRecord[]): string {
  return `${records.length} records`;
}
