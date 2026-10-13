/*
 * Mission Interpreter — TypeScript canonical (Lot η2 migration; strict-typed in η2-T). Faithful port of
 * the historical runtime/core/mission-interpreter.js; behaviour (argv input, optional roadmap read, the
 * written runtime/generated/mission-interpretation.json, the console lines) is byte-identical. The legacy
 * .js is untouched and remains the production default; this compiled source is reached ONLY via the
 * stage-base routing opt-in (ODG_STAGE_BASE=runtime/dist/core). Types are verified under
 * tsconfig.runtime-leaves-strict.json (strict: true, noEmit) — NO ts-nocheck.
 */
import * as fs from "fs";

interface Interp {
  objective: string;
  priority: string;
  mode: string;
  category?: string;
}

const mission: string = process.argv[2] || "UNKNOWN";

const roadmapPath = "runtime/governance/RUNTIME_ROADMAP.md";

const roadmap: string = fs.existsSync(roadmapPath)
  ? fs.readFileSync(roadmapPath, "utf8")
  : "NO_ROADMAP";

const rules: Record<string, Interp> = {
  "SELF_ANALYZE_RUNTIME": {
    objective: "Analyze runtime",
    priority: "HIGH",
    mode: "ANALYZE",
  },
  "AUTONOMY_LEVEL_1": {
    objective: "Increase autonomy",
    priority: "CRITICAL",
    mode: "EVOLVE",
  },
};

const interpretation: Interp = rules[mission] || ((): Interp => {
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
      : "GENERAL",
  };
})();

const result = {
  mission,
  roadmapLoaded: roadmap !== "NO_ROADMAP",
  roadmapVersion: roadmap.split("\n")[0] || "",
  interpretation,
};

fs.mkdirSync("runtime/generated", { recursive: true });

fs.writeFileSync(
  "runtime/generated/mission-interpretation.json",
  JSON.stringify(result, null, 2),
);

console.log("======================================");
console.log("MISSION INTERPRETER v2");
console.log("======================================");
console.log("Mission  :", mission);
console.log("Roadmap  :", result.roadmapLoaded ? "LOADED" : "MISSING");
console.log("Version  :", result.roadmapVersion);
console.log("Objective:", interpretation.objective);
console.log("Priority :", interpretation.priority);
console.log("Mode     :", interpretation.mode);
console.log("======================================");
