import { DataRecord } from "@/contracts/data-record";

export class DataQualityService {
  constructor(private readonly records: DataRecord[]) {}

  getAll(): DataRecord[] {
    return this.records;
  }
}
