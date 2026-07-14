#!/usr/bin/env node

const fs=require("fs");

const mission=process.argv[2]||"UNKNOWN";

const roadmapPath="runtime/governance/RUNTIME_ROADMAP.md";

const roadmap=fs.existsSync(roadmapPath)
    ?fs.readFileSync(roadmapPath,"utf8")
    :"NO_ROADMAP";

const rules={
    "SELF_ANALYZE_RUNTIME":{
        objective:"Analyze runtime",
        priority:"HIGH",
        mode:"ANALYZE"
    },
    "AUTONOMY_LEVEL_1":{
        objective:"Increase autonomy",
        priority:"CRITICAL",
        mode:"EVOLVE"
    }
};

const interpretation = rules[mission] || (() => {
    const upper = mission.toUpperCase();

    let mode = "UNKNOWN";

    if (upper.includes("ANALYSIS") || upper.includes("ANALYZE")) {
        mode = "ANALYZE";
    } else if (upper.includes("PLAN")) {
        mode = "PLAN";
    } else if (upper.includes("IMPLEMENT")) {
        mode = "IMPLEMENT";
    } else if (upper.includes("VALIDATION") || upper.includes("VALIDATE")) {
        mode = "VALIDATE";
    } else if (upper.includes("LEARN")) {
        mode = "LEARN";
    }

    let priority = "NORMAL";

    if (
        upper.includes("AUTONOMOUS") ||
        upper.includes("EXECUTION") ||
        upper.includes("IMPLEMENT")
    ) {
        priority = "HIGH";
    }

    return {
        objective: mission.replaceAll("_", " "),
        priority,
        mode,
        category: upper.includes("TEST")
            ? "VALIDATION"
            : upper.includes("DESIGN")
            ? "DESIGN"
            : upper.includes("IMPLEMENT")
            ? "IMPLEMENTATION"
            : "GENERAL"
    };
})();

const result={
    generatedAt:new Date().toISOString(),
    mission,
    roadmapLoaded:roadmap!=="NO_ROADMAP",
    roadmapVersion:roadmap.split("\n")[0]||"",
    interpretation
};

fs.mkdirSync("runtime/generated",{recursive:true});

fs.writeFileSync(
"runtime/generated/mission-interpretation.json",
JSON.stringify(result,null,2)
);

console.log("======================================");
console.log("MISSION INTERPRETER v2");
console.log("======================================");
console.log("Mission  :",mission);
console.log("Roadmap  :",result.roadmapLoaded?"LOADED":"MISSING");
console.log("Version  :",result.roadmapVersion);
console.log("Objective:",interpretation.objective);
console.log("Priority :",interpretation.priority);
console.log("Mode     :",interpretation.mode);
console.log("======================================");
