#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V69 §15 — P9 WORLD-INTELLIGENCE COVERAGE MATRIX. The MANDATORY first step: audit the existing P9 / radar /
 * primitive mechanisms and map V69's capability functions (§3–§13) to present modules — PRESENT / PARTIAL / MISSING —
 * so implementation reuses existing mechanisms and adds NO tenth primitive, no parallel engine. Each mapped module is
 * verified to exist (groundedness). Read-only audit. Run: `odg-p9-world-intelligence-matrix.ts`.
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
function modExists(m: string): boolean { return fs.existsSync(path.join(ROOT, "runtime", "core", m + ".ts")); }

const FUNCTIONS = [
  { fn: "§3 world-scanner (deep web exploration)", modules: ["frontier-radar", "frontier-collection", "frontier-pipeline", "source-registry"], status: "PARTIAL", gap: "bounded/allowlisted live collection exists; multi-strategy query decomposition + recursive deepening is partial (WebSearch is session-tool, not a confined module)" },
  { fn: "§4 source-intelligence (multi-dim, non-binary)", modules: ["source-registry", "research-ranking", "evidence-provenance"], status: "PARTIAL", gap: "scoreSource + composite ranking exist; the full V69 typology (verified/published/unverified/hypothesis/opinion/rumor/experiment/reproduced) + independence/contradiction/plausibility dimensions are NOT consolidated — BUILD (V69 Lot 2)" },
  { fn: "§5 freshness engine", modules: ["control-evidence-freshness", "dataset-freshness-volume", "metric-window-integrity"], status: "PRESENT", gap: "age/TTL/last-verified present; crawl-date≠publish-date + per-domain renewal cadence = minor refinement" },
  { fn: "§6 cognitive reasoning (combine ideas, counter-hypotheses)", modules: ["scientific-research", "causal-graph", "champion-challenger-arbiter", "world-model"], status: "PARTIAL", gap: "hypothesis→experiment→eval + causal graph + adversarial arbiter present; cross-domain analogy recombination is partial" },
  { fn: "§7 opportunity radar (autonomous detection)", modules: ["radar-gap-analysis", "frontier-radar-self-improvement", "self-mission-proposer"], status: "PRESENT", gap: "gap classification + proposal (grantsNoPermission, owner-gated) present" },
  { fn: "§8 experiment lab (isolated, reproducible)", modules: ["frontier-lab", "frontier-lab-experiment", "frontier-sandbox"], status: "PRESENT", gap: "preregistered hypothesis/baseline + sandbox present; never auto-integrates" },
  { fn: "§9 knowledge graph (cumulative memory)", modules: ["knowledge-engine", "world-model", "causal-graph", "memory-taxonomy", "evidence-provenance"], status: "PRESENT", gap: "entities/relations/epistemic status present; no parallel DB (composes STATE/EVIDENCE/MEMORY)" },
  { fn: "§10 deep-web research (hard questions)", modules: ["frontier-radar", "research-ranking", "scientific-research"], status: "PARTIAL", gap: "ranking + re-strategy exist; strategy-switch-on-failure is partial" },
  { fn: "§11 performance (parallel/cache/dedup/early-stop)", modules: ["frontier-pipeline", "benchmark-contamination"], status: "PARTIAL", gap: "dedup/contamination present; query parallelization + caching metrics partial" },
  { fn: "§12 fifteen-métier application", modules: ["metier-benchmark-multidim", "radar-gap-analysis"], status: "PRESENT", gap: "per-métier probes + gap analysis; cross-métier transfer evaluation partial" },
  { fn: "§13 learning & continuous improvement", modules: ["self-improvement", "intelligence-loop", "calibration", "meta-intelligence"], status: "PRESENT", gap: "governed learning loop runs end-to-end (V66); calibration over outcomes present" },
  { fn: "§14 governance & security (untrusted external)", modules: ["scientific-research", "third-party-agent-gate", "root-of-trust", "evidence-provenance"], status: "PRESENT", gap: "injection⇒QUARANTINE, deny-by-default, no governance mutation from external content (V61/V67)" },
  { fn: "§16 radar benchmarks (15 eval axes)", modules: ["metier-benchmark-multidim", "benchmark-contamination", "eval-significance"], status: "PARTIAL", gap: "contamination + significance + multidim present; a dedicated 15-axis radar benchmark suite is partial" },
];

const matrix = FUNCTIONS.map((f) => ({ ...f, allModulesPresent: f.modules.every(modExists), missingModules: f.modules.filter((m) => !modExists(m)) }));
const tally = { PRESENT: matrix.filter((f) => f.status === "PRESENT").length, PARTIAL: matrix.filter((f) => f.status === "PARTIAL").length, MISSING: matrix.filter((f) => f.status === "MISSING").length };
// a function can only be PRESENT if its mapped modules all exist (fail-closed audit).
const integrityOk = matrix.every((f) => f.status !== "PRESENT" || f.allModulesPresent);

const out = {
  "//": "CTO V69 §15 — P9 world-intelligence coverage matrix. Maps V69 capability functions to EXISTING modules (PRESENT/PARTIAL/MISSING); reuse-first, no tenth primitive, no parallel engine. Each mapped module verified present. Read-only audit; implementation targets only the PARTIAL/MISSING gaps.",
  functionCount: matrix.length, tally, integrityOk,
  matrix,
  priorityGaps: matrix.filter((f) => f.status !== "PRESENT").map((f) => ({ fn: f.fn, gap: f.gap })),
  honestConclusion: `P9 world-intelligence audit: ${tally.PRESENT} functions PRESENT, ${tally.PARTIAL} PARTIAL, ${tally.MISSING} MISSING — the radar is already substantially built on existing mechanisms. No tenth primitive needed. V69 implementation targets the PARTIAL gaps (notably §4 source-intelligence typology — BUILD) by COMPOSING existing modules; it does not rebuild what is PRESENT.`,
  invariant: "A function is PRESENT only if its mapped modules all exist; gaps are filled by composing existing modules, never by a new primitive or parallel engine. External content stays untrusted (V61/V67).",
};
fs.writeFileSync(path.join(ROOT, "docs", "odg", "V69_P9_WORLD_INTELLIGENCE_MATRIX.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ functions: matrix.length, tally, integrityOk }, null, 2) + "\n");
export {};
