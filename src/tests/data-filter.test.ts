import { filterValidRecords } from "@/core/data-filter";

console.assert(
  filterValidRecords([
    { source: "boamp", payload: {} },
    { source: "", payload: {} },
  ]).length === 1
);

console.log("Data Filter OK");
