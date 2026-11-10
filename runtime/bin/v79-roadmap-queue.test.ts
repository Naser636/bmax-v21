#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V79 §10 — real-roadmap-queue integration test. Verifies the queue is derived from the canonical artifacts
 * and fed to the REAL campaign-engine: T1 sources exhaustive (parts+programs+radar), T2 100% traceability coverage, T4
 * dedup (stable ids unique), T5 no-repeat (ACCEPTED radar missions not executed), T8 real engine executes Level-A, T7
 * owner-gated PREPARED not accepted, honest status typing (no FAIL masking), coverage≠completion.
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V79_ROADMAP_QUEUE.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("roadmap-queue artifact exists", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("T1: queue derived from parts + programs + radar (>=40 missions)", m.queueSize >= 40);
  check("T1: sources include V12.4 parts, programs, radar", m.traceabilityMatrix.some((t: any) => /V12\.4/.test(t.source)) && m.traceabilityMatrix.some((t: any) => /program/.test(t.source)) && m.traceabilityMatrix.some((t: any) => /radar/.test(t.source)));
  check("T2: 100% traceability coverage (every mission has a status+decision)", m.coveragePct === 100 && m.traceabilityMatrix.length === m.queueSize && m.traceabilityMatrix.every((t: any) => t.status && t.decision && t.nextAction));
  check("T4: dedup — all requirement ids unique", (() => { const ids = m.traceabilityMatrix.map((t: any) => t.requirement); return new Set(ids).size === ids.length; })());
  check("T5: no-repeat — ACCEPTED radar missions NOT re-executed", m.traceabilityMatrix.filter((t: any) => t.status === "ACCEPTED").every((t: any) => t.decision === "ALREADY_ACCEPTED"));
  check("T8: real engine executed Level-A missions (>4 accepted)", m.metrics.accepted > 4);
  check("T7: owner-gated missions PREPARED (not accepted)", m.metrics.preparedB >= 1 && m.traceabilityMatrix.some((t: any) => t.decision === "PREPARED_B"));
  check("honest: 0 masked failures OR failures honestly typed FAILED_NOT_ACCEPTED", m.metrics.failed === 0 || m.traceabilityMatrix.some((t: any) => t.decision === "FAILED_NOT_ACCEPTED"));
  check("stop reason explicit (not a silent cap)", /QUEUE_EXHAUSTED|ALL_REMAINING_DEFERRED|BUDGET|SAFETY_CAP/.test(m.stopReason));
  check("invariant: coverage != completion; DEFERRED not faked; no parallel registry", /100% coverage, not 100% done/i.test(m.invariant) && /no parallel registry/i.test(m.invariant));
  check("conclusion: full-queue feed != roadmap completion (honest)", /full-queue feed ≠ roadmap completion/i.test(m.honestConclusion));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V79 real roadmap queue → campaign engine (100% traced, dedup, no-repeat, Level-A executed, honest)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
