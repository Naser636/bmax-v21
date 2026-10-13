/*
 * Fleet Bridge pipeline stage — TypeScript canonical (Lot η3-B65). Faithful port of the historical
 * runtime/core/fleet-stage.js; behaviour is byte-identical. This stage is the SINGLE source of truth for the
 * runtime enable/disable decision (pipeline-builder only fixes WHERE it sits). Default OFF ⇒ inert exit-0
 * no-op; when enabled it drives the one-shot exchange Dispatcher → Bridge.drainOnce → Collector, reusing the
 * four existing JavaScript components UNCHANGED. Runs with cwd = repository root (bare relative paths, no
 * __dirname / process.cwd() derivation — correct from runtime/core AND runtime/dist/core alike, like B61).
 *
 * The four sibling dependencies (fleet-envelope, fleet-dispatcher, fleet-collector, fleet-bridge) are
 * UNTYPED JavaScript and are intentionally loaded with require() per the mission contract — they are NOT
 * ported here and remain .js. The resulting `any` bindings are therefore EXPLICIT and justified (no implicit
 * any; strict gate clean). Only resolveConfig — the pure, exported config-resolution contract — is fully
 * typed. The legacy .js is UNTOUCHED and remains the production default (ODG_STAGE_BASE=runtime/core) and the
 * rollback path; this port is reached only via the opt-in compiled base. The export surface
 * `module.exports = { resolveConfig }` is preserved so existing require() consumers are unchanged.
 */
"use strict";
// `import * as fs` (not require) keeps this file a MODULE — its top-level consts stay module-scoped and do
// not collide in the multi-file dist program — and preserves the historical module's fs load (fs is a typed
// Node builtin, NOT one of the four pinned JS dependencies). The four untyped .js deps below stay require().
import * as fs from "fs";
const envelope: any = require("./fleet-envelope");
const { dispatch }: any = require("./fleet-dispatcher");
const { collect }: any = require("./fleet-collector");
const bridge: any = require("./fleet-bridge");
void fs;

const CONFIG_FILE = "runtime/connectors/fleet-pipeline.json";

interface FleetConfig {
  enabled: boolean;
  failOpen: boolean;
  deterministic: boolean;
}

interface ContractFleet {
  enabled: boolean;
  deterministic: boolean;
}

// --------------------------------------------------------------------------
// Configuration resolution (default OFF). Precedence:
//   ODG_FLEET env var  >  mission contract  >  fleet-pipeline.json  >  built-in defaults
// --------------------------------------------------------------------------
function truthy(v: unknown): boolean {
  return ["on", "1", "true", "yes"].includes(String(v).trim().toLowerCase());
}
function falsy(v: unknown): boolean {
  return ["off", "0", "false", "no"].includes(String(v).trim().toLowerCase());
}

// Read the per-mission Fleet declaration from its contract, if any. A mission may opt IN to the
// Fleet exchange directly in its contract (self-describing, reproducible, no env var needed):
//   "fleet": true                              → enable, use configured agent
//   "fleet": { "enabled": true }               → enable, use configured agent
//   "fleet": { "enabled": true, "deterministic": true } → enable + offline deterministic agent
// Absent → no opinion (leaves the default OFF posture untouched for every legacy mission).
function readContractFleet(mission: string): ContractFleet | null {
  const spec = envelope.readJsonSafe(`runtime/missions/${mission}.json`);
  if (!spec || spec.fleet === undefined) return null;
  if (spec.fleet === true) return { enabled: true, deterministic: false };
  if (spec.fleet && typeof spec.fleet === "object") {
    return {
      enabled: Boolean(spec.fleet.enabled),
      deterministic: Boolean(spec.fleet.deterministic),
    };
  }
  return null;
}

function resolveConfig(mission?: string): FleetConfig {
  const file = envelope.readJsonSafe(CONFIG_FILE) || {};
  const cfg: FleetConfig = {
    enabled: Boolean(file.enabled), // default false
    failOpen: file.failOpen === undefined ? true : Boolean(file.failOpen),
    deterministic: false,
  };

  // Precedence: ODG_FLEET env > mission contract > fleet-pipeline.json > built-in default.
  const contract = mission ? readContractFleet(mission) : null;
  if (contract) {
    cfg.enabled = contract.enabled;
    cfg.deterministic = contract.deterministic;
  }

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
function finish(cfg: FleetConfig, ok: boolean, reason?: string): never {
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

function run(): void {
  const mission = process.argv[2] || "BUILD_RUNTIME";
  const cfg = resolveConfig(mission);

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

  // Deterministic mode drives the bridge's built-in offline agent (FLEET_BRIDGE_MOCK) so the full
  // Dispatcher → Bridge → Collector exchange completes reproducibly, with no external LLM CLI and no
  // wall-clock/network non-determinism in the OUTCOME. Reuses the existing mechanism unchanged.
  if (cfg.deterministic && !process.env.FLEET_BRIDGE_MOCK) {
    process.env.FLEET_BRIDGE_MOCK = "1";
    console.log("Agent    : offline-deterministic (built-in)");
  }

  console.log("Policy   :", cfg.failOpen ? "fail-open" : "fail-closed");

  // 1. Dispatcher : ODG -> mailbox (PENDING).
  let requestId: string | undefined;
  try {
    const d = dispatch(mission);
    requestId = d.requestId;
    console.log("Dispatch : ", requestId, "(" + d.status + ")");
  } catch (err: any) {
    return finish(cfg, false, "dispatcher: " + ((err && err.message) || err));
  }

  // 2. Bridge : one-shot drain (equivalent to --once). NOT watch mode.
  try {
    const bcfg = bridge.loadConfig();
    const results = bridge.drainOnce(bcfg);
    const mine = results.find((r: any) => r.requestId === requestId);
    console.log("Bridge   : ", mine ? mine.outcome : "not-processed");
    if (!mine || mine.outcome === "FAILED") {
      return finish(cfg, false, "bridge: " + (mine ? mine.reason : "request not processed"));
    }
  } catch (err: any) {
    return finish(cfg, false, "bridge: " + ((err && err.message) || err));
  }

  // 3. Collector : validate + governance -> VALIDATED.
  try {
    const c = collect(requestId);
    console.log("Collector: ", c.status, c.reason ? "(" + c.reason + ")" : "");
    if (c.status !== envelope.STATUS.VALIDATED) {
      return finish(cfg, false, "collector: " + (c.reason || c.status));
    }
  } catch (err: any) {
    return finish(cfg, false, "collector: " + ((err && err.message) || err));
  }

  console.log("======================================");
  return finish(cfg, true);
}

module.exports = { resolveConfig };

if (require.main === module) {
  run();
}
