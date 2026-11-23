#!/usr/bin/env node
"use strict";
/*
 * V15.7 — adaptive concurrency decision on the REAL host (READ-ONLY). Reads /proc/loadavg, /proc/meminfo, the CPU count
 * and the agent-supervisor snapshot (live, collected read-only exactly like odg-agent-supervisor-run, or --snapshot FILE),
 * plus optional coordination signals (--signals FILE: {currentBuilderLimit, refusal, ciQueue, inspectionQueue,
 * changeReady, gitIntegrationActive, throughput, roleOf}), and prints runtime/core/odg-concurrency-policy.decide().
 * Writes nothing, launches nothing, calls no network. An unreadable source is passed as NOT_MEASURED (fail closed).
 *
 * Usage: tsx runtime/bin/odg-concurrency-policy-run.ts [--snapshot FILE] [--signals FILE] [--config FILE] [--repo DIR]
 *          [--loadavg-file F] [--meminfo-file F]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const P = require("../core/odg-concurrency-policy.js");

function arg(name: string, def: any = null): any { const i = process.argv.indexOf(name); return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def; }
function readOrNull(f: string): string | null { try { return fs.readFileSync(f, "utf8"); } catch { return null; } }
function jsonOrNull(f: string | null): any { if (!f) return null; const t = readOrNull(f); if (t === null) return undefined; try { return JSON.parse(t); } catch { return undefined; } }

function liveSnapshot(repoArg: string): any {
  try {
    const S = require("../core/odg-agent-supervisor.js");
    const r = cp.spawnSync("git", ["-C", repoArg, "worktree", "list", "--porcelain"], { encoding: "utf8" });
    const first = r.status === 0 ? S.parseWorktreePorcelain(r.stdout)[0] : null;
    const repo = first ? first.path : path.resolve(repoArg);
    const uid = typeof process.getuid === "function" ? process.getuid() : 0;
    const ev = S.collectEvidence({
      repo, prs: null, tasksRoot: path.join("/tmp", "claude-" + uid, repo.replace(/[\/.]/g, "-")),
      heartbeatDir: path.join(repo, "runtime", "generated", "agent-supervisor", "heartbeats"),
      locksDir: path.join(repo, "runtime", "generated", "fleet", "locks"), taskWindowMs: S.DEFAULTS.taskWindowMs,
    });
    return S.snapshot(ev);
  } catch (e: any) { return { error: String(e && e.message || e) }; }
}

function main(): number {
  const notes: string[] = [];
  const loadavg = P.parseLoadavg(readOrNull(arg("--loadavg-file", "/proc/loadavg")));
  const meminfo = P.parseMeminfo(readOrNull(arg("--meminfo-file", "/proc/meminfo")));
  let cpuCount: any = null; try { cpuCount = os.cpus().length || null; } catch { cpuCount = null; }
  let snapshot: any; let snapshotSource: string;
  const snapFile = arg("--snapshot");
  if (snapFile) { snapshot = jsonOrNull(snapFile); snapshotSource = "file"; if (!snapshot) notes.push("--snapshot unreadable/invalid ⇒ NOT_MEASURED"); }
  else { snapshot = liveSnapshot(arg("--repo", process.cwd())); snapshotSource = "live (read-only collectEvidence + snapshot)"; if (snapshot && snapshot.error) { notes.push("live snapshot failed: " + snapshot.error); snapshot = null; } }
  const signals = jsonOrNull(arg("--signals"));
  if (signals === undefined) notes.push("--signals unreadable/invalid ⇒ those signals NOT_MEASURED");
  const config = jsonOrNull(arg("--config"));
  if (config === undefined) notes.push("--config unreadable/invalid ⇒ defaults");
  const sig = signals || {};
  const writesetConflicts = snapshot && snapshot.contention && Array.isArray(snapshot.contention.contentions) ? snapshot.contention.contentions.length : undefined;
  const decision = P.decide({ ...sig, cpuCount, loadavg, meminfo, snapshot: snapshot || null, writesetConflicts }, config || undefined);
  const agentsByState = snapshot && snapshot.metrics ? snapshot.metrics.byState : P.NOT_MEASURED;
  process.stdout.write(JSON.stringify({ measuredAt: new Date().toISOString(), label: "REAL host signals (read-only)", snapshotSource, agentsByState, notes, decision }, null, 2) + "\n");
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { main };
export {};
