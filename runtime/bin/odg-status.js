#!/usr/bin/env node
const fs=require("fs");

const ctx=JSON.parse(fs.readFileSync("runtime/generated/project-context.json","utf8"));

const status={
generatedAt:new Date().toISOString(),
project:ctx.project,
runtime:"READY",
foundation:"FROZEN",
nextMission:"Sprint13 Complete",
inventory:ctx.runtimeInventory
};

fs.writeFileSync(
"runtime/generated/runtime-status.json",
JSON.stringify(status,null,2)
);

console.log("STATUS : READY");
