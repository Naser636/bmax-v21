#!/usr/bin/env node

const fs=require("fs");

function load(file){
    return JSON.parse(fs.readFileSync(file,"utf8"));
}

const runtime=load("runtime/generated/runtime-context.json");
const knowledge=load("runtime/generated/knowledge.json");
const decision=load("runtime/generated/decision.json");

const brief={
    generatedAt:new Date().toISOString(),
    mission:decision.mission,
    priority:decision.priority,
    project:{
        files:runtime.project.files,
        directories:runtime.project.directories
    },
    actions:decision.actions,
    knownCapabilities:knowledge.knownCapabilities.length,
    missingCapabilities:knowledge.missingCapabilities.length,
    objective:
        "Produce the minimum safe implementation. Reuse existing code whenever possible."
};

fs.mkdirSync("runtime/generated",{recursive:true});

fs.writeFileSync(
    "runtime/generated/engineering-brief.json",
    JSON.stringify(brief,null,2)
);

console.log("======================================");
console.log("ENGINEERING BRIEF");
console.log("======================================");
console.log("Mission :",brief.mission);
console.log("Priority:",brief.priority);
console.log("Actions :",brief.actions.length);
console.log("======================================");
