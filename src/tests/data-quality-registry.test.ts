import {
  registerRecord,
  getRegisteredRecords,
} from "@/core/data-quality-registry";

registerRecord({
  source: "boamp",
  payload: {},
});

console.assert(getRegisteredRecords().length === 1);

console.log("Data Quality Registry OK");
