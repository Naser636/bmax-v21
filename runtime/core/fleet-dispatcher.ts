#!/usr/bin/env node

// ODG -> agent : builds a request envelope into the file mailbox (TypeScript port; parity with
// runtime/core/fleet-dispatcher.js). Runs with cwd = repository root, like every runtime script.
//
// Strict port: the public export (dispatch), the graceful mission-ledger load (try/catch ⇒ recordMission
// or null), the agent routing (explicit-enabled else first-enabled else throw), the cwd-relative reads
// (fleet-agents.json / engineering-brief.json / patch-request.md), the request envelope write via
// fleet-envelope and the non-blocking recordMission call are preserved EXACTLY. deps = fleet-envelope +
// mission-ledger (both already TS, co-located in dist). No import-time side effects (all work is inside
// dispatch(); the require.main block is CLI-only). The historical .js remains the behavioural reference.

const fs = require("fs");
const envelope = require("./fleet-envelope");

let recordMission: any = null;
try {
  ({ recordMission } = require("./mission-ledger"));
} catch {
  recordMission = null;
}

function pickAgent(requestedAgent: any): any {
  const registry = envelope.readJsonSafe("runtime/connectors/fleet-agents.json");
  const agents = (registry && registry.agents) || [];
  // Explicit routing : honour a requested agent only if it is enabled.
  if (requestedAgent) {
    const wanted = agents.find((a: any) => a.enabled && a.id === requestedAgent);
    return wanted ? wanted.id : null;
  }
  // Default (unchanged) : first enabled agent.
  const agent = agents.find((a: any) => a.enabled);
  return agent ? agent.id : null;
}

function readInstruction(): string {
  try {
    return fs.readFileSync("runtime/generated/llm/patch-request.md", "utf8");
  } catch {
    return "";
  }
}

function dispatch(mission: any, requestedAgent?: any): any {
  const agent = pickAgent(requestedAgent);
  if (!agent) {
    throw new Error(
      requestedAgent
        ? "Requested agent not enabled in fleet-agents.json: " + requestedAgent
        : "No enabled agent in fleet-agents.json",
    );
  }

  // Reuse: consume the artifact produced by engineering-brief-builder.
  const brief =
    envelope.readJsonSafe("runtime/generated/engineering-brief.json") || { mission };

  const request = envelope.buildRequest({
    mission,
    agent,
    brief,
    instruction: readInstruction(),
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

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (pickAgent,
// readInstruction) are module-scoped, not global script scope (prevents cross-lot TS2393). API unchanged.
export {};
