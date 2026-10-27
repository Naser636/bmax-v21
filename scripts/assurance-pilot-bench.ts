#!/usr/bin/env node
/**
 * assurance-pilot-bench — MEASURES the machine time of the productized assurance pilot (assurance-pilot-runner) over
 * synthetic fixtures, using process.hrtime. Run manually (NOT a gated test — timing is non-deterministic):
 *   tsx scripts/assurance-pilot-bench.ts [N]
 * Reports ms/run + runs/sec so the measured machine cost (≈0) feeding assurance-pilot-metrics.MEASURED_MACHINE_MS_PER_RUN
 * is reproducible and traceable. Synthetic data only; no network; no client data.
 */
"use strict";
const P = require("../runtime/core/assurance-pilot-runner.js");

const N = parseInt(process.argv[2] || "500", 10);
const mk = (i: number) => ({
  project: "synth-" + i,
  dependencies: Array.from({ length: 40 }, (_, j) => ({ name: "dep" + j, version: "1.0.0", license: j % 7 === 0 ? "GPL-3.0" : "MIT", outdated: j % 5 === 0 })),
  tests: { total: 50, passing: 40 },
  aiActivities: { generatesSyntheticContent: i % 2 === 0, systemInteractsWithHumans: true },
});

const t0 = process.hrtime.bigint();
let findings = 0;
for (let i = 0; i < N; i++) { const r = P.runPilot(mk(i), { at: "2026-10-27" }); findings += r.findings.length; P.applyRemediation(r, mk(i)); }
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
process.stdout.write(`assurance-pilot-bench: runs=${N} total_ms=${ms.toFixed(1)} ms_per_run=${(ms / N).toFixed(3)} runs_per_sec=${(N / (ms / 1000)).toFixed(0)} avg_findings=${(findings / N).toFixed(1)}\n`);
process.stdout.write(`=> machine/analysis cost is effectively €0; the real delivery cost is HUMAN time (see assurance-pilot-metrics).\n`);

export {};
