import { ConnectorEvent } from "@/core/connector-event";

const event: ConnectorEvent = {
  connector: "api",
  timestamp: Date.now(),
  status: "UP",
};

console.assert(event.status === "UP");

console.log("Connector Event OK");
