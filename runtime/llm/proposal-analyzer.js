#!/usr/bin/env node

const fs=require("fs");

const file="runtime/generated/llm/proposal.json";

if(!fs.existsSync(file)){
  console.error("Proposal not found");
  process.exit(1);
}

const proposal=JSON.parse(fs.readFileSync(file,"utf8"));

const report={
  generatedAt:new Date().toISOString(),
  mission:proposal.mission||null,
  valid:Boolean(
    proposal.mission &&
    proposal.summary &&
    Array.isArray(proposal.actions)
  ),
  actions:Array.isArray(proposal.actions)
    ? proposal.actions.length
    : 0,
  readyForHumanReview:false
};

report.readyForHumanReview =
  report.valid &&
  report.actions>0;

fs.writeFileSync(
  "runtime/generated/llm/proposal-analysis.json",
  JSON.stringify(report,null,2)
);

console.log("======================================");
console.log("PROPOSAL ANALYZER");
console.log("======================================");
console.log("Mission :",report.mission);
console.log("Valid   :",report.valid);
console.log("Actions :",report.actions);
console.log("Review  :",report.readyForHumanReview);
console.log("======================================");
