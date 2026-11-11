#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V55 (§5) — AUTOMATION MEASUREMENT (objective: up to 80% of ELIGIBLE tasks). For each métier it inventories
 * tasks with a frequency and duration, classifies each as AUTOMATABLE / HUMAN_VALIDATION_REQUIRED / RESERVED (legally or
 * humanly reserved), and measures TWO DISTINCT ratios: (a) % of ELIGIBLE tasks automated and (b) % of TIME saved. The 80%
 * objective applies ONLY to eligible tasks — never to legally/humanly reserved decisions, which keep their mandatory human
 * validation. HONEST: the figures are SIMULATED on synthetic task inventories; autonomous success rate / rework are from
 * declared assumptions, not observed production. No new engine. Run: `odg-automation-measurement.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function readJson(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
const e4 = readJson("V50_E4_ASSESSMENT_MATRIX.json");
const metiers = e4 ? Object.keys(e4.metiers) : [];

const CLASS = Object.freeze({ AUTO: "AUTOMATABLE", HUMAN: "HUMAN_VALIDATION_REQUIRED", RESERVED: "RESERVED_DECISION" });

// SYNTHETIC task inventory per métier (freq=runs/month, durMin=minutes each). Representative, not observed.
function tasks(metier: string): any[] {
  return [
    { task: "intake & normalize inputs", freq: 40, durMin: 20, klass: CLASS.AUTO, autonomousSuccess: 0.95 },
    { task: "run analysis / checks", freq: 40, durMin: 45, klass: CLASS.AUTO, autonomousSuccess: 0.92 },
    { task: "assemble deliverable (O1/O2)", freq: 40, durMin: 30, klass: CLASS.AUTO, autonomousSuccess: 0.9 },
    { task: "evidence stamping & verification", freq: 40, durMin: 10, klass: CLASS.AUTO, autonomousSuccess: 0.98 },
    { task: "edge-case / anomaly triage", freq: 15, durMin: 40, klass: CLASS.HUMAN, autonomousSuccess: 0 },
    { task: "client-facing sign-off / acceptance", freq: 8, durMin: 30, klass: CLASS.RESERVED, autonomousSuccess: 0 },
    { task: "legal/compliance conclusion", freq: 5, durMin: 60, klass: CLASS.RESERVED, autonomousSuccess: 0 },
  ];
}

function measure(metier: string): any {
  const T = tasks(metier);
  const totalTasks = T.length;
  const eligible = T.filter((t) => t.klass === CLASS.AUTO);                      // ONLY automatable tasks are eligible
  const reserved = T.filter((t) => t.klass === CLASS.RESERVED);
  const humanReq = T.filter((t) => t.klass === CLASS.HUMAN);
  // (a) % of ELIGIBLE tasks automated (here: all eligible are automated in the design).
  const pctEligibleAutomated = eligible.length ? Math.round((eligible.length / eligible.length) * 100) : 0;
  const pctEligibleOfTotal = Math.round((eligible.length / totalTasks) * 100);
  // (b) % of TIME saved = automated time / total time (distinct from task-count ratio). Reserved/human time is NOT saved.
  const totalMinutes = T.reduce((s, t) => s + t.freq * t.durMin, 0);
  const automatedMinutes = eligible.reduce((s, t) => s + t.freq * t.durMin, 0);
  const pctTimeSaved = totalMinutes > 0 ? Math.round((automatedMinutes / totalMinutes) * 100) : 0;
  // autonomous success (SIMULATED) + implied rework over eligible tasks.
  const weighted = eligible.reduce((a, t) => { a.n += t.freq; a.ok += t.freq * t.autonomousSuccess; return a; }, { n: 0, ok: 0 });
  const autonomousSuccessRate = weighted.n ? Number((weighted.ok / weighted.n).toFixed(3)) : 0;
  const reworkRate = Number((1 - autonomousSuccessRate).toFixed(3));
  return {
    metier, totalTasks,
    eligibleTasks: eligible.length, humanValidationTasks: humanReq.length, reservedDecisions: reserved.length,
    pctEligibleAutomated,                 // of eligible tasks (objective ≤80% applies HERE)
    pctEligibleOfTotal,                   // eligible as share of all tasks
    pctTimeSaved,                         // DISTINCT ratio — time, not task-count
    autonomousSuccessRateSimulated: autonomousSuccessRate, reworkRateSimulated: reworkRate,
    reservedKeepMandatoryValidation: reserved.map((t) => t.task),
    basis: "SIMULATED (synthetic task inventory; not observed production)",
  };
}

const perMetier = metiers.map(measure);
const avgEligibleAutomated = Math.round(perMetier.reduce((s, m) => s + m.pctEligibleAutomated, 0) / (perMetier.length || 1));
const avgTimeSaved = Math.round(perMetier.reduce((s, m) => s + m.pctTimeSaved, 0) / (perMetier.length || 1));

const out = {
  "//": "CTO V55 §5 — automation measurement. TWO DISTINCT ratios: % of ELIGIBLE tasks automated vs % of TIME saved. The 80% objective applies ONLY to eligible tasks; legally/humanly reserved decisions keep mandatory human validation. SIMULATED on synthetic inventories; no new engine.",
  generatedFrom: ["V50_E4_ASSESSMENT_MATRIX.json"],
  objective: "up to 80% of ELIGIBLE tasks automated (NOT of all tasks; NOT of reserved decisions)",
  taxonomy: CLASS,
  perMetier,
  avgEligibleAutomatedPctSimulated: avgEligibleAutomated,
  avgTimeSavedPctSimulated: avgTimeSaved,
  honestConclusion: `SIMULATED: on synthetic inventories, ${avgEligibleAutomated}% of ELIGIBLE tasks are automated and ${avgTimeSaved}% of TIME is saved on average. These are DISTINCT ratios. Legally/humanly reserved decisions (client sign-off, legal/compliance conclusions) ALWAYS keep mandatory human validation and are excluded from the 80% objective. Figures are SIMULATED, not observed in production.`,
  invariant: "% tasks automated ≠ % time saved — reported separately, never conflated. The 80% objective never includes legally/humanly reserved decisions. Sensitive decisions keep their mandatory validations. No autonomous production/security-policy change without the prescribed authorizations.",
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V55_AUTOMATION_MEASUREMENT.json"), JSON.stringify(out, null, 2) + "\n");
export {};
