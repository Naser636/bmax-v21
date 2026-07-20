#!/usr/bin/env node

const fs = require("fs");

const input = process.argv[2];

if (!input) {
  console.error("Usage: node save-proposal.js '<json>'");
  process.exit(1);
}

let proposal;

try {
  proposal = JSON.parse(input);
} catch (e) {
  console.error("Invalid JSON:", e.message);
  process.exit(1);
}

fs.mkdirSync("runtime/generated/llm", { recursive: true });

fs.writeFileSync(
  "runtime/generated/llm/proposal.json",
  JSON.stringify(proposal, null, 2)
);

console.log("======================================");
console.log("PROPOSAL SAVED");
console.log("======================================");
console.log("Mission :", proposal.mission || "UNKNOWN");
console.log("Status  : OK");
console.log("Output  : runtime/generated/llm/proposal.json");
console.log("======================================");
