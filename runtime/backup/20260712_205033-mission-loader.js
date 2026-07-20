#!/usr/bin/env node

const fs = require("fs");

const mission = process.argv[2];

if (!mission) {
    console.error("STOP: Missing mission name");
    process.exit(1);
}

const project = JSON.parse(
    fs.readFileSync("runtime/generated/project-context.json","utf8")
);

const brain = fs.readFileSync(
    "runtime/brain/MASTER_PLAN.md",
    "utf8"
);

const plan = {
    generatedAt: new Date().toISOString(),
    mission,
    project,
    brainLoaded: true,
    status: "READY_FOR_EXECUTION"
};

fs.mkdirSync("runtime/generated",{recursive:true});

fs.writeFileSync(
    "runtime/generated/mission-plan.json",
    JSON.stringify(plan,null,2)
);

console.log("======================================");
console.log("MISSION LOADER");
console.log("======================================");
console.log("Mission :",mission);
console.log("Brain   : LOADED");
console.log("Status  :",plan.status);
console.log("Output  : runtime/generated/mission-plan.json");
console.log("======================================");
