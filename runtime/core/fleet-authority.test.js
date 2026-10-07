#!/usr/bin/env node

/*
 * V45 — FLEET GOVERNED-AUTHORITY test.
 *
 * Proves the Fleet worker (Claude) is a PROPOSAL producer with ZERO Write/Edit/Bash authority, and that
 * the proposal round-trip is unchanged. Fleet applies no worker tree-writes (the collector validates the
 * textual {mission, summary, actions} proposal), so removing write authority changes nothing but the
 * worker's permissions — one governed execution model, no second write authority.
 *
 * Offline + deterministic: uses FLEET_BRIDGE_MOCK for the round-trip; never spawns a real agent.
 * Run: `node runtime/core/fleet-authority.test.js`.
 */

const assert = require("assert");
const bridge = require("./fleet-bridge");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const WRITE_TOKENS = ["acceptEdits", "Edit", "Write", "Bash", "bypassPermissions", "dangerously"];
function grantsWrite(args) {
  const joined = (args || []).join(" ");
  return WRITE_TOKENS.some((t) => joined.includes(t));
}

// --- 1) default config: the Claude worker is read-only -----------------------
{
  const cfg = bridge.loadConfig();
  const top = bridge.resolveAgentCommand(cfg, undefined); // top-level default
  ok("SECURITY: default Fleet worker command has NO Write/Edit/Bash/acceptEdits", !grantsWrite(top.args));
  ok("default Fleet worker runs plan mode", top.args.includes("plan"));
  ok("default Fleet worker is restricted to read-only tools", top.args.join(" ").includes("Read,Grep,Glob"));
}

// --- 2) named Claude agent: still read-only (no override re-grants write) -----
{
  const cfg = bridge.loadConfig();
  const claude = bridge.resolveAgentCommand(cfg, "claude");
  ok("SECURITY: 'claude' Fleet agent has NO write authority", !grantsWrite(claude.args));
  ok("'claude' Fleet agent uses plan + read-only tools", claude.args.includes("plan") && claude.args.join(" ").includes("Read,Grep,Glob"));
}

// --- 3) proposal round-trip is unchanged (worker produces a PROPOSAL, not a write) ---
{
  const prevMock = process.env.FLEET_BRIDGE_MOCK;
  process.env.FLEET_BRIDGE_MOCK = "1";
  try {
    const cfg = bridge.loadConfig();
    const res = bridge.invokeAgent(cfg, { mission: "V45_FLEET", agent: "claude", brief: { mission: "V45_FLEET" }, instruction: "noop" });
    ok("worker still returns a structured PROPOSAL (summary + actions), not a tree write", res.ok && !!res.proposal && Array.isArray(res.proposal.actions));
  } finally {
    if (prevMock === undefined) delete process.env.FLEET_BRIDGE_MOCK; else process.env.FLEET_BRIDGE_MOCK = prevMock;
  }
}

console.log(`\nFLEET GOVERNED-AUTHORITY — ${passed} assertions passed.`);
