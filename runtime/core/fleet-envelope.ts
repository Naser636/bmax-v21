#!/usr/bin/env node

/*
 * Fleet Envelope (TypeScript port; parity with runtime/core/fleet-envelope.js).
 *
 * Request/response envelope helpers for the fleet stack (dispatcher, stage, bridge, collector,
 * scope-observer, client-intake). Pure port: all 11 public exports (REQUESTS_DIR, RESPONSES_DIR,
 * STATUS, readJsonSafe, writeJson, requestPath, responsePath, makeRequestId, buildRequest,
 * validateRequest, validateResponse), the CWD-relative dirs (NOT __dirname), the deterministic
 * collision-free id (<mission>-<NNN>), the PENDING/attempt:1/brief/instruction defaults, the
 * validation shapes and the require.main banner are preserved EXACTLY. buildRequest keeps its real
 * new Date().toISOString() createdAt (unchanged). The historical .js remains the reference.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const REQUESTS_DIR = "runtime/generated/fleet/requests";
const RESPONSES_DIR = "runtime/generated/fleet/responses";

const STATUS = {
  PENDING: "PENDING",
  DELIVERED: "DELIVERED",
  ANSWERED: "ANSWERED",
  VALIDATED: "VALIDATED",
  FAILED: "FAILED",
};

function readJsonSafe(file: any): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(file: any, obj: any): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

// A request id must be a SAFE file basename: a non-empty string of [A-Za-z0-9._-] with no path separator and no
// traversal. Fail-CLOSED: anything else throws (prevents writing/reading outside the requests/responses dirs, and
// prevents garbage ids like "[object Object]-NNN" from an object mission).
function safeSegment(requestId: any): string {
  if (typeof requestId !== "string" || !/^[A-Za-z0-9._-]+$/.test(requestId) || requestId === "." || requestId === "..") {
    throw new Error("fleet-envelope: unsafe requestId (path-safety): " + JSON.stringify(requestId));
  }
  return requestId;
}

// Sanitize a mission into a safe id prefix — a non-string or path-unsafe mission can NEVER produce "[object Object]"
// or a traversal segment; unsafe characters/leading dots become "_"; an empty result becomes "UNNAMED".
function missionKey(mission: any): string {
  const s = (typeof mission === "string" ? mission : String(mission)).trim().replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
  return s.length ? s : "UNNAMED";
}

function requestPath(requestId: any): string {
  return path.join(REQUESTS_DIR, safeSegment(requestId) + ".json");
}

function responsePath(requestId: any): string {
  return path.join(RESPONSES_DIR, safeSegment(requestId) + ".json");
}

// Deterministic, collision-free id: <missionKey>-<NNN> based on existing requests (mission sanitized, path-safe).
function makeRequestId(mission: any): string {
  const key = missionKey(mission);
  let seq = 1;
  if (fs.existsSync(REQUESTS_DIR)) {
    const prefix = key + "-";
    const used = fs
      .readdirSync(REQUESTS_DIR)
      .filter((f: any) => f.startsWith(prefix) && f.endsWith(".json"))
      .map((f: any) => parseInt(f.slice(prefix.length, -5), 10))
      .filter((n: any) => Number.isFinite(n));
    if (used.length) seq = Math.max(...used) + 1;
  }
  return key + "-" + String(seq).padStart(3, "0");
}

function buildRequest({ mission, agent, brief, instruction }: any): any {
  return {
    requestId: makeRequestId(mission),
    agent,
    status: STATUS.PENDING,
    mission,
    createdAt: new Date().toISOString(),
    attempt: 1,
    brief: brief || { mission },
    instruction: instruction || "",
  };
}

function validateRequest(env: any): any {
  const missing = ["requestId", "agent", "status", "mission"].filter((k) => !(env && k in env));
  return { valid: missing.length === 0, missing };
}

function validateResponse(env: any): any {
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
  missionKey,
  safeSegment,
  buildRequest,
  validateRequest,
  validateResponse,
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

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names are
// module-scoped, not global script scope (prevents cross-lot TS2393). The CommonJS API is unchanged.
export {};
