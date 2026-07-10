import { deduplicateRecords } from "@/core/data-deduplicator";

console.assert(
  deduplicateRecords([
    { source: "boamp", payload: {} },
    { source: "boamp", payload: {} },
  ]).length === 1
);

console.log("Data Deduplicator OK");
