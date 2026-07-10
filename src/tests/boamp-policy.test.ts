import { BoampPolicy } from "@/core/boamp-policy";

const policy: BoampPolicy = {
  maxResults: 100,
  timeoutMs: 30000,
};

console.assert(policy.maxResults === 100);

console.log("BOAMP Policy OK");
