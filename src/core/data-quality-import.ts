import { DataRecord } from "@/contracts/data-record";

export function importDataQuality(json: string): DataRecord[] {
  return JSON.parse(json) as DataRecord[];
}
