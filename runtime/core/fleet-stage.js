#!/usr/bin/env node

// Fleet Bridge pipeline stage.
//
// This is the SINGLE source of truth for the runtime enable/disable decision.
// pipeline-builder.js only defines WHERE this stage sits; whether it does any
// work is resolved here, at execution time.
//
// When enabled it drives the full Fleet exchange in one-shot mode:
//     Dispatcher -> Bridge (drain once) -> Collector -> next pipeline stage
// reusing the existing components unmodified. When disabled it is an inert
// exit-0 no-op, so the pipeline behaves exactly as before Fleet integration.
//
// Runs with cwd = repository root, like every runtime stage.

const fs = require("fs");
const envelope = require("./fleet-envelope");
const { dispatch } = require("./fleet-dispatcher");
const { collect } = require("./fleet-collector");
const bridge = require("./fleet-bridge");

const CONFIG_FILE = "runtime/connectors/fleet-pipeline.json";

// --------------------------------------------------------------------------
// Configuration resolution (default OFF). Precedence:
//   ODG_FLEET env var  >  fleet-pipeline.json  >  built-in defaults
// --------------------------------------------------------------------------
function truthy(v) {
  return ["on", "1", "true", "yes"].includes(String(v).trim().toLowerCase());
}
function falsy(v) {
  return ["off", "0", "false", "no"].includes(String(v).trim().toLowerCase());
}

function resolveConfig() {
  const file = envelope.readJsonSafe(CONFIG_FILE) || {};
  const cfg = {
    enabled: Boolean(file.enabled), // default false
    failOpen: file.failOpen === undefined ? true : Boolean(file.failOpen)
  };

  const env = process.env.ODG_FLEET;
  if (env !== undefined && env !== "") {
    if (truthy(env)) cfg.enabled = true;
    else if (falsy(env)) cfg.enabled = false;
  }
  return cfg;
}

// --------------------------------------------------------------------------
// Exit-code policy. failOpen (default) => Fleet failures never break the
// pipeline (warn + exit 0). failOpen:false (fail-closed) => propagate exit 1
// so odg-run.js STOPs the mission.
// --------------------------------------------------------------------------
function finish(cfg, ok, reason) {
  if (ok) {
    console.log("Fleet stage : OK");
    process.exit(0);
  }
  if (cfg.failOpen) {
    console.warn("Fleet stage : WARN (fail-open, non-blocking):", reason);
    process.exit(0);
  }
  console.error("Fleet stage : FAILED (fail-closed):", reason);
  process.exit(1);
}

function run() {
  const mission = process.argv[2] || "BUILD_RUNTIME";
  const cfg = resolveConfig();

  console.log("======================================");
  console.log("FLEET STAGE");
  console.log("======================================");
  console.log("Mission  :", mission);
  console.log("Enabled  :", cfg.enabled);

  if (!cfg.enabled) {
    console.log("Fleet: DISABLED (skipped)");
    console.log("======================================");
    process.exit(0);
  }

  console.log("Policy   :", cfg.failOpen ? "fail-open" : "fail-closed");

  // 1. Dispatcher : ODG -> mailbox (PENDING).
  let requestId;
  try {
    const d = dispatch(mission);
    requestId = d.requestId;
    console.log("Dispatch : ", requestId, "(" + d.status + ")");
  } catch (err) {
    return finish(cfg, false, "dispatcher: " + (err && err.message || err));
  }

  // 2. Bridge : one-shot drain (equivalent to --once). NOT watch mode.
  try {
    const bcfg = bridge.loadConfig();
    const results = bridge.drainOnce(bcfg);
    const mine = results.find(r => r.requestId === requestId);
    console.log("Bridge   : ", mine ? mine.outcome : "not-processed");
    if (!mine || mine.outcome === "FAILED") {
      return finish(cfg, false, "bridge: " + (mine ? mine.reason : "request not processed"));
    }
  } catch (err) {
    return finish(cfg, false, "bridge: " + (err && err.message || err));
  }

  // 3. Collector : validate + governance -> VALIDATED.
  try {
    const c = collect(requestId);
    console.log("Collector: ", c.status, c.reason ? "(" + c.reason + ")" : "");
    if (c.status !== envelope.STATUS.VALIDATED) {
      return finish(cfg, false, "collector: " + (c.reason || c.status));
    }
  } catch (err) {
    return finish(cfg, false, "collector: " + (err && err.message || err));
  }

  console.log("======================================");
  return finish(cfg, true);
}

module.exports = { resolveConfig };

if (require.main === module) {
  run();
}
