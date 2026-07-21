#!/usr/bin/env node

// ODG -> agent : builds a request envelope into the file mailbox.
// Runs with cwd = repository root, like every runtime script.

const fs = require("fs");
const envelope = require("./fleet-envelope");

let recordMission = null;
try {
  ({ recordMission } = require("./mission-ledger"));
} catch {
  recordMission = null;
}

function pickAgent(requestedAgent) {
  const registry = envelope.readJsonSafe("runtime/connectors/fleet-agents.json");
  const agents = (registry && registry.agents) || [];
  // Explicit routing : honour a requested agent only if it is enabled.
  if (requestedAgent) {
    const wanted = agents.find(a => a.enabled && a.id === requestedAgent);
    return wanted ? wanted.id : null;
  }
  // Default (unchanged) : first enabled agent.
  const agent = agents.find(a => a.enabled);
  return agent ? agent.id : null;
}

function readInstruction() {
  try {
    return fs.readFileSync("runtime/generated/llm/patch-request.md", "utf8");
  } catch {
    return "";
  }
}

function dispatch(mission, requestedAgent) {
  const agent = pickAgent(requestedAgent);
  if (!agent) {
    throw new Error(
      requestedAgent
        ? "Requested agent not enabled in fleet-agents.json: " + requestedAgent
        : "No enabled agent in fleet-agents.json"
    );
  }

  // Reuse: consume the artifact produced by engineering-brief-builder.
  const brief =
    envelope.readJsonSafe("runtime/generated/engineering-brief.json") || { mission };

  const request = envelope.buildRequest({
    mission,
    agent,
    brief,
    instruction: readInstruction()
  });

  const file = envelope.requestPath(request.requestId);
  envelope.writeJson(file, request);

  if (recordMission) {
    try {
      recordMission(mission);
    } catch {
      /* non-blocking evidence */
    }
  }

  return { requestId: request.requestId, agent, status: request.status, file };
}

module.exports = { dispatch };

if (require.main === module) {
  const mission = process.argv[2] || "BUILD_RUNTIME";
  const requestedAgent = process.argv[3]; // optional : route to a specific agent
  const r = dispatch(mission, requestedAgent);
  console.log("======================================");
  console.log("FLEET DISPATCHER");
  console.log("======================================");
  console.log("Mission   :", mission);
  console.log("Agent     :", r.agent);
  console.log("RequestId :", r.requestId);
  console.log("Status    :", r.status);
  console.log("Output    :", r.file);
  console.log("======================================");
}
