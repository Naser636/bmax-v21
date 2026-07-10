import { DataRecord } from "@/contracts/data-record";

export function computeDataScore(record: DataRecord): number {
  return record.source ? 100 : 0;
}
