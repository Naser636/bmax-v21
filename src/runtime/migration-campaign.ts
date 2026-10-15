#!/usr/bin/env node
/*
 * Migration Campaign Planner (`odg migrate-plan`) — EXTENDS the existing `odg migrate-ts` campaign.
 * ================================================================================================
 * GOVERNANCE (V20 Gate B = EXTEND, not create a second engine): this module adds ONLY the thin
 * campaign-planning layer that `odg migrate-ts` deliberately does NOT own — deterministic INVENTORY,
 * next-lot SELECT, and a durable multi-lot CHECKPOINT in a DEDICATED namespace. It REUSES:
 *   - the gate engine:        `odg migrate-ts <lot>` executes/verifies/accepts the recommended lot,
 *   - the per-lot authority:  a recommendation is NOT authorisation — the lot still has to be added to
 *                             migrate-ts-cli.ts LOT_WRITE_SET before migrate-ts will run it (gate kept),
 *   - the checkpoint pattern: a separate file (runtime/generated/migration-campaign-checkpoint.json) so
 *                             it NEVER clobbers the single shared mission pipeline-checkpoint.json (the
 *                             exact limitation migrate-ts-cli.ts documented as "a future CTO decision").
 *
 * READ-ONLY by default (a controlled, non-destructive scenario — §9): it scans the repo and RECOMMENDS;
 * it never writes source, never runs a migration, never commits. `--record` persists the campaign
 * checkpoint (into the gitignored generated/ dir only). It is NOT a 10th primitive — it is a planning
 * capability layered on the EXECUTOR / RECOVERY primitives.
 *
 * States surfaced (never a false success): PASS (a safe lot is recommended or the campaign is complete),
 * BLOCKED (candidates exist but every one is hazard-blocked), SKIPPED (excluded by frozen policy),
 * NOT-EXECUTED / error (no git repo or missing core dir → exit 2). A recommendation is a plan, not proof
 * of a migration: only `odg migrate-ts <lot>` returning 0 proves a lot.
 */

"use strict";

import fs from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";

// REUSE the read-only Change-Impact Graph (§U Phase-1 #1) to detect TRANSITIVE build-dist-closure
// hazards (a dep's dynamic/external/path hazard anywhere in the closure). This STRENGTHENS the inline
// direct-source rules below — it never replaces or weakens them. Required (not imported) to stay
// CommonJS-interop-safe, same pattern as the runtime/core modules.
const { impactOf } = require("../../runtime/core/change-impact-graph");

// Node builtins that a compiled dist module may require (build-dist-closure allows these + relative
// requires). An external (non-builtin, non-relative) package require is rejected by its static tracer.
const NODE_BUILTINS: ReadonlySet<string> = new Set(builtinModules);
function isBuiltinRequire(spec: string): boolean {
  return NODE_BUILTINS.has(spec) || NODE_BUILTINS.has(spec.replace(/^node:/, ""));
}

/** Frozen exclusion policy (V20 §12). A lot whose base name is here is never recommended. */
export const EXCLUSIONS: readonly string[] = Object.freeze([
  "finance-data-connector",
  "provider-live-call-gate",
  "provider-reuse-candidate",
  "budget-ledger",
  "cost-accounting",
  "ollama-control-plane",
  "expert-profile-assembler",
]);

export const CHECKPOINT_REL = path.join("runtime", "generated", "migration-campaign-checkpoint.json");
export const CHECKPOINT_SCHEMA = "migration-campaign/1";

export interface CandidateInfo {
  lot: string;
  lines: number;
  deps: number;
  hazard: boolean; // compilation-location hazard: __dirname/REPO_ROOT used in a path resolve
  sideEffect: boolean; // top-level (import-time) fs/exec side effect — informational, ranks lower
  reason: string; // why it is admissible / blocked
}

export interface Inventory {
  root: string;
  ported: string[]; // base names with BOTH .js and .ts (accepted dual ports)
  excluded: string[]; // JS-only base names frozen out by policy
  candidates: CandidateInfo[]; // JS-only, not excluded, ranked safest-first
  counts: { coreJs: number; coreDual: number; candidates: number; excluded: number; blocked: number };
}

export interface Selection {
  state: "PASS" | "BLOCKED" | "SKIPPED" | "NONE";
  lot: string | null;
  rationale: string;
  alternatives: Array<{ lot: string; note: string }>;
}

export interface Checkpoint {
  schema: string;
  updatedAt: string;
  head: string | null;
  acceptedLots: string[];
  candidateCount: number;
  lastRecommended: string | null;
}

export interface CampaignSeams {
  root?: string;
  now?: () => string; // injectable timestamp (deterministic in tests)
  head?: string | null;
  record?: boolean; // persist the checkpoint (default false = read-only)
  json?: boolean;
  log?: (msg: string) => void;
}

function isJsSource(file: string): boolean {
  return file.endsWith(".js") && !file.endsWith(".test.js") && !file.endsWith(".config.js");
}

/** Build the real inventory of runtime/core: dual (ported) vs JS-only, candidates ranked safest-first. */
export function inventory(root: string = process.cwd()): Inventory {
  const coreDir = path.join(root, "runtime", "core");
  if (!fs.existsSync(coreDir)) throw new Error(`core dir not found: ${coreDir}`);
  const files = fs.readdirSync(coreDir).sort();
  const bases = new Set<string>();
  for (const f of files) if (isJsSource(f)) bases.add(f.slice(0, -3));

  const ported: string[] = [];
  const excluded: string[] = [];
  const candidates: CandidateInfo[] = [];

  for (const base of [...bases].sort()) {
    if (fs.existsSync(path.join(coreDir, base + ".ts"))) {
      ported.push(base);
      continue;
    }
    if (EXCLUSIONS.includes(base)) {
      excluded.push(base);
      continue;
    }
    const src = fs.readFileSync(path.join(coreDir, base + ".js"), "utf8");
    const lines = src.split("\n").length;
    const deps = (src.match(/require\((["'])\.\/[^)]+\1\)/g) || []).length;
    // Hazard 1 — compilation-location: __dirname/REPO_ROOT in a path resolve breaks when compiled to dist/core.
    const pathHazard = /\b(__dirname|REPO_ROOT)\b/.test(src) && /\bpath\.(resolve|join)\b/.test(src);
    // Hazard 2 — dynamic require: a require() whose argument is not a string literal (e.g. require(abs)).
    // build-dist-closure's static tracer rejects it ("unexpected dynamic require()"), so the lot cannot
    // pass build:runtime via the 4-file recipe (needs a governed loader-seam redesign, not a port).
    const dynamicRequire = /\brequire\s*\(\s*[^'"\s)]/.test(src);
    // Hazard 3 — external package require: a require("bare") that is neither relative nor a Node builtin
    // (e.g. require("imapflow")). build-dist-closure rejects it ("unexpected external package require"),
    // because externals are not co-located in dist/core — so the lot cannot pass build:runtime.
    const externalRequire = [...src.matchAll(/\brequire\(\s*(["'])([^"']+)\1\s*\)/g)]
      .map((m) => m[2])
      .some((spec) => !spec.startsWith(".") && !isBuiltinRequire(spec));
    // Direct-source hazard (the three inline rules, UNCHANGED — fast, authoritative, carry the reasons).
    const ownHazard = pathHazard || dynamicRequire || externalRequire;
    // Hazard 4 (ADDITIVE, transitive) — the SAME three closure-rejection classes anywhere in this module's
    // transitive dependency closure, computed by the reused Change-Impact Graph. build-dist-closure co-locates
    // the WHOLE closure into dist and scans it, so a clean module with a hazardous transitive dep (e.g. the
    // V30 local-autonomy → capability-factory dynamic-require case) would otherwise be mis-recommended as safe.
    // This STRENGTHENS the gate; it never clears a module the direct rules blocked.
    const ch = impactOf(root, base).closureHazards;
    const transitiveHazard = !ownHazard && (ch.dynamicRequire || ch.externalRequire || ch.pathHazard);
    const hazard = ownHazard || transitiveHazard;
    const sideEffect = /^(fs\.)?(writeFileSync|mkdirSync|appendFileSync|execSync|spawnSync)\s*\(/m.test(src);
    candidates.push({
      lot: base,
      lines,
      deps,
      hazard,
      sideEffect,
      reason: pathHazard
        ? "BLOCKED: __dirname/REPO_ROOT path resolution breaks when compiled to dist/core (needs cwd-relative redesign)"
        : dynamicRequire
          ? "BLOCKED: dynamic require() is rejected by build-dist-closure's static tracer (needs a governed loader-seam redesign)"
          : externalRequire
            ? "BLOCKED: external package require() is rejected by build-dist-closure (externals are not co-located in dist/core)"
            : transitiveHazard
              ? `BLOCKED: transitive closure hazard in [${ch.modules.join(", ")}] (${[ch.dynamicRequire && "dynamic-require", ch.externalRequire && "external-require", ch.pathHazard && "path"].filter(Boolean).join("+")}) — build-dist-closure co-locates + rejects the closure`
              : "admissible",
    });
  }

  // Rank: safe before hazard-blocked, then fewer deps, fewer lines, no import-time side effect, name.
  candidates.sort(
    (a, b) =>
      Number(a.hazard) - Number(b.hazard) ||
      a.deps - b.deps ||
      Number(a.sideEffect) - Number(b.sideEffect) ||
      a.lines - b.lines ||
      (a.lot < b.lot ? -1 : a.lot > b.lot ? 1 : 0),
  );

  const blocked = candidates.filter((c) => c.hazard).length;
  return {
    root,
    ported: ported.sort(),
    excluded: excluded.sort(),
    candidates,
    counts: {
      coreJs: bases.size,
      coreDual: ported.length,
      candidates: candidates.length,
      excluded: excluded.length,
      blocked,
    },
  };
}

/** Choose the next admissible lot deterministically. Recommendation only — authorisation gate preserved. */
export function selectNextLot(inv: Inventory): Selection {
  const safe = inv.candidates.filter((c) => !c.hazard);
  const blocked = inv.candidates.filter((c) => c.hazard);
  const alternatives = [
    ...safe.slice(1, 4).map((c) => ({ lot: c.lot, note: `${c.lines}L deps=${c.deps}` })),
    ...blocked.slice(0, 2).map((c) => ({ lot: c.lot, note: "HAZARD — " + c.reason })),
  ];

  if (safe.length > 0) {
    const pick = safe[0];
    return {
      state: "PASS",
      lot: pick.lot,
      rationale:
        `next safe lot: ${pick.lot} (${pick.lines}L, deps=${pick.deps}` +
        (pick.sideEffect ? ", import-time side effect — bench in a temp cwd" : "") +
        `). RECOMMENDATION ONLY — authorise by adding it to LOT_WRITE_SET in src/runtime/migrate-ts-cli.ts, ` +
        `then run \`odg migrate-ts ${pick.lot}\` (that gate proves it).`,
      alternatives,
    };
  }
  if (blocked.length > 0) {
    return {
      state: "BLOCKED",
      lot: null,
      rationale: `no safe candidate: ${blocked.length} remaining lot(s) are all hazard-blocked (e.g. ${blocked[0].lot}: ${blocked[0].reason}). Needs a governed redesign decision.`,
      alternatives,
    };
  }
  if (inv.counts.excluded > 0) {
    return {
      state: "SKIPPED",
      lot: null,
      rationale: `no candidates: ${inv.counts.excluded} JS-only module(s) remain but all are policy-excluded (§12).`,
      alternatives,
    };
  }
  return { state: "NONE", lot: null, rationale: "campaign complete: no JS-only core modules remain to port.", alternatives };
}

export function readCheckpoint(root: string = process.cwd()): Checkpoint | null {
  const file = path.join(root, CHECKPOINT_REL);
  if (!fs.existsSync(file)) return null;
  try {
    const cp = JSON.parse(fs.readFileSync(file, "utf8"));
    return cp && cp.schema === CHECKPOINT_SCHEMA ? (cp as Checkpoint) : null;
  } catch {
    return null;
  }
}

export function writeCheckpoint(root: string, cp: Checkpoint): Checkpoint {
  const file = path.join(root, CHECKPOINT_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cp, null, 2) + "\n");
  return cp;
}

/** Newly-accepted lots since a prior checkpoint — demonstrates continuity without re-publishing. */
export function progressedSince(prev: Checkpoint | null, inv: Inventory): string[] {
  const before = new Set(prev?.acceptedLots || []);
  return inv.ported.filter((p) => !before.has(p));
}

export interface PlanResult {
  inventory: Inventory;
  selection: Selection;
  prevCheckpoint: Checkpoint | null;
  checkpoint: Checkpoint | null;
  progressed: string[];
  exitCode: number;
}

/** Full read-only plan (inventory → select → optional durable checkpoint). Never writes source. */
export function runPlan(seams: CampaignSeams = {}): PlanResult {
  const root = seams.root ?? process.cwd();
  const now = seams.now ?? (() => new Date().toISOString());
  const log = seams.log ?? ((m: string) => console.log(m));

  const inv = inventory(root);
  const selection = selectNextLot(inv);
  const prev = readCheckpoint(root);
  const progressed = progressedSince(prev, inv);

  let checkpoint: Checkpoint | null = null;
  if (seams.record) {
    checkpoint = writeCheckpoint(root, {
      schema: CHECKPOINT_SCHEMA,
      updatedAt: now(),
      head: seams.head ?? null,
      acceptedLots: inv.ported,
      candidateCount: inv.counts.candidates,
      lastRecommended: selection.lot,
    });
  }

  if (seams.json) {
    log(JSON.stringify({ selection, counts: inv.counts, progressed, recorded: !!checkpoint }, null, 2));
  } else {
    log("ODG migration campaign plan (read-only — EXTENDS odg migrate-ts; no source/commit touched)");
    log(
      `  inventory: core .js=${inv.counts.coreJs}  dual(ported)=${inv.counts.coreDual}  ` +
        `candidates=${inv.counts.candidates}  excluded=${inv.counts.excluded}  hazard-blocked=${inv.counts.blocked}`,
    );
    if (prev) log(`  resume: prior checkpoint @ ${prev.updatedAt} (accepted=${prev.acceptedLots.length}); newly accepted since=${progressed.length ? progressed.join(", ") : "none"}`);
    log(`  SELECT [${selection.state}]: ${selection.rationale}`);
    for (const a of selection.alternatives) log(`    alt: ${a.lot} — ${a.note}`);
    if (checkpoint) log(`  recorded campaign checkpoint → ${CHECKPOINT_REL}`);
    else log(`  (pass --record to persist a resumable campaign checkpoint)`);
  }

  // The PLAN succeeding is exit 0 regardless of whether a safe lot exists (BLOCKED/NONE are valid plans).
  // Only an operational failure (thrown above) is non-zero; it is caught in main().
  return { inventory: inv, selection, prevCheckpoint: prev, checkpoint, progressed, exitCode: 0 };
}

function main(argv: string[]): number {
  const record = argv.includes("--record");
  const json = argv.includes("--json");
  const headIdx = argv.indexOf("--head");
  const head = headIdx >= 0 ? argv[headIdx + 1] ?? null : null;
  try {
    return runPlan({ record, json, head }).exitCode;
  } catch (e) {
    console.error("NOT-EXECUTED: migration-campaign plan failed —", (e as Error).message);
    return 2;
  }
}

// tsx entrypoint guard (same pattern as converge-cli.ts): only run when invoked directly.
if (Array.isArray(process.argv) && /migration-campaign\.ts$/.test(process.argv[1] ?? "")) {
  process.exit(main(process.argv.slice(2)));
}

// Module-scope marker: forces MODULE scope (no accidental global-script helper collisions).
export {};
