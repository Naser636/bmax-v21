#!/usr/bin/env node
"use strict";
/*
 * V327 §P1 — CROSS-SESSION NATIVE CONTINUITY RUNNER. Demonstrates that native mission continuity survives across TWO
 * SEPARATE OS PROCESSES with NO systemd / NO VPS change — using ONLY existing mechanisms:
 *   - campaign-loop.runCampaignLoop with `registerPath` (the EXISTING durable resume point: campaign-controller.
 *     saveRegister/loadRegister persist the FULL register — specs included — crash-atomically after EACH mission), and
 *   - odg-native-mission-continuation.executeNativeLot (the REAL ODG-native executor: ACCEPTED only on green + actor=ODG).
 *
 * Each invocation is one "session": it loads the persisted register (seeding a native DAG on first run), runs the loop
 * (optionally capped by maxIterations to split work across sessions), persists after each mission, and APPENDS the
 * per-mission provenance (mission, actor, verdict, pid) to a durable sidecar JSONL. A second independent invocation
 * RESUMES from the file: already-ACCEPTED lots are NOT re-executed (idempotence), and it continues with the next
 * eligible missions. No fabrication: provenance is the production resolver's verdict; the loop's own gates are intact.
 *
 * Usage: npx tsx runtime/bin/odg-native-continuity-run.ts <registerPath> <provenanceLogPath> [maxIterations]
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const CL = require(path.join(ROOT, "runtime", "core", "campaign-loop.js"));
const CC = require(path.join(ROOT, "runtime", "core", "campaign-controller.js"));
const NMC = require(path.join(ROOT, "runtime", "core", "odg-native-mission-continuation.js"));
const EP = require(path.join(ROOT, "runtime", "core", "evidence-provenance.js")); // durable sealing: contentSha256 + sourceCommit + tamper-detection

const REGISTER_PATH = process.argv[2];
const PROV_LOG = process.argv[3];
const MAX_ITER = process.argv[4] ? Number(process.argv[4]) : 1000;
if (!REGISTER_PATH || !PROV_LOG) { process.stderr.write("usage: <registerPath> <provenanceLogPath> [maxIterations]\n"); process.exit(64); }

// The native DAG this continuity demo drives (A → B,C → D), each a bounded deterministic native mission (specs survive
// JSON persistence). Seeded ONCE on the first session; subsequent sessions RESUME the persisted file.
function seedRegister(): any {
  // ODG_CONTINUITY_SCENARIO=faulty seeds a FAILURE-ISOLATION register: FAIL is a native mission whose test can never pass
  // (wrong expected value) ⇒ it FAILS and stalls (no-repeat), while independent IND1/IND2 still complete — proving a
  // defective mission never immobilises independent work, across sessions. Default = the linear A→B,C→D native DAG.
  if (process.env.ODG_CONTINUITY_SCENARIO === "faulty") {
    return { version: "native-continuity-faulty", items: [
      { id: "IND1", status: "READY", deps: [], priority: 1, spec: { fnName: "i1", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] } },
      { id: "FAIL", status: "READY", deps: [], priority: 1, spec: { fnName: "fl", kind: "sum", examples: [{ args: [2, 3], expect: 999 }] }, injectFault: true },
      { id: "IND2", status: "READY", deps: [], priority: 2, spec: { fnName: "i2", kind: "max", examples: [{ args: [2, 3], expect: 3 }] } },
    ] };
  }
  return { version: "native-continuity", items: [
    { id: "A", status: "READY", deps: [], priority: 1, spec: { fnName: "a", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] }, injectFault: true },
    { id: "B", status: "READY", deps: ["A"], priority: 2, spec: { fnName: "b", kind: "max", examples: [{ args: [2, 3], expect: 3 }] } },
    { id: "C", status: "READY", deps: ["A"], priority: 2, spec: { fnName: "c", kind: "isEven", examples: [{ args: [4], expect: true }] } },
    { id: "D", status: "READY", deps: ["B", "C"], priority: 3, spec: { fnName: "d", kind: "clampNonNegative", examples: [{ args: [-5], expect: 0 }] } },
  ] };
}

const pid = process.pid;
const seededThisRun = !fs.existsSync(REGISTER_PATH);
if (seededThisRun) { fs.mkdirSync(path.dirname(REGISTER_PATH), { recursive: true }); CC.saveRegister(REGISTER_PATH, seedRegister()); }

// Load the persisted register (the resume point) and report its pre-run state (what the PREVIOUS session left).
const loaded = CC.loadRegister(REGISTER_PATH);
if (!loaded.ok) { process.stderr.write(`register not loadable: ${loaded.reason}\n`); process.exit(1); }
const preStatus: Record<string, string> = {};
for (const it of loaded.register.items) preStatus[it.id] = it.status;
const preAccepted = Object.keys(preStatus).filter((id) => preStatus[id] === "ACCEPTED");

// Run the REAL continuation loop with the REAL native executor, persisting to the SAME file after each mission.
const sink: any = {};
const result = CL.runCampaignLoop({
  registerPath: REGISTER_PATH,
  execute: (lot: any) => NMC.executeNativeLot(lot, sink),
  maxIterations: MAX_ITER,
  now: Date.now,
});

// The missions THIS session actually executed natively (the loop only calls execute() for non-ACCEPTED selected lots).
const executedThisRun = (result.transitions || []).filter((t: any) => t && t.event === "COMPLETED").map((t: any) => t.lot);
// Append durable provenance for each — the cross-process verifiable trail (append-only, never overwrites prior sessions).
fs.mkdirSync(path.dirname(PROV_LOG), { recursive: true });
for (const id of executedThisRun) {
  const p = sink[id] || {};
  fs.appendFileSync(PROV_LOG, JSON.stringify({ mission: id, actor: p.actor || null, verdict: p.verdict || null, pid, seededThisRun }) + "\n");
}

const failedThisRun = (result.transitions || []).filter((t: any) => t && t.event === "FAILED").map((t: any) => t.lot);

// DURABLE-READY provenance manifest for THIS session: a self-contained, tamper-evident, source-anchored record of what
// ODG natively executed (contentSha256 + sourceCommit via evidence-provenance — the #767 mechanism). The native flow
// now SELF-PRODUCES verifiable provenance (not a loose JSONL): verifyProvenance re-reads + integrity-checks it. Persisting
// it into a git-tracked durable store (durability = git history) stays a deliberate operator step — this runner never commits.
const manifest = EP.stampProvenance({
  kind: "ODG_NATIVE_CONTINUITY_SESSION", pid, seededThisRun, registerPath: REGISTER_PATH,
  executedThisRun, failedThisRun, stopped: result.stopped, lifecycleState: result.lifecycleState,
  provenanceByMission: executedThisRun.reduce((m: any, id: string) => { m[id] = { actor: (sink[id] || {}).actor || null, verdict: (sink[id] || {}).verdict || null }; return m; }, {}),
}, {});
const MANIFEST_PATH = PROV_LOG + ".manifest." + pid + ".json";
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
const manifestVerify = EP.verifyProvenance(JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"))); // re-read + integrity-check

process.stdout.write(JSON.stringify({
  pid, seededThisRun,
  preAcceptedFromPriorSession: preAccepted,
  executedThisRun,
  failedThisRun,
  reExecutedPriorWork: executedThisRun.filter((id: string) => preStatus[id] === "ACCEPTED"), // MUST be empty (no double execution)
  stopped: result.stopped, lifecycleState: result.lifecycleState, campaignComplete: result.campaignComplete === true,
  allActorsOdg: executedThisRun.every((id: string) => sink[id] && sink[id].actor === "ODG"),
  durableManifest: MANIFEST_PATH,
  manifestContentSha256: manifest.provenance.contentSha256,
  manifestVerified: manifestVerify.ok === true,
}, null, 2) + "\n");
export {};
