import { DataRecord } from "@/contracts/data-record";

export function deduplicateRecords(
  records: DataRecord[]
): DataRecord[] {
  return [...new Map(records.map(r => [r.source, r])).values()];
}
