const {spawnSync}=require("child_process");

const mission=process.argv[2]||"runtime.demo";

const loader=spawnSync(
"node",
["runtime/core/mission-loader.js",mission],
{stdio:"inherit"}
);

if(loader.status!==0){
process.exit(loader.status);
}

console.log("ODG RUNTIME");
console.log("======================================");
console.log("Project :",ctx.project.name);
console.log("Sprint :",ctx.project.sprint);
console.log("Block :",ctx.project.block);
console.log("Mission :",report.mission.name);
console.log("Status :",report.status);
console.log("Report : runtime/generated/runtime-report.json");
console.log("======================================");
