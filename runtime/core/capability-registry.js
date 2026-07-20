#!/usr/bin/env node

const fs = require("fs");

const execution = JSON.parse(
    fs.readFileSync("runtime/generated/execution-plan.json","utf8")
);

const registry = {
    generatedAt: new Date().toISOString(),
    status: "READY",
    capabilities: [
        "Mission Loader",
        "Execution Planner",
        "ProjectContext",
        "Runtime Brain",
    "ProjectContext Engine"
    ],
    missingCapabilities: execution.objectives.filter(
        c => ![
            "Mission Loader",
            "Execution Planner",
            "ProjectContext",
            "Runtime Brain",
    "ProjectContext Engine"
        ].includes(c)
    )
};

fs.writeFileSync(
    "runtime/generated/capability-registry.json",
    JSON.stringify(registry,null,2)
);

console.log("======================================");
console.log("CAPABILITY REGISTRY");
console.log("======================================");
console.log("Available :", registry.capabilities.length);
console.log("Missing   :", registry.missingCapabilities.length);
console.log("Output    : runtime/generated/capability-registry.json");
console.log("======================================");
