import type { MissionContext } from "@/core/mission-context";

const context: MissionContext = {
  missionId: "demo",
  state: "CREATED",
  metrics: {},
  results: [],
  logs: [],
  errors: [],
};

console.assert(context.state === "CREATED");

console.log("Mission Context OK");
