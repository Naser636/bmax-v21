import { IntegrationMission } from "@/core/integration-mission";

const mission: IntegrationMission = {
  id: "mission-1",
  query: "informatique",
};

console.assert(mission.query === "informatique");

console.log("Integration Mission OK");
