import { addHistory, getHistory } from "@/core/connector-history";

addHistory({
  connector: "api",
  timestamp: Date.now(),
  status: "UP",
});

console.assert(getHistory().length === 1);

console.log("Connector History OK");
