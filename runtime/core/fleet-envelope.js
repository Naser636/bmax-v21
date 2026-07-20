#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const REQUESTS_DIR = "runtime/generated/fleet/requests";
const RESPONSES_DIR = "runtime/generated/fleet/responses";

const STATUS = {
  PENDING: "PENDING",
  DELIVERED: "DELIVERED",
  ANSWERED: "ANSWERED",
  VALIDATED: "VALIDATED",
  FAILED: "FAILED"
};

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function requestPath(requestId) {
  return path.join(REQUESTS_DIR, requestId + ".json");
}

function responsePath(requestId) {
  return path.join(RESPONSES_DIR, requestId + ".json");
}

// Deterministic, collision-free id: <mission>-<NNN> based on existing requests.
function makeRequestId(mission) {
  let seq = 1;
  if (fs.existsSync(REQUESTS_DIR)) {
    const prefix = mission + "-";
    const used = fs
      .readdirSync(REQUESTS_DIR)
      .filter(f => f.startsWith(prefix) && f.endsWith(".json"))
      .map(f => parseInt(f.slice(prefix.length, -5), 10))
      .filter(n => Number.isFinite(n));
    if (used.length) seq = Math.max(...used) + 1;
  }
  return mission + "-" + String(seq).padStart(3, "0");
}

function buildRequest({ mission, agent, brief, instruction }) {
  return {
    requestId: makeRequestId(mission),
    agent,
    status: STATUS.PENDING,
    mission,
    createdAt: new Date().toISOString(),
    attempt: 1,
    brief: brief || { mission },
    instruction: instruction || ""
  };
}

function validateRequest(env) {
  const missing = ["requestId", "agent", "status", "mission"].filter(
    k => !(env && k in env)
  );
  return { valid: missing.length === 0, missing };
}

function validateResponse(env) {
  const missing = [];
  if (!env || !("requestId" in env)) missing.push("requestId");
  if (!env || !("agent" in env)) missing.push("agent");
  const p = env && env.proposal;
  if (!p || !("mission" in p)) missing.push("proposal.mission");
  if (!p || !("summary" in p)) missing.push("proposal.summary");
  if (!p || !Array.isArray(p.actions)) missing.push("proposal.actions");
  return { valid: missing.length === 0, missing };
}

module.exports = {
  REQUESTS_DIR,
  RESPONSES_DIR,
  STATUS,
  readJsonSafe,
  writeJson,
  requestPath,
  responsePath,
  makeRequestId,
  buildRequest,
  validateRequest,
  validateResponse
};

if (require.main === module) {
  console.log("======================================");
  console.log("FLEET ENVELOPE");
  console.log("======================================");
  console.log("Requests :", REQUESTS_DIR);
  console.log("Responses:", RESPONSES_DIR);
  console.log("Statuses :", Object.values(STATUS).join(" -> "));
  console.log("======================================");
}
