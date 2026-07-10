import { DataRecord } from "@/contracts/data-record";

export function exportDataQuality(records: DataRecord[]): string {
  return JSON.stringify(records);
}
