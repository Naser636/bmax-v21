import { normalizeRecord } from "@/core/data-normalizer";

const record = normalizeRecord({
  source: " BOAMP ",
  payload: {},
});

console.assert(record.source === "boamp");

console.log("Data Normalizer OK");
