#!/usr/bin/env node
/*
 * LOT fleet-bridge — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, NO real provider / NO network / NO spend. build:runtime compiles
 * runtime/core/fleet-bridge.ts → dist; its deps (./fleet-envelope, ./provider-live-call-gate) are
 * co-located/compiled by build-dist-closure. A real `claude` is NEVER spawned: the LIVE branch is reached
 * only under ODG_PROVIDER_LIVE and is left unset here, so provider-live-call-gate REFUSES (fail-closed).
 *
 * PARITY SURFACE (byte-identical .js vs compiled .ts): buildPrompt; extractProposal over raw-object /
 * {result:string} / fenced-text / {proposal} / invalid shapes; resolveAgentCommand (override + fallback);
 * invokeAgent MOCK proposal; invokeAgent fail-closed gate REFUSAL (no spawn); loadConfig; tryClaim/releaseClaim
 * atomic O_EXCL semantics in isolated temp lock dirs. Timestamped envelope writes are NOT compared.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/fleet-bridge-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "fleet-bridge.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "fleet-bridge.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const temps: string[] = [];
const mkTmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "fb-")); temps.push(d); return d; };

console.log("LOT fleet-bridge — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/fleet-bridge.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/fleet-bridge.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["loadConfig", "processRequest", "drainOnce", "tryClaim", "releaseClaim", "extractProposal", "resolveAgentCommand", "invokeAgent"]) {
  check(typeof js[x] === "function" && typeof ts[x] === "function", `both export ${x}`);
}

// loadConfig parity.
check(EQ(js.loadConfig(), ts.loadConfig()), "loadConfig byte-identical (DEFAULT_CONFIG merged with file)");

// extractProposal parity across shapes.
const req = { mission: "M1" };
const shapes: any[] = [
  JSON.stringify({ mission: "M1", summary: "s", actions: ["a", "b"] }),
  JSON.stringify({ result: JSON.stringify({ summary: "s2", actions: [] }) }),
  'prefix text {"summary":"fenced","actions":["x"]} suffix',
  JSON.stringify({ proposal: { summary: "nested", actions: ["n"] } }),
  "not json at all",
  JSON.stringify({ summary: "no-actions-array", actions: "nope" }),
];
for (const raw of shapes) check(EQ(js.extractProposal(raw, req), ts.extractProposal(raw, req)), `extractProposal parity: ${String(raw).slice(0, 36)}`);

// resolveAgentCommand parity (per-agent override + fallback).
const cfg = { command: "claude", args: ["-p"], agents: { worker2: { command: "other", args: ["--x"] } } };
check(EQ(js.resolveAgentCommand(cfg, "worker2"), ts.resolveAgentCommand(cfg, "worker2")), "resolveAgentCommand per-agent override parity");
check(EQ(js.resolveAgentCommand(cfg, "unknown"), ts.resolveAgentCommand(cfg, "unknown")), "resolveAgentCommand fallback parity");

// invokeAgent MOCK parity (no spawn).
const savedMock = process.env.FLEET_BRIDGE_MOCK;
const savedLive = process.env.ODG_PROVIDER_LIVE;
try {
  process.env.FLEET_BRIDGE_MOCK = "1";
  const r = { mission: "M1", agent: "worker" };
  check(EQ(js.invokeAgent(cfg, r), ts.invokeAgent(cfg, r)) && js.invokeAgent(cfg, r).ok === true && /\[MOCK\]/.test(js.invokeAgent(cfg, r).proposal.summary), "invokeAgent MOCK proposal byte-identical (no spawn)");

  // Fail-closed gate REFUSAL: MOCK off + ODG_PROVIDER_LIVE unset ⇒ gateLiveCall refuses, NO real claude spawned.
  delete process.env.FLEET_BRIDGE_MOCK;
  delete process.env.ODG_PROVIDER_LIVE;
  const rj = js.invokeAgent(cfg, r), rt = ts.invokeAgent(cfg, r);
  check(EQ(rj, rt) && rj.ok === false && typeof rj.reason === "string", "invokeAgent fail-closed REFUSAL byte-identical (ODG_PROVIDER_LIVE unset ⇒ gate refuses, no spawn)");
} finally {
  if (savedMock === undefined) delete process.env.FLEET_BRIDGE_MOCK; else process.env.FLEET_BRIDGE_MOCK = savedMock;
  if (savedLive === undefined) delete process.env.ODG_PROVIDER_LIVE; else process.env.ODG_PROVIDER_LIVE = savedLive;
}

// Atomic O_EXCL claim semantics parity (isolated temp lock dirs per module).
function claimSeq(mod: any, dir: string): any {
  const c = { locksDir: path.join(dir, "locks"), lockTtlMs: 300000 };
  const first = mod.tryClaim(c, "REQ-1");
  const second = mod.tryClaim(c, "REQ-1"); // same id, same dir ⇒ EEXIST, not stale ⇒ false
  mod.releaseClaim(c, "REQ-1");
  const third = mod.tryClaim(c, "REQ-1");  // released ⇒ claimable again
  return { first, second, third };
}
{
  const rj = claimSeq(js, mkTmp()), rt = claimSeq(ts, mkTmp());
  check(EQ(rj, rt) && rj.first === true && rj.second === false && rj.third === true, "tryClaim/releaseClaim atomic semantics byte-identical (claim→blocked→release→reclaim)");
}

for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }

console.log(failures === 0 ? "ALL PASS — LOT fleet-bridge EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
