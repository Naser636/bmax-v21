#!/usr/bin/env node
/**
 * odg-resume — a COMPACT, read-only resume reader for a fresh session (context-growth mitigation). Instead of a new
 * session re-reading the 8500-line ODG_PROJECT_STATE.md compass, this prints the minimal resumable handoff: verified
 * HEAD, closure-register counts, the next admissible lot (or why idle), the BLOCKED items with their precise human
 * action, the single most-recent checkpoint title, and the exact resume command. It reads the big files in its OWN
 * process and emits only a short summary — so the session's context stays small. Pure read-only; no mutation, no git
 * write, no privilege. This is the tested passation mechanism: a compaction is NOT proof of continuity; this is.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");
const C = require("./../core/campaign-controller.js");

function gitHead(repo: string): string {
  try { const r = cp.spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }); return (r.stdout || "").trim() || "unknown"; } catch { return "unknown"; }
}

/** lastCheckpointTitle(compassPath): the title line of the most-recent `## CHECKPOINT` block (compact; not the whole file). */
function lastCheckpointTitle(compassPath: string): string | null {
  try {
    const lines = fs.readFileSync(compassPath, "utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) if (lines[i].startsWith("## CHECKPOINT")) return lines[i].replace(/^##\s*/, "").trim();
    return null;
  } catch { return null; }
}

/** resumeState({ repo?, registerPath?, compassPath? }): the compact handoff object. */
function resumeState(opts: any = {}): any {
  const repo = typeof opts.repo === "string" ? opts.repo : process.cwd();
  const registerPath = typeof opts.registerPath === "string" ? opts.registerPath : path.join(repo, "docs", "odg", "closure-register.json");
  const compassPath = typeof opts.compassPath === "string" ? opts.compassPath : path.join(repo, "ODG_PROJECT_STATE.md");
  const L = C.loadRegister(registerPath);
  if (!L.ok) return { ok: false, reason: L.reason || "register not loadable", head: gitHead(repo) };
  const s = C.summary(L.register);
  const blocked = (L.register.items || []).filter((it: any) => it.status === "BLOCKED").map((it: any) => ({ id: it.id, humanActionRequired: it.humanActionRequired || null, nextAction: it.nextAction || null, resumeTest: it.resumeTest || null }));
  const inProgress = (L.register.items || []).filter((it: any) => it.status === "IN_PROGRESS").map((it: any) => it.id);
  const stale = C.staleAcceptances(L.register);
  return {
    ok: true,
    head: gitHead(repo),
    counts: s.counts,
    idle: s.idle,
    nextLot: s.nextLot,
    idleReason: s.idleReason || null,
    inProgress,
    blockedCount: blocked.length,
    blocked,
    staleAcceptances: stale.length,
    lastCheckpoint: lastCheckpointTitle(compassPath),
    resumeCommand: "git checkout main && git pull --ff-only && npx tsx runtime/bin/odg-campaign-run.ts docs/odg/closure-register.json",
    note: "Compact handoff from the canonical register (not the full compass). All open work is gated on the listed human actions; a new session resumes here without re-reading history.",
  };
}

export { resumeState, lastCheckpointTitle };
module.exports = { resumeState, lastCheckpointTitle };

if (require.main === module) {
  process.stdout.write(JSON.stringify(resumeState({ registerPath: process.argv[2] }), null, 2) + "\n");
}
