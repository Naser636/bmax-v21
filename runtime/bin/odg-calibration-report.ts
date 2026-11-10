#!/usr/bin/env node
"use strict";
/*
 * V12.4 / CTO V40 LOT L — calibration report reader. Loads a calibration dataset + applies the UNCHANGED
 * native-engineering-readiness verdict, printing an honest per-class summary (attempts, successes, failures, reliability,
 * false successes, quality, readiness). Pure read-only; no model calls. Run: `npx tsx runtime/bin/odg-calibration-report.ts <dataset.json>`.
 */
const fs = require("fs");
const file = process.argv[2];
if (!file) { process.stderr.write("usage: odg-calibration-report.ts <dataset.json>\n"); process.exit(2); }
const d = JSON.parse(fs.readFileSync(file, "utf8"));
const accepted = (d.records || []).filter((r: any) => r.accepted).length;
const rejected = (d.records || []).filter((r: any) => r.independentVerdict === "REJECT").length;
const blocked = (d.records || []).filter((r: any) => r.independentVerdict === "BLOCKED").length;
process.stdout.write(JSON.stringify({
  model: d.model, class: d.class, attempts: d.attempts, accepted, rejected, blocked,
  reliability: d.reliability, falseSuccesses: d.falseSuccesses,
  quality: d.calibration && d.calibration.quality, readiness: d.readiness && d.readiness.verdict,
  rejectedTasks: (d.records || []).filter((r: any) => !r.accepted).map((r: any) => r.taskId),
}, null, 2) + "\n");
export {};
