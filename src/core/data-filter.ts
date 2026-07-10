import { DataRecord } from "@/contracts/data-record";

export function filterValidRecords(
  records: DataRecord[]
): DataRecord[] {
  return records.filter(r => r.source.length > 0);
}
