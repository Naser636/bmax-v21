import {
  addConnectorEvent,
  getConnectorEvents,
} from "@/core/connector-event-log";

addConnectorEvent({
  connector: "api",
  timestamp: Date.now(),
  status: "UP",
});

console.assert(getConnectorEvents().length === 1);

console.log("Connector Event Log OK");
