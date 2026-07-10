import { DataRecord } from "@/contracts/data-record";

export function normalizeRecord(record: DataRecord): DataRecord {
  return {
    ...record,
    source: record.source.trim().toLowerCase(),
  };
}
