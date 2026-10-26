#!/usr/bin/env node
"use strict";
/*
 * V31 — Pre-Authored Reuse Candidates (pure, read-only, fail-closed) — TypeScript canonical. Faithful,
 * strict-typed port of the historical runtime/core/provider-reuse-candidate.js (behaviour identical: same
 * signature parsing, same current-reality revalidation, same fail-closed [] fallback, same deterministic
 * order, same CommonJS module.exports). Verified under tsconfig.runtime-leaves-strict.json (strict, no
 * ts-nocheck). No runtime consumer imports it (migration-campaign only lists its NAME in exclusions), so the
 * CommonJS module.exports form is kept; the legacy .js stays the production port. Dual-port parity proven by
 * provider-reuse-candidate-dualport-parity.test.ts.
 *
 * Assembles VERIFIED prior-experience precedents from the EXISTING patch-memory store, revalidated against
 * current reality (objective-identity match AND target still on disk AND within the current authorizedPaths).
 * ADVISORY INPUT only — never authority, proof, execution or acceptance. Carries ZERO edit bodies. Pure.
 */

const fs = require("fs");
const path = require("path");
const patchMemory: any = require("./patch-memory");

interface ParsedSignature { rootCause: string; objectiveId: string; target: string; }
interface Candidate {
  objectiveId: string;
  signature: string;
  targets: string[];
  historicalMission: string | null;
  reuseCount: number;
  status: string;
}

// Parse the canonical patch-memory signature "rootCause|objectiveId|target" (V26/V28 semantics).
function parseSignature(sig: unknown): ParsedSignature {
  const parts = String(sig || "").split("|");
  return { rootCause: parts[0] || "", objectiveId: parts[1] || "", target: parts.slice(2).join("|") || "" };
}

// Mirror the Patch Executor's authorizedPaths prefix normalisation (single semantics, not a new rule).
function normalizePrefixes(authorizedPaths: unknown): string[] {
  return (Array.isArray(authorizedPaths) ? authorizedPaths : [])
    .map((p: unknown) => (typeof p === "string" ? p : "").replace(/[*].*$/, "").replace(/\/+$/, ""))
    .filter(Boolean);
}

function withinAuthorized(target: string, prefixes: string[]): boolean {
  const norm = path.normalize(target);
  if (path.isAbsolute(norm) || norm === ".." || norm.startsWith(".." + path.sep)) return false;
  return prefixes.some((pre) => norm === pre || norm.startsWith(pre + "/"));
}

/*
 * objectives: Array<{ id: string }> — the CURRENT mission's objectives.
 * opts: { cwd: string, authorizedPaths: string[] } — current repo root + current write scope.
 * Returns Candidate[] (possibly empty). NEVER throws.
 */
function buildCandidates(objectives: unknown, opts?: { cwd?: string; authorizedPaths?: unknown }): Candidate[] {
  try {
    const o = opts || {};
    const cwd = o.cwd || process.cwd();
    const idMap = new Map<string, string>();
    for (const obj of (Array.isArray(objectives) ? objectives : [])) {
      if (obj && typeof obj.id === "string" && obj.id) idMap.set(obj.id.toLowerCase(), obj.id);
    }
    if (idMap.size === 0) return [];
    const prefixes = normalizePrefixes(o.authorizedPaths);
    if (prefixes.length === 0) return [];

    const out: Candidate[] = [];
    for (const entry of patchMemory.list()) {
      if (!entry || typeof entry.signature !== "string") continue;
      const { objectiveId } = parseSignature(entry.signature);
      if (!idMap.has(objectiveId)) continue;
      const edits = Array.isArray(entry.edits) ? entry.edits : [];
      const targets = [...new Set(edits.map((e: any) => e && e.target).filter((t: unknown) => typeof t === "string" && t))] as string[];
      if (targets.length === 0) continue;
      const valid = targets.filter((t: string) => {
        let exists = false;
        try { exists = fs.existsSync(path.join(cwd, t)); } catch { exists = false; }
        return exists && withinAuthorized(t, prefixes);
      });
      if (valid.length === 0) continue;
      out.push({
        objectiveId: idMap.get(objectiveId) as string,
        signature: entry.signature,
        targets: valid.sort(),
        historicalMission: typeof entry.mission === "string" ? entry.mission : null,
        reuseCount: typeof entry.reuseCount === "number" ? entry.reuseCount : 0,
        status: "VERIFIED_PRECEDENT",
      });
    }
    out.sort((a, b) => (a.objectiveId + " " + a.signature).localeCompare(b.objectiveId + " " + b.signature));
    return out;
  } catch {
    return [];
  }
}

module.exports = { buildCandidates, parseSignature };

export {};
