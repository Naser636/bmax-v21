import { DataRecord } from "@/contracts/data-record";

const history: DataRecord[][] = [];

export function addQualitySnapshot(records: DataRecord[]): void {
  history.push(records);
}

export function getQualityHistory(): DataRecord[][] {
  return history;
}
