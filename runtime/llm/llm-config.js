#!/usr/bin/env node

module.exports = {
  provider: "openai",
  model: "gpt-4.1",
  fallbackModel: "gpt-4o-mini",
  temperature: 0,
  maxTokens: 4000,
  timeout: 60000,
  engineeringBrief: {
    maxFiles: 3,
    maxContextLines: 300,
    includeErrors: true,
    includeContracts: true,
    includeMission: true
  }
};

if (require.main === module) {
  console.log("======================================");
  console.log("LLM CONFIG");
  console.log("======================================");
  console.log(module.exports);
  console.log("======================================");
}
