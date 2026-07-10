import { runSystem } from "@/core/system-runner";

const system = runSystem();

console.assert(system.capability !== undefined);
console.assert(system.decision !== undefined);
console.assert(Array.isArray(system.values));
console.assert(Array.isArray(system.audits));

console.log("System Runner OK");
