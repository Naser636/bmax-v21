#!/usr/bin/env node

const fs=require("fs");

const proposal=JSON.parse(
  fs.readFileSync("runtime/generated/llm/proposal.json","utf8")
);

const analysis=JSON.parse(
  fs.readFileSync("runtime/generated/llm/proposal-analysis.json","utf8")
);

const report={
  generatedAt:new Date().toISOString(),
  mission:proposal.mission,
  summary:proposal.summary,
  actions:proposal.actions,
  analysis,
  humanDecision:"PENDING"
};

fs.writeFileSync(
  "runtime/generated/llm/review-report.json",
  JSON.stringify(report,null,2)
);

console.log("======================================");
console.log("HUMAN REVIEW REPORT");
console.log("======================================");
console.log("Mission :",report.mission);
console.log("Actions :",report.actions.length);
console.log("Decision:",report.humanDecision);
console.log("Output  : runtime/generated/llm/review-report.json");
console.log("======================================");
