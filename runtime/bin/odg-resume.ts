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

// Compact-handoff byte budget. The handoff must stay small so a fresh session's context does not balloon; the
// closure-register remains the FULL session-independent SSOT (a truncated field always points back to it).
// The budget is measured on the COMPACT JSON serialization (the data payload) — matching the pre-existing <6KB
// test. The CLI below pretty-prints (JSON.stringify(...,null,2)), so its human-visible stdout is modestly larger
// (deterministic whitespace only, trivially strippable) and still dwarfed by the ~8500-line compass this replaces.
// Tier-3's id-list keeps every blocker's id in ~18 B/entry, so the budget holds for any credible BLOCKED population.
const MAX_HANDOFF_BYTES = 6000;
// Descending per-field char budgets tried in order; the LARGEST that keeps the whole handoff under MAX_HANDOFF_BYTES
// is chosen (deterministic). Never below the floor so a truncated action/test field stays actionable (and >10 chars).
const FIELD_BUDGET_STEPS = Object.freeze([4000, 2000, 1200, 800, 500, 350, 250, 180, 120, 80, 50, 30]);

/** compactField(text, budget): deterministic, EXPLICIT truncation — keeps `budget` chars + a detectable marker that
 *  states the dropped size and points back to the register (the full SSOT). null/non-string pass through unchanged. */
function compactField(text: any, budget: number): any {
  if (typeof text !== "string" || text.length <= budget) return text;
  return text.slice(0, budget) + ` …[+${text.length - budget}c →register]`;
}

/** buildBlocked(blockedRaw, fieldBudget): per-blocker view with the free-text fields budgeted. Mandatory identity
 *  (id) is ALWAYS preserved in full (never truncated), so no blocker can be silently lost. */
function buildBlocked(blockedRaw: any[], fieldBudget: number): any[] {
  return blockedRaw.map((b: any) => ({
    id: b.id, // mandatory identity — NEVER truncated
    humanActionRequired: compactField(b.humanActionRequired, fieldBudget),
    nextAction: compactField(b.nextAction, fieldBudget),
    resumeTest: compactField(b.resumeTest, fieldBudget),
  }));
}

/** resumeState({ repo?, registerPath?, compassPath? }): the compact handoff object. */
function resumeState(opts: any = {}): any {
  const repo = typeof opts.repo === "string" ? opts.repo : process.cwd();
  const registerPath = typeof opts.registerPath === "string" ? opts.registerPath : path.join(repo, "docs", "odg", "closure-register.json");
  const compassPath = typeof opts.compassPath === "string" ? opts.compassPath : path.join(repo, "ODG_PROJECT_STATE.md");
  const L = C.loadRegister(registerPath);
  if (!L.ok) return { ok: false, reason: L.reason || "register not loadable", head: gitHead(repo) };
  const s = C.summary(L.register);
  const blockedRaw = (L.register.items || []).filter((it: any) => it.status === "BLOCKED").map((it: any) => ({ id: it.id, humanActionRequired: it.humanActionRequired || null, nextAction: it.nextAction || null, resumeTest: it.resumeTest || null }));
  const inProgress = (L.register.items || []).filter((it: any) => it.status === "IN_PROGRESS").map((it: any) => it.id);
  const stale = C.staleAcceptances(L.register);
  const base: any = {
    ok: true,
    head: gitHead(repo),
    counts: s.counts,
    idle: s.idle,
    nextLot: s.nextLot,
    idleReason: s.idleReason || null,
    inProgress,
    blockedCount: blockedRaw.length,
    staleAcceptances: stale.length,
    lastCheckpoint: lastCheckpointTitle(compassPath),
    resumeCommand: "git checkout main && git pull --ff-only && npx tsx runtime/bin/odg-campaign-run.ts docs/odg/closure-register.json",
    note: "Compact handoff from the canonical register (not the full compass). All open work is gated on the listed human actions; a new session resumes here without re-reading history.",
  };
  // PER-BLOCKER FIELD BUDGETING (odg-resume-handoff-budget-scaling): keep ALL blockers (never drop one — id is always
  // full) while holding the serialized handoff under MAX_HANDOFF_BYTES as the BLOCKED population grows. Try the full
  // text first; if it overflows, pick the LARGEST per-field char budget (descending, deterministic) that fits, mark
  // handoffTruncated so the compaction is detectable, and emit the budget used. The register stays the full SSOT; each
  // truncated field carries an explicit `…[+Nc →register]` marker. Mandatory identity (id) is never truncated.
  const full = { ...base, handoffTruncated: false, blocked: buildBlocked(blockedRaw, Infinity) };
  if (JSON.stringify(full).length < MAX_HANDOFF_BYTES) return full;
  for (const budget of FIELD_BUDGET_STEPS) {
    const cand = { ...base, handoffTruncated: true, fieldBudgetChars: budget, blocked: buildBlocked(blockedRaw, budget) };
    if (JSON.stringify(cand).length < MAX_HANDOFF_BYTES) return cand;
  }
  // Tier 3 — pathological population: so many blockers that even floored field-objects overflow (the per-blocker
  // JSON key-name overhead alone exceeds the budget). Switch to a COMPACT ID-LIST form: every blocker's id is kept
  // (NO silent loss), the free-text action/resumeTest fields are OMITTED from the compact handoff and the full detail
  // lives in the register (SSOT). Explicitly flagged so a reader knows to open the register for per-blocker actions.
  return {
    ...base,
    handoffTruncated: true,
    blockedFieldsOmitted: true,
    blocked: blockedRaw.map((b: any) => ({ id: b.id })), // ids preserved for every blocker; fields → register
    note: base.note + " NOTE: blocker count is high — per-blocker humanActionRequired/resumeTest omitted from this compact handoff; read docs/odg/closure-register.json for each BLOCKED item's full action + resume test.",
  };
}

export { resumeState, lastCheckpointTitle };
module.exports = { resumeState, lastCheckpointTitle };

if (require.main === module) {
  process.stdout.write(JSON.stringify(resumeState({ registerPath: process.argv[2] }), null, 2) + "\n");
}
