import { computeDataScore } from "@/core/data-score";

console.assert(
  computeDataScore({
    source: "boamp",
    payload: {},
  }) === 100
);

console.log("Data Score OK");
