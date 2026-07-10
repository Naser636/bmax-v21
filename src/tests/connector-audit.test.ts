import { auditConnector } from "@/core/connector-audit";

const result = auditConnector([
  {
    connector: "api",
    timestamp: Date.now(),
    status: "UP",
  },
]);

console.assert(result.audited === 1);
console.assert(result.hasFailures === false);

console.log("Connector Audit OK");
