import { IntegrationContext } from "@/core/integration-context";

const context: IntegrationContext = {
  mission: {
    id: "1",
    query: "demo",
  },
};

console.assert(context.mission.id === "1");

console.log("Integration Context OK");
