import { DataQualificationEngine } from "@/core/data-qualification-engine";
import { DataRecord } from "@/contracts/data-record";

export function runDataQualification(records: DataRecord[]) {
  return new DataQualificationEngine().execute(records);
}
