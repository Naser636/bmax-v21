#!/usr/bin/env node
"use strict";
/*
 * V360 §6/§7 — NIGHT-CYCLE RUN (runtime entry / the trigger body a systemd/cron timer WOULD invoke). Drives the canonical
 * odg-night-cycle-scheduler, whose cycleFn runs the canonical odg-self-improvement-cycle over the REAL coverage + compass.
 * READ-ONLY / PROPOSED-only: it never builds, integrates, or measures autonomously.
 *
 * Trigger source:
 *   - natural: uses the real wall clock (process time). It only EXECUTES if the real time is inside a night slot.
 *   - controlled demonstration: ODG_NIGHT_FORCE_EPOCH=<ms> (or argv[2]) injects a night epoch so a real cycle actually runs
 *     here in the dev environment (honestly labelled "forced controlled trigger" — NOT a persistent timer).
 *
 * Persistence: trigger state (doneSlots/lock) is a GITIGNORED dev file (runtime/generated/night-cycle-state.json), NOT a VPS
 * mutation. The DURABLE unattended auto-trigger needs a systemd/cron install on the VPS, which is OWNER_GATED (§12).
 *
 * Usage: npx tsx runtime/bin/odg-night-cycle-run.ts [forceEpochMs]
 */
const path = require("path");
const fs = require("fs");
const ROOT = path.join(__dirname, "..", "..");
const CIG = require(path.join(ROOT, "runtime", "core", "change-impact-graph.js"));
const SCAN = require(path.join(ROOT, "runtime", "core", "odg-consumer-scan.js"));
const COV = require(path.join(ROOT, "runtime", "core", "odg-system-coverage.js"));
const COMPASS = require(path.join(ROOT, "runtime", "core", "odg-v360-compass.js"));
const CYCLE = require(path.join(ROOT, "runtime", "core", "odg-self-improvement-cycle.js"));
const SCHED = require(path.join(ROOT, "runtime", "core", "odg-night-cycle-scheduler.js"));

const STATE_PATH = path.join(ROOT, "runtime", "generated", "night-cycle-state.json");

// ---- the cycle BODY (the canonical odg-self-improvement-cycle over the REAL coverage + compass) ----
function buildCycleResult(): any {
  const graph = CIG.buildGraph(ROOT);
  const scanned: any[] = [];
  function walk(dir: string, tag: string, depth: number): void {
    let entries: any[]; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || depth > 6) continue; walk(full, tag, depth + 1); continue; }
      if (!/\.(ts|tsx|js|jsx)$/.test(e.name) || /\.test\.(ts|js)$/.test(e.name)) continue;
      let src: string; try { src = fs.readFileSync(full, "utf8"); } catch { continue; }
      scanned.push({ consumer: tag + ":" + e.name.replace(/\.(tsx?|jsx?)$/, ""), src });
    }
  }
  walk(path.join(ROOT, "runtime", "bin"), "bin", 0);
  walk(path.join(ROOT, "src"), "app", 0);
  walk(path.join(ROOT, "scripts"), "script", 0);
  const { consumersOf, hasConsumer: hasImport } = SCAN.mergeConsumers(graph, scanned);
  const hasConsumer = (m: string) => hasImport(m) || (() => { try { return fs.existsSync(path.join(ROOT, "runtime", "bin", m + ".ts")); } catch { return false; } })();
  const asOf = new Date().toISOString().slice(0, 10);
  const coverage = COV.buildCoverage({ modules: graph.modules, consumersOf, asOf });
  const compass = COMPASS.buildCompass({ asOf, hasConsumer });
  return CYCLE.runCycle({ coverage, compass, signals: [], lessons: [], missionTopic: { domain: "engineering" }, now: asOf });
}

// ---- trigger ----
const forced = process.env.ODG_NIGHT_FORCE_EPOCH || process.argv[2];
const now = forced ? Number(forced) : Date.now();
const forcedLabel = forced ? "FORCED_CONTROLLED_TRIGGER (demonstration — not a persistent timer)" : "NATURAL (real wall clock)";

let state: any = {};
try { if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch { state = {}; }

const report = SCHED.run(state, { now, cycleFn: () => buildCycleResult() });

// persist the new trigger state (gitignored dev file) only when a run occurred.
if (report.ran && report.state) { try { fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true }); fs.writeFileSync(STATE_PATH, JSON.stringify(report.state, null, 2)); } catch { /* best-effort dev persistence */ } }

const rt = SCHED.realTriggerStatus();
process.stdout.write(JSON.stringify({
  nightCycle: "V360 §6/§7 — two night-only self-improvement cycles/week (PROPOSED-only)",
  triggerSource: forcedLabel,
  nowParis: SCHED.isNight(now) ? "night" : "day",
  lifecycle: report.lifecycle,
  slot: report.slot ? report.slot.id : null,
  reason: report.reason || null,
  cycleOutcome: report.cycleOutcome || null,
  governed: { integrate: report.integrate || "OWNER_GATED", measure: report.measure || "NOT_MEASURED", selfAuthorized: report.selfAuthorized === true },
  realTrigger: rt,
}, null, 2) + "\n");
process.stdout.write(`\nNIGHT-CYCLE: lifecycle=${report.lifecycle} (${forcedLabel}). ` +
  (report.lifecycle === "EXECUTED" ? `A real self-improvement cycle RAN via the scheduler (outcome=${report.cycleOutcome}); state persisted to the gitignored dev file. ` :
   report.lifecycle === "SKIPPED" ? `No trigger: ${report.reason}. ` : `${report.lifecycle}: ${report.reason || report.error || ""}. `) +
  `CONFIGURED+TRIGGERED+EXECUTED are demonstrated; OPERATIONAL (persistent unattended auto-trigger) needs an OWNER-GATED systemd/cron install on the VPS (§12) — realTrigger=NOT_MEASURED until a real scheduled execution is observed.\n`);
process.exit(0);
export {};
