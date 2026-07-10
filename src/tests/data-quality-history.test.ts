import {
  addQualitySnapshot,
  getQualityHistory,
} from "@/core/data-quality-history";

addQualitySnapshot([]);

console.assert(getQualityHistory().length === 1);

console.log("Data Quality History OK");
