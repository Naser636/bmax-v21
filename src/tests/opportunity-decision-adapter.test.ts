import { opportunityToCapability } from "@/core/opportunity-decision-adapter";

const capability = opportunityToCapability({
  id: "opp-1",
  title: "Demo",
  description: "Demo description",
  source: "BOAMP",
  createdAt: Date.now(),
});

console.assert(capability.id === "opp-1");
console.assert(capability.name === "Demo");
console.assert(capability.version === "2.0");

console.log("Opportunity Decision Adapter OK");
