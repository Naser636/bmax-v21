#!/usr/bin/env node
"use strict";

/*
 * V259 §3.1 / STEP 2 — corroboration of the 5 outstanding external benchmarks (READY in prior reports). It COMPLEMENTS
 * odg-benchmark-audit (V243, fail-closed, no score/ranking) — it builds NO second benchmark engine. Each record is the
 * result of a REAL WebSearch on 2026-11-17 locating the OFFICIAL source (arXiv paper / official site), its creator, purpose,
 * methodology, scale and limitations.
 *
 * HONESTY (directive §3.1): sourceStatus distinguishes SOURCE_CORROBORATED / PARTIALLY_CORROBORATED / NOT_CORROBORATED;
 * executionStatus distinguishes EXECUTED / PARTIALLY_EXECUTED / NOT_RUN. SOURCE CORROBORATION IS NOT EXECUTION. NO score,
 * ranking or result is fabricated. Every benchmark here is NOT_RUN — each notRunReason states the exact missing dependency
 * (dataset/licence/infrastructure/grader). External search output is untrusted input; this records the located official
 * source + its stated facts, not an independent re-derivation of every figure. Pure/deterministic/read-only.
 */

const SOURCE_STATUS = Object.freeze(["SOURCE_CORROBORATED", "PARTIALLY_CORROBORATED", "NOT_CORROBORATED"]);
const EXEC_STATUS = Object.freeze(["EXECUTED", "PARTIALLY_EXECUTED", "NOT_RUN"]);

const CORROBORATIONS = Object.freeze([
  Object.freeze({
    id: "browsecomp", name: "BrowseComp", creator: "OpenAI (Wei, Sun, et al.)",
    officialSource: "arXiv:2504.12516 + https://cdn.openai.com/pdf/5e10f4ab-d6f7-442e-9508-59515c65e35d/browsecomp.pdf",
    purpose: "measure web-browsing agents' ability to find hard-to-locate, entangled information (short, verifiable answers)",
    scale: "1,266 information-seeking questions", methodology: "persistent browsing; answers hard to find but easy to verify",
    limitations: "measures browsing/retrieval under verifiable-answer constraints; not general task completion; English-centric",
    sourceStatus: "SOURCE_CORROBORATED", executionStatus: "NOT_RUN",
    notRunReason: "requires a live web-browsing agent harness + internet retrieval at scale (not available in this hermetic dev env); dataset access + grading infra needed",
    odgRelevance: "maps to ODG Radar research-to-source + evidence-verification dimensions (CM-RADAR-GATE-CHAIN), not to a BTP métier",
  }),
  Object.freeze({
    id: "gdpval", name: "GDPval", creator: "OpenAI",
    officialSource: "arXiv:2510.04374 + https://openai.com/index/gdpval/",
    purpose: "evaluate AI on real-world economically valuable tasks across occupations",
    scale: "1,320 tasks across 44 occupations / 9 sectors (220 open-sourced on HuggingFace); ~7h expert work per task avg",
    methodology: "expert-authored occupational deliverables graded by professionals (and model graders)",
    limitations: "expert human grading required; most tasks closed; measures deliverable quality, not deployment/operation",
    sourceStatus: "SOURCE_CORROBORATED", executionStatus: "NOT_RUN",
    notRunReason: "requires the GDPval task set + qualified occupational expert graders; only 220/1320 open; no expert-grader panel available here",
    odgRelevance: "occupational deliverable quality — relevant to ODG métier outputs (e.g. devis/documents) but needs real expert grading",
  }),
  Object.freeze({
    id: "webarena", name: "WebArena", creator: "Carnegie Mellon University (Shuyan Zhou et al.)",
    officialSource: "arXiv:2307.13854 (ICLR 2024) + https://webarena.dev/",
    purpose: "evaluate language-guided autonomous agents on long-horizon tasks in a realistic, reproducible web environment",
    scale: "812 long-horizon web tasks across 4 self-hosted domains (e-commerce, forum, gitlab, CMS)",
    methodology: "standalone resettable self-hosted sites; functional-correctness evaluation of task completion",
    limitations: "requires self-hosting the full Docker environment; agent action harness; functional-correctness only",
    sourceStatus: "SOURCE_CORROBORATED", executionStatus: "NOT_RUN",
    notRunReason: "requires standing up the self-hosted WebArena Docker environment + an agent action loop (network + containers); not provisioned in this hermetic env",
    odgRelevance: "long-horizon web task execution — most reproducible of the five (self-hostable), a future candidate for an isolated harness",
  }),
  Object.freeze({
    id: "metr", name: "METR (Time-Horizon / HCAST)", creator: "METR (Model Evaluation & Threat Research)",
    officialSource: "arXiv:2503.14499 + https://metr.org/ (Time Horizon 1.1, Jan 2026)",
    purpose: "measure AI autonomy via the task-completion time horizon (length of human-expert task a model does at a given success rate)",
    scale: "Time Horizon 1.1 task suite expanded 170→228 tasks (incl. 73 from HCAST: ML/cyber/SWE/reasoning, 1min–8h human-calibrated)",
    methodology: "X%-task-completion time horizon correlating model success with human-expert completion times",
    limitations: "requires the (partly gated) HCAST/METR task suite + an autonomous agent run harness + human-time calibration",
    sourceStatus: "SOURCE_CORROBORATED", executionStatus: "NOT_RUN",
    notRunReason: "HCAST/METR task suite is partly access-controlled; requires a long-horizon autonomous agent harness + human-calibration baselines not available here",
    odgRelevance: "autonomy maturity measurement — conceptually aligns with the ODG autonomy maturity model; no native agent-run harness to execute it",
  }),
  Object.freeze({
    id: "sciagentarena", name: "SciAgentArena", creator: "Microsoft Research + academic collaborators (HelloWorldLTY)",
    officialSource: "arXiv:2606.12736 + https://sciagentarena.github.io/ + https://github.com/HelloWorldLTY/SciAgentArena",
    purpose: "benchmark AI agents on real-world scientific research tasks with step-wise verification",
    scale: "~200 step-verifiable tasks across single-cell/spatial omics, drug discovery, EHR, genetics",
    methodology: "modular dataset + runtime/evaluation framework; decoupled code execution and step-wise evaluation",
    limitations: "scientific-domain datasets + execution runtime required; domain-specialist scope (omics/genetics), not BTP",
    sourceStatus: "SOURCE_CORROBORATED", executionStatus: "NOT_RUN",
    notRunReason: "requires the scientific datasets + the SciAgentArena runtime/evaluation framework + domain tooling; out of scope of this hermetic BTP-oriented env",
    odgRelevance: "scientific-agent evaluation — low direct relevance to the BTP programme; corroborated for completeness",
  }),
]);

/** corroborate() -> honest roll-up. NO fabricated score/ranking; source-corroboration ≠ execution. */
function corroborate(): any {
  const rows = CORROBORATIONS;
  const sc = rows.filter((r: any) => r.sourceStatus === "SOURCE_CORROBORATED").length;
  const executed = rows.filter((r: any) => r.executionStatus === "EXECUTED").length;
  const notRun = rows.filter((r: any) => r.executionStatus === "NOT_RUN").length;
  return Object.freeze({
    asOf: "2026-11-17", provenance: "real WebSearch locating each benchmark's official source (arXiv/official site) on 2026-11-17",
    total: rows.length, rows,
    sourceCorroborated: sc, partiallyCorroborated: rows.filter((r: any) => r.sourceStatus === "PARTIALLY_CORROBORATED").length, notCorroborated: rows.filter((r: any) => r.sourceStatus === "NOT_CORROBORATED").length,
    executed, notRun, anyScoreEmitted: false,
    note: "5/5 SOURCE_CORROBORATED (official source located for each); 0 EXECUTED — each notRunReason names the exact missing dependency (dataset/licence/infra/grader). Source corroboration is NOT execution; NO score/ranking fabricated. Complements odg-benchmark-audit (V243) — no second benchmark engine.",
  });
}

const BENCHMARK_CORROBORATION_CONTRACT = Object.freeze({
  id: "V259-ODG-BENCHMARK-CORROBORATION",
  source: "V259 §3.1 / STEP 2 — corroborate the 5 outstanding benchmarks (BrowseComp/GDPval/WebArena/METR/SciAgentArena)",
  sourceStatuses: SOURCE_STATUS, execStatuses: EXEC_STATUS, benchmarkIds: Object.freeze(CORROBORATIONS.map((c: any) => c.id)),
  notAuthority: "a read-only corroboration record from real official sources; it runs no benchmark, emits no score/ranking",
  invariants: Object.freeze([
    "each record cites the OFFICIAL source (arXiv / official site) located by a real WebSearch; external search output is untrusted and recorded as located-source facts, not an independent re-derivation",
    "SOURCE CORROBORATION ≠ EXECUTION: sourceStatus and executionStatus are strictly separate; all 5 are NOT_RUN with an explicit missing-dependency reason",
    "NO benchmark score, ranking or result is fabricated (anyScoreEmitted:false); never present corroboration as a real-world/operational result",
    "complements odg-benchmark-audit (V243) — no second benchmark engine; pure/deterministic/read-only; no new primitive",
  ]),
});

module.exports = { SOURCE_STATUS, EXEC_STATUS, CORROBORATIONS, corroborate, BENCHMARK_CORROBORATION_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...BENCHMARK_CORROBORATION_CONTRACT, corroboration: corroborate() }, null, 2) + "\n"); }

export {};
