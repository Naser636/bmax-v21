#!/usr/bin/env node
"use strict";
/*
 * V326 §7 — REUSE-FRESHNESS CHECK (runner). Resolves the "changedPaths never sourced" root cause by running a READ-ONLY
 * git query per real precedent and feeding the EXISTING pre-reuse validity gate through odg-git-change-signal.
 *
 * For each precedent in patch-memory.list() (the REAL stored precedents): derive the files changed since it was learned
 * via `git log --since=<learnedAt> --name-only` (READ-ONLY — no checkout/reset/write), then classify it
 * REUSABLE_AS_PROVEN / REQUIRES_REVALIDATION / STALE via the production gate. Writes docs/odg/reuse-freshness.json.
 *
 * SAFETY/HONESTY: git is invoked read-only via execFileSync with an argument array (no shell, no injection); a git failure
 * ⇒ gitText=null ⇒ the gate fails closed (REQUIRES_REVALIDATION), never an optimistic reuse. Nothing is written except the
 * evidence artifact. No network/model/VPS. Run: `npx tsx runtime/bin/odg-reuse-freshness-check.ts [outPath]`.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const PM = require(path.join(ROOT, "runtime", "core", "patch-memory.js"));
const G = require(path.join(ROOT, "runtime", "core", "odg-git-change-signal.js"));
const GATE = require(path.join(ROOT, "runtime", "core", "odg-reuse-validity-gate.js"));

const OUT = process.argv[2] || path.join(ROOT, "docs", "odg", "reuse-freshness.json");
const asOfMs = Date.now();

// READ-ONLY git: files changed in commits since <sinceIso>. Returns raw stdout, or null on any failure (⇒ fail-closed).
// Hardening (inspector nit): CANONICALIZE the date first. git's approxidate maps an UNPARSEABLE --since to "now" (0
// commits, exit 0) — which would masquerade as a falsely-CLEAN drift check. So we parse learnedAt ourselves: unparseable
// ⇒ null (fail-closed, never degrade to clean); parseable ⇒ feed git canonical ISO-8601 UTC, which git parses unambiguously.
function changedSince(sinceIso: string): string | null {
  if (typeof sinceIso !== "string" || sinceIso.length === 0) return null;
  const ms = Date.parse(sinceIso);
  if (!Number.isFinite(ms)) return null;
  const canonical = new Date(ms).toISOString();
  try {
    return execFileSync("git", ["-C", ROOT, "log", "--since", canonical, "--name-only", "--format="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
}

let precedents: any[] = [];
try { precedents = PM.list(); } catch { precedents = []; }

const rows = precedents.map((p: any, i: number) => {
  const learnedAt = typeof p.learnedAt === "string" ? p.learnedAt : null;
  const gitText = learnedAt ? changedSince(learnedAt) : null;
  const r = G.assessPrecedentFreshness(p, gitText, { asOfMs });
  return {
    index: i,
    signature: typeof p.signature === "string" ? p.signature.slice(0, 48) : null,
    learnedAt,
    authoredBy: p.authoredBy === undefined ? "(absent)" : p.authoredBy,
    targetPaths: GATE.targetPathsOf(p), // what was drift-checked — surfaces e.g. fixture/toy precedents (paths absent from the repo)
    targetPathsExist: GATE.targetPathsOf(p).filter((t: string) => { try { return fs.existsSync(path.join(ROOT, t)); } catch { return false; } }).length,
    verdict: r.verdict,
    ageDays: r.ageDays,
    driftSignalAvailable: r.driftSignalAvailable,
    changedPathsConsidered: r.changedPathsConsidered,
    changedTargets: r.changedTargets,
    topReason: Array.isArray(r.reasons) && r.reasons.length ? r.reasons[0] : null,
  };
});

const byVerdict: Record<string, number> = { REUSABLE_AS_PROVEN: 0, REQUIRES_REVALIDATION: 0, STALE: 0 };
for (const r of rows) byVerdict[r.verdict] = (byVerdict[r.verdict] || 0) + 1;

const out = {
  "//": "V326 §7 — REAL pre-reuse freshness over the stored patch-memory precedents. changedPaths sourced from READ-ONLY `git log --since=<learnedAt> --name-only`; verdict from the PRODUCTION odg-reuse-validity-gate via odg-git-change-signal. The gate is fail-closed: unknown provenance / unresolved drift / git failure ⇒ REQUIRES_REVALIDATION (never optimistic reuse).",
  asOfMs,
  precedentsConsidered: rows.length,
  byVerdict,
  rows,
  honesty: "REMEMBERED ≠ CURRENTLY VALIDATED. REUSABLE_AS_PROVEN requires recent age + known provenance + a clean git drift check + no suppression; the current stored precedents are mostly unprovenanced or drifted ⇒ REQUIRES_REVALIDATION (honest). The git drift signal is now REAL (read-only), resolving §7's 'drift never checked'. CAVEAT: a REUSABLE_AS_PROVEN verdict is trivially drift-clean when the precedent's targetPaths do not exist in the repo (targetPathsExist:0 ⇒ a fixture/toy precedent, not a substantive reusable fix) — check targetPathsExist per row. No persistent memory mutated; no reuse auto-authorized (replay stays gated).",
};
try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); } catch { /* exists */ }
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ precedentsConsidered: rows.length, byVerdict, driftSignalAvailable: rows.every((r: any) => r.driftSignalAvailable), artifact: path.relative(ROOT, OUT) }, null, 2) + "\n");
export {};
