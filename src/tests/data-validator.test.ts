import { validateRecord } from "@/core/data-validator";

console.assert(
  validateRecord({
    source: "boamp",
    payload: {},
  })
);

console.log("Data Validator OK");
