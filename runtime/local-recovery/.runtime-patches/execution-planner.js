#!/usr/bin/env node

const fs=require("fs");

const plan=JSON.parse(
fs.readFileSync("runtime/generated/mission-plan.json","utf8")
);

const execution={
generatedAt:new Date().toISOString(),
mission:plan.mission,
status:"READY",
steps:[
"LOAD_PROJECT_CONTEXT",
"LOAD_RUNTIME_BRAIN",
"SELECT_NEXT_OBJECTIVE",
"BUILD_COMPONENT",
"VERIFY",
"DOCUMENT",
"UPDATE_MEMORY"
],
nextObjective:plan.nextObjective,
objectives:plan.objectives
};

fs.writeFileSync(
"runtime/generated/execution-plan.json",
JSON.stringify(execution,null,2)
);

console.log("======================================");
console.log("EXECUTION PLANNER");
console.log("======================================");
console.log("Mission :",execution.mission);
console.log("Next :",execution.nextObjective);
console.log("Steps :",execution.steps.length);
console.log("Output : runtime/generated/execution-plan.json");
console.log("======================================");
