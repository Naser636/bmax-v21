import { SystemHealthPolicy } from "@/core/system-health-policy";

const policy: SystemHealthPolicy = {
  maxFailures: 3,
  alertThreshold: 2,
};

console.assert(policy.maxFailures === 3);

console.log("System Health Policy OK");
