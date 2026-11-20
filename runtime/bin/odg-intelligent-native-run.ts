#!/usr/bin/env node
"use strict";
/*
 * V327 §5/§7 — INTELLIGENT NATIVE RUN (runtime entry). Makes odg-intelligent-native-cycle REACHABLE on demand: drives the
 * wired intelligent cycle (routing/policy/seam/decomposition/escalation over native-engineering-cycle) with the REAL local
 * model (ollama loopback) + the real native-project-builder, for a bounded mission. ODG decides resources from the
 * supplied calibrated history; the independent verifier arbitrates acceptance; a calibrated-low failure delegates to the
 * provider. Local only; no network beyond 127.0.0.1; no VPS/push. This is NOT a forced hard-task experiment (§3) — the
 * default mission is a reliable task that exercises the end-to-end path quickly.
 *
 * Usage: npx tsx runtime/bin/odg-intelligent-native-run.ts   (requires ollama on 127.0.0.1:11434)
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const IC = require(path.join(ROOT, "runtime", "core", "odg-intelligent-native-cycle.js"));
const GEN = require(path.join(ROOT, "runtime", "core", "local-model-generator.js"));
const BUILDER = require(path.join(ROOT, "runtime", "core", "native-project-builder.js"));

const generatorFor = (model: string) => GEN.makeLocalGenerator({ model, timeoutMs: 60000, numPredict: 300, temperature: 0.2 });
// A calibrated-reliable history for this task class ⇒ ODG's policy picks the cheap 3b/maxRepair-1 (measured-sufficient).
const history = [
  ...Array(18).fill(0).map(() => ({ missionType: "arith", verified: true })),
  ...Array(2).fill(0).map(() => ({ missionType: "arith", verified: false })),
];
const mission = {
  id: "intelligent-demo-add", type: "arith",
  spec: { name: "add", architecture: [{ path: "f.js", role: "add two numbers", contract: "module.exports=(a,b)=>a+b" }], independentTest: (m: any) => typeof m["f.js"] === "function" && m["f.js"](2, 3) === 5 && m["f.js"](-1, 1) === 0 },
};

(async () => {
  const r = await IC.runIntelligentCycle({ mission, history, generatorFor, deps: { buildProject: BUILDER.buildProject } });
  process.stdout.write(JSON.stringify({
    mission: r.mission, ok: r.ok,
    policy: r.policy, accepted: r.accepted, cycleOutcome: r.cycleOutcome,
    escalation: r.escalation, note: r.note,
  }, null, 2) + "\n");
  process.exit(0);
})().catch((e) => { process.stderr.write("intelligent-native-run error: " + String((e && e.message) || e) + "\n"); process.exit(1); });
export {};
