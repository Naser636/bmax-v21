import { DataRecord } from "@/contracts/data-record";

export function validateRecord(record: DataRecord): boolean {
  return record.source.trim().length > 0;
}
