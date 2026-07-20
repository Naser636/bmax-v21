#!/usr/bin/env node

const fs = require("fs");

const input = process.argv[2];

if (!input) {
  console.error("Missing response");
  process.exit(1);
}

let proposal;

try {
  proposal = JSON.parse(input);
} catch (e) {
  console.error("Invalid JSON");
  process.exit(1);
}

const required = [
  "mission",
  "summary",
  "actions"
];

const missing = required.filter(k => !(k in proposal));

console.log("======================================");
console.log("LLM RESPONSE PARSER");
console.log("======================================");

if (missing.length) {
  console.log("STATUS : INVALID");
  console.log("Missing:", missing.join(", "));
  process.exit(1);
}

console.log("STATUS : VALID");
console.log("Mission:", proposal.mission);
console.log("Actions:", proposal.actions.length);

fs.mkdirSync("runtime/generated/llm",{recursive:true});

fs.writeFileSync(
  "runtime/generated/llm/proposal.json",
  JSON.stringify(proposal,null,2)
);

console.log("Saved   : runtime/generated/llm/proposal.json");
console.log("======================================");
