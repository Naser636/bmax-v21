#!/usr/bin/env node

// agent -> ODG : reads a response envelope, correlates it with its request,
// validates + analyzes the proposal (reusing existing scripts), gates via
// governance, and records evidence. Runs with cwd = repository root.

const { spawnSync } = require("child_process");
const envelope = require("./fleet-envelope");
const { authorizeMission } = require("./governance-kernel");

let recordMission = null;
try {
  ({ recordMission } = require("./mission-ledger"));
} catch {
  recordMission = null;
}

function fail(request, requestId, reason) {
  if (request) {
    request.status = envelope.STATUS.FAILED;
    request.failedAt = new Date().toISOString();
    request.reason = reason;
    envelope.writeJson(envelope.requestPath(requestId), request);
  }
  return { requestId, status: envelope.STATUS.FAILED, reason };
}

function collect(requestId) {
  if (!requestId) {
    throw new Error("Missing requestId");
  }

  const request = envelope.readJsonSafe(envelope.requestPath(requestId));
  const response = envelope.readJsonSafe(envelope.responsePath(requestId));

  // Correlation: a matching request must exist.
  if (!request) {
    return { requestId, status: envelope.STATUS.FAILED, reason: "No correlated request" };
  }
  if (!response) {
    return fail(request, requestId, "No response found");
  }
  if (response.requestId !== requestId) {
    return fail(request, requestId, "RequestId mismatch");
  }

  const check = envelope.validateResponse(response);
  if (!check.valid) {
    return fail(request, requestId, "Invalid response: " + check.missing.join(", "));
  }

  const proposalJson = JSON.stringify(response.proposal);

  // Reuse response-parser.js : validates required fields + writes proposal.json.
  const parsed = spawnSync("node", ["runtime/llm/response-parser.js", proposalJson], {
    encoding: "utf8"
  });
  if (parsed.status !== 0) {
    return fail(request, requestId, "response-parser rejected proposal");
  }

  // Reuse proposal-analyzer.js : writes proposal-analysis.json.
  const analyzed = spawnSync("node", ["runtime/llm/proposal-analyzer.js"], {
    encoding: "utf8"
  });
  if (analyzed.status !== 0) {
    return fail(request, requestId, "proposal-analyzer failed");
  }

  // Governance gate before declaring the exchange validated.
  const governance = authorizeMission(request.mission);
  if (!governance.authorized) {
    return fail(request, requestId, "Governance refused");
  }

  request.status = envelope.STATUS.VALIDATED;
  request.validatedAt = new Date().toISOString();
  envelope.writeJson(envelope.requestPath(requestId), request);

  if (recordMission) {
    try {
      recordMission(request.mission);
    } catch {
      /* non-blocking evidence */
    }
  }

  return {
    requestId,
    status: envelope.STATUS.VALIDATED,
    mission: request.mission,
    actions: response.proposal.actions.length
  };
}

module.exports = { collect };

if (require.main === module) {
  const requestId = process.argv[2];
  const r = collect(requestId);
  console.log("======================================");
  console.log("FLEET COLLECTOR");
  console.log("======================================");
  console.log("RequestId :", r.requestId);
  console.log("Status    :", r.status);
  if (r.reason) console.log("Reason    :", r.reason);
  if (r.status === envelope.STATUS.VALIDATED) {
    console.log("Mission   :", r.mission);
    console.log("Actions   :", r.actions);
  }
  console.log("======================================");
  process.exit(r.status === envelope.STATUS.VALIDATED ? 0 : 1);
}
