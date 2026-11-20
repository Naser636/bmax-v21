#!/usr/bin/env node
"use strict";
/*
 * V327 §7/§8 — HYPOTHESIS-DRIVEN MISSION runtime entry. Makes odg-hypothesis-driven-mission (#765) reachable: runs a
 * DETERMINISTIC native mission with a PRE-REGISTERED prediction (predict BEFORE execution), measures the real per-signal
 * delta (testsPass before→after), adjudicates via the production hypothesis-adjudicator, and CONSUMES the verdict
 * (REFUTED blocks acceptance). Deterministic (odg-native-engineering closed-executor; no local model, no network).
 * Usage: npx tsx runtime/bin/odg-hypothesis-mission-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const HDM = require(path.join(ROOT, "runtime", "core", "odg-hypothesis-driven-mission.js"));

let t = 0; const now = () => (t += 1000); // deterministic clock for reproducible pre-registration timestamps
const missions = [
  { id: "H-CONFIRM", spec: { fnName: "a", kind: "sum", examples: [{ args: [2, 3], expect: 5 }, { args: [1, 1], expect: 2 }] }, injectFault: true, prediction: { signal: "testsPass", direction: "improved" }, now },
  { id: "H-REFUTE", spec: { fnName: "b", kind: "max", examples: [{ args: [2, 3], expect: 3 }] }, injectFault: true, prediction: { signal: "testsPass", direction: "regressed" }, now },
  { id: "H-INCONC", spec: { fnName: "c", kind: "isEven", examples: [{ args: [4], expect: true }] }, injectFault: false, prediction: { signal: "testsPass", direction: "improved" }, now },
];
const results = missions.map((m: any) => { const r = HDM.runHypothesisMission(m); return { id: m.id, verdict: r.hypothesisVerdict, preRegistered: r.preRegistered, accepted: r.accepted, actor: r.actor, reason: r.acceptReason }; });
process.stdout.write(JSON.stringify({ kind: "ODG_HYPOTHESIS_DRIVEN_MISSIONS", results }, null, 2) + "\n");
export {};
