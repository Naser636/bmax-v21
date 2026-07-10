import { DataQualityPolicy } from "@/core/data-quality-policy";

const policy: DataQualityPolicy = {
  minimumScore: 80,
  allowDuplicates: false,
};

console.assert(policy.minimumScore === 80);

console.log("Data Quality Policy OK");
