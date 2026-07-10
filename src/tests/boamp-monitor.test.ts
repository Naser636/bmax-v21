import { BoampMonitor } from "@/core/boamp-monitor";

const monitor = new BoampMonitor();

console.assert(monitor.isHealthy());

console.log("BOAMP Monitor OK");
