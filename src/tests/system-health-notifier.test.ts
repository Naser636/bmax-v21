import { notifyHealthIssue } from "@/core/system-health-notifier";

console.assert(
  notifyHealthIssue("DOWN") === "[HEALTH] DOWN"
);

console.log("System Health Notifier OK");
