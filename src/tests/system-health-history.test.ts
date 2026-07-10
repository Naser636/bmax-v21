import {
  addHealthHistory,
  getHealthHistory,
} from "@/core/system-health-history";

addHealthHistory({
  component: "http",
  healthy: true,
  message: "OK",
});

console.assert(getHealthHistory().length === 1);

console.log("System Health History OK");
