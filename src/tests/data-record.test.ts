import { DataRecord } from "@/contracts/data-record";

const record: DataRecord = {
  source: "boamp",
  payload: {},
};

console.assert(record.source === "boamp");

console.log("Data Record OK");
