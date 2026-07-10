import { DataRecord } from "@/contracts/data-record";

const registry: DataRecord[] = [];

export function registerRecord(record: DataRecord): void {
  registry.push(record);
}

export function getRegisteredRecords(): DataRecord[] {
  return registry;
}
