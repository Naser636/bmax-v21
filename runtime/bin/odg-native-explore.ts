#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V39 LOT J — LIVE NATIVE EXPLORATION RUNNER. Drives the EXISTING native-engineering-cycle +
 * native-project-builder with the REAL local-model generator seam (qwen2.5-coder via 127.0.0.1:11434), in EXPLORE mode
 * (externally authorized), across complexity classes with real inter-file contracts and functional tests. It records the
 * REAL outcomes (the independent verifier decides ACCEPT/REJECT) with full provenance and writes a dataset. It injects NO
 * synthetic result, never turns an absence of result into a success, and never declares CALIBRATED. Local only; no network
 * beyond 127.0.0.1; no VPS/push. Run manually: `npx tsx runtime/bin/odg-native-explore.ts [model] [outPath]`.
 */

const CYCLE = require("../core/native-engineering-cycle.js");
const BUILDER = require("../core/native-project-builder.js");
const GEN = require("../core/local-model-generator.js");
const NBO = require("../core/native-build-outcome.js");
const DP = require("../core/decomposition-planner.js");
const fs = require("fs");
const path = require("path");

const MODEL = process.argv[2] || "qwen2.5-coder:3b";
const OUT = process.argv[3] || path.join(__dirname, "..", "..", "docs", "odg", "native-exploration-live.json");

// --- benchmark projects: real verifiable requirements, inter-file contracts, functional tests ---
const PROJECTS: any[] = [
  { name: "trivial-add", attempts: 2, architecture: [{ path: "add.js", role: "add two numbers", contract: "module.exports = (a, b) => a + b" }],
    independentTest: (m: any) => typeof m["add.js"] === "function" && m["add.js"](2, 3) === 5 && m["add.js"](-1, 1) === 0 },
  { name: "simple-calc", attempts: 2,
    architecture: [
      { path: "ops.js", role: "arithmetic operations", contract: "module.exports = { add: (a,b) => a+b, sub: (a,b) => a-b }" },
      { path: "calc.js", role: "a calculator using ops", contract: "const ops = require('./ops.js'); module.exports = { sum: (a,b) => ops.add(a,b), diff: (a,b) => ops.sub(a,b) }", dependsOn: ["ops.js"] }],
    independentTest: (m: any) => { const c = m["calc.js"]; return c && c.sum(2, 3) === 5 && c.diff(5, 2) === 3; } },
  { name: "complex-pipeline", attempts: 1,
    architecture: [
      { path: "nums.js", role: "convert a comma string to an array of integers", contract: "module.exports = (s) => String(s).split(',').map((x) => Number(x))" },
      { path: "sum.js", role: "sum the integers", contract: "const nums = require('./nums.js'); module.exports = (s) => nums(s).reduce((a, b) => a + b, 0)", dependsOn: ["nums.js"] },
      { path: "max.js", role: "max of the integers", contract: "const nums = require('./nums.js'); module.exports = (s) => Math.max.apply(null, nums(s))", dependsOn: ["nums.js"] },
      { path: "report.js", role: "combine sum and max", contract: "const sum = require('./sum.js'); const max = require('./max.js'); module.exports = (s) => ({ sum: sum(s), max: max(s) })", dependsOn: ["sum.js", "max.js"] }],
    independentTest: (m: any) => { const r = m["report.js"]; const o = r && r("1,2,3"); return o && o.sum === 6 && o.max === 3; } },
  { name: "meta-undefined-detector", attempts: 1,
    architecture: [{ path: "detect.js", role: "analyze code to detect undefined symbols (code-analyzing-code)", contract: "module.exports = (code, declared) => the array of identifier tokens that appear in the string `code` but are not present in the `declared` array" }],
    independentTest: (m: any) => { const d = m["detect.js"]; if (typeof d !== "function") return false; const out = d("foo + bar + foo", ["foo"]); return Array.isArray(out) && out.indexOf("bar") >= 0 && out.indexOf("foo") < 0; } },
];

function nowIso(): string { return new Date().toISOString(); }

(async () => {
  const liveGen = GEN.makeLocalGenerator({ model: MODEL, timeoutMs: 180000, numPredict: 768, temperature: 0.1 });
  // the build seam: the REAL native-project-builder with the LIVE model generator (1 repair pass allowed).
  const buildSeam = async (s: any) => BUILDER.buildProject(s, { generateFile: liveGen, maxRepair: 1 });

  const started = nowIso(); const tStart = Date.now();
  let ledger: any[] = [];        // the REAL outcome ledger (only live results)
  const records: any[] = [];

  for (const proj of PROJECTS) {
    const strat = DP.chooseStrategy({ name: proj.name, architecture: proj.architecture });
    for (let attempt = 1; attempt <= proj.attempts; attempt++) {
      const spec = { name: proj.name, architecture: proj.architecture, independentTest: proj.independentTest };
      const t0 = Date.now();
      let cycle: any = null, err: any = null, buildOutcome: any = null;
      try {
        // EXPLORE mode, externally authorized (owner delegation 2026-11-10). The cycle routes->strategy->build->record.
        cycle = await CYCLE.runNativeCycle(spec, ledger, { build: async (sp: any) => { buildOutcome = await buildSeam(sp); return buildOutcome; } }, { mode: "explore", exploreAuthorized: true, attempt });
        ledger = cycle.outcomes || ledger;
      } catch (e: any) { err = String((e && e.message) || e); }
      const ms = Date.now() - t0;

      const bo = buildOutcome || {};
      const rec = {
        project: proj.name, complexity: DP.assessComplexity({ name: proj.name, architecture: proj.architecture }).complexity,
        strategy: strat.strategy, attempt, model: MODEL,
        filesPlanned: bo.filesPlanned ?? proj.architecture.length, filesGenerated: bo.filesGenerated ?? 0,
        buildOk: bo.buildOk === true, repairs: bo.repairs ?? null,
        independentVerdict: err ? "BLOCKED" : (bo.accepted === true ? "ACCEPT" : "REJECT"),
        accepted: bo.accepted === true,
        outcome: cycle ? cycle.outcome : "UNKNOWN",
        falseSuccess: bo.buildOk === true && bo.verified === false && bo.accepted === false, // compiled but failed the independent test
        buildError: bo.buildError || null, verifyError: bo.verifyError || null, error: err,
        evidenceGathering: cycle ? cycle.evidenceGathering : null,
        durationMs: ms, at: nowIso(),
      };
      records.push(rec);
      process.stdout.write(`[${rec.project} #${attempt} ${rec.complexity}/${rec.strategy}] verdict=${rec.independentVerdict} buildOk=${rec.buildOk} files=${rec.filesGenerated}/${rec.filesPlanned} repairs=${rec.repairs} ${ms}ms\n`);
    }
  }

  // reliability by class × strategy, over the REAL verified outcomes only (NEVER declared CALIBRATED here).
  const reliability = NBO.nativeReliabilityByClass(ledger);
  const summary: any = {};
  for (const r of records) { const k = `${r.strategy}:${r.complexity}`; const b = (summary[k] = summary[k] || { attempts: 0, compiled: 0, accepted: 0, rejected: 0, blocked: 0, falseSuccess: 0, totalMs: 0 }); b.attempts++; if (r.buildOk) b.compiled++; if (r.accepted) b.accepted++; if (r.independentVerdict === "REJECT") b.rejected++; if (r.independentVerdict === "BLOCKED") b.blocked++; if (r.falseSuccess) b.falseSuccess++; b.totalMs += r.durationMs; }

  const dataset = {
    "//": "CTO V39 LOT J — REAL live native-model exploration outcomes. NOT synthetic. Local qwen2.5-coder via 127.0.0.1:11434. VERIFIED in-repo != DEPLOYED. n per class is small ⇒ NOT CALIBRATED (insufficient observations by design).",
    model: MODEL, host: "http://127.0.0.1:11434", mode: "EXPLORE (externally authorized — owner delegation 2026-11-10)",
    startedAt: started, finishedAt: nowIso(), totalDurationMs: Date.now() - tStart,
    projects: PROJECTS.map((p) => ({ name: p.name, complexity: DP.assessComplexity({ name: p.name, architecture: p.architecture }).complexity, strategy: DP.chooseStrategy({ name: p.name, architecture: p.architecture }).strategy, attempts: p.attempts })),
    records, summaryByClass: summary, reliabilityByClass: reliability,
    honesty: "each outcome decided by the INDEPENDENT verifier (not the generator); rejects recorded as real failures; absence of result ⇒ UNKNOWN; no class generalized to another; native capability NOT auto-promoted; CALIBRATED NOT declared (n insufficient).",
  };
  fs.writeFileSync(OUT, JSON.stringify(dataset, null, 2) + "\n");
  process.stdout.write(`\n=== DATASET written: ${OUT} ===\n`);
  process.stdout.write(JSON.stringify({ summaryByClass: summary, overall: reliability.overall, totalMs: dataset.totalDurationMs }, null, 2) + "\n");
})();

export {};
