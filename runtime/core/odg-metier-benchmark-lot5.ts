#!/usr/bin/env node
"use strict";
/*
 * V193 §4 — radar LOT 5 (M1 CRA/SBOM, P6 Eval/quality, P12 Streaming/realtime). PURE, deterministic, READ-ONLY.
 * Real sources collected under grant V141 (WebSearch, 2026-11-13) fed THROUGH the radar collection adapter (V187) as
 * the injected authorized provider — the radar owns the path. Benchmark + gaps + construction contracts (prepared,
 * BLOCKED_AWAITING_ISOLATION; CTO build auth granted V192 §3; only real isolation remains, OWNER_GATED).
 */

const ADAPTER = require("./odg-radar-collection-adapter.js");

const SOURCES = Object.freeze({
  M1: [{ org: "EU (CRA official)", title: "Cyber Resilience Act: 11 Sep 2026 Art.14 (24h exploited-vuln reporting to CSIRT+ENISA); 11 Dec 2027 main obligations + machine-readable SBOM (top-level deps, kept current, to market-surveillance on request); penalties €15M/2.5%", url: "https://eur-lex.europa.eu/eli/reg/2024/2847/oj", consultedDate: "2026-11-13" }],
  P6: [{ org: "HELM / arxiv contamination studies", title: "LLM eval: HELM fixed-format + 3 seeds; contamination-resistance (PRIVATE held-out, version-by-date, post-cutoff sets); 30-50 labeled examples calibrate a judge; multi-prompt for stability; no detection method consistently reliable", url: "https://crfm.stanford.edu/helm/", consultedDate: "2026-11-13" }],
  P12: [{ org: "Kafka/Flink (arxiv + 2026 guides)", title: "exactly-once = 2-phase commit (checkpoint↔offset↔transactional sink); at-least-once + idempotent sinks = practical default; event-time + watermarks (BoundedOutOfOrderness 5-30s, late→side-output); backpressure; KRaft + Flink 1.18+", url: "https://flink.apache.org/", consultedDate: "2026-11-13" }],
});
function fetcher(query: string): any[] { const m = String(query).match(/\b(M1|P6|P12)\b/); return m ? (SOURCES as any)[m[1]] : []; }
const GRANT = Object.freeze({ authorized: true, expiresMs: 1795046400000, budget: Object.freeze({ maxCalls: 200 }) });

function campaign(nowEpochMs: number): any {
  return ADAPTER.runCampaign({
    id: "V193-lot5", nowEpochMs, grant: GRANT, fetcher,
    items: [
      { metier: "M1", query: "M1 CRA SBOM cyber resilience act deadlines", buySignal: "REGULATORY_DEADLINE", segmentFit: 4, budgetEvidence: "OBSERVED", regulatoryUrgency: 5 },
      { metier: "P6", query: "P6 Eval quality HELM contamination held-out", buySignal: "NONE", segmentFit: 4, budgetEvidence: "HYPOTHESIS", regulatoryUrgency: 2 },
      { metier: "P12", query: "P12 Streaming Kafka Flink exactly-once watermarks", buySignal: "NONE", segmentFit: 4, budgetEvidence: "HYPOTHESIS", regulatoryUrgency: 1 },
    ],
  });
}

const BENCHMARK = Object.freeze([
  { metier: "M1", name: "CRA / SBOM remediation", worldRef: "EU CRA: 11 Sep 2026 (24h exploited-vuln reporting), 11 Dec 2027 (machine-readable SBOM top-level deps + conformity), €15M/2.5%", odgCurrent: "cra-remediation-engine + supply-chain-attest + multi-ecosystem SBOM + p8-slsa + iso27001-crosswalk", gap: "no CRA deadline/obligation tracker; no 24h incident-reporting workflow; no SBOM-currency check", recommendation: "IMPROVE: CRA deadline+obligation tracker + 24h-reporting checklist + SBOM-currency check (source-cited; reuse; no cert claimed)" },
  { metier: "P6", name: "Eval / quality", worldRef: "HELM fixed-format+3-seeds; contamination-resistance via PRIVATE held-out + version-by-date; 30-50 labeled calibration; multi-prompt stability", odgCurrent: "evaluator-independence + mission-independent-validation + odg-broad-it-eval-set (ANTI-CONTAMINATION, BLOCKED on external corpus)", gap: "broad-it-eval-set BLOCKED on an owner corpus; no held-out versioning / judge-calibration harness", recommendation: "IMPROVE: held-out-set versioning + judge-calibration harness over the existing eval-set (owner corpus still gates a full run)" },
  { metier: "P12", name: "Streaming / realtime", worldRef: "Kafka+Flink exactly-once (2-phase commit); at-least-once+idempotent = practical default; event-time watermarks (5-30s); backpressure", odgCurrent: "odg-mission-scheduler (bounded) + support-renewal idempotency + campaign-lifecycle checkpoint", gap: "ODG is not a stream processor — reference/method only; no event-time/watermark runtime", recommendation: "IMPROVE (method-only): streaming reference (idempotent + checkpoint patterns reused); a real streaming runtime is REJECTED/OWNER_GATED (not an ODG runtime)" },
]);

const CONSTRUCTION_CONTRACTS = Object.freeze([
  { id: "IMP-M1-CRA-TRACKER", metier: "M1", objective: "CRA deadline+obligation tracker + 24h-reporting checklist + SBOM-currency check (source-cited; no cert claimed)", writeSet: ["runtime/core/odg-cra-deadline-tracker.ts", "runtime/core/odg-cra-deadline-tracker.test.ts"], acceptance: ["deadlines/penalties sourced, not invented", "nothing declared certified/compliant", "gate green"] },
  { id: "IMP-P6-EVAL-HELDOUT", metier: "P6", objective: "held-out-set versioning + judge-calibration harness over the existing eval-set (owner corpus gates full run)", writeSet: ["runtime/core/odg-eval-heldout-calibration.ts", "runtime/core/odg-eval-heldout-calibration.test.ts"], acceptance: ["held-out versioned by date; anti-contamination preserved", "full run stays BLOCKED on owner corpus", "gate green"] },
  { id: "IMP-P12-STREAM-REF", metier: "P12", objective: "streaming reference/checklist (idempotent + checkpoint patterns; method-only, NO runtime)", writeSet: ["runtime/core/odg-streaming-reference.ts", "runtime/core/odg-streaming-reference.test.ts"], acceptance: ["reference only; real streaming runtime REJECTED/OWNER_GATED", "gate green"] },
].map((c: any) => Object.freeze({ ...c, writeSet: Object.freeze(c.writeSet), acceptance: Object.freeze(c.acceptance), status: "BLOCKED_AWAITING_ISOLATION", note: "CTO build auth granted (V192 §3); construction waits only on validated real isolation (OWNER_GATED)." })));

function report(nowEpochMs: number): any {
  return Object.freeze({
    lot: 5, metiers: Object.freeze(["M1", "P6", "P12"]), radarCampaign: campaign(nowEpochMs),
    benchmark: BENCHMARK, constructionContracts: CONSTRUCTION_CONTRACTS,
    remainingMetiers: Object.freeze(["P14", "P15", "M3", "M4", "M5"]),
    note: "LOT 5 collected THROUGH the radar adapter; after lots 1-5, 15 métiers studied, 5 remain (P14/P15 + M3/M4/M5). Construction contracts prepared, BLOCKED_AWAITING_ISOLATION.",
  });
}

const BENCHMARK_LOT5_CONTRACT = Object.freeze({
  id: "V193-METIER-BENCHMARK-LOT5",
  purpose: "§4 — M1/P6/P12 benchmark via a real radar-adapter campaign + prepared construction contracts",
  invariants: Object.freeze([
    "M1/P6/P12 sources collected THROUGH the radar adapter (injected provider) — not radar autonomous egress",
    "real métier-specific refs (EU CRA / HELM-contamination / Kafka-Flink); REUSE/IMPROVE-first; P12 streaming runtime REJECTED",
    "M1 nothing declared certified/compliant; P6 full eval run BLOCKED on owner corpus",
    "construction contracts prepared + BLOCKED_AWAITING_ISOLATION; no construction performed; deterministic; read-only; 5 métiers remain",
  ]),
});

module.exports = { SOURCES, GRANT, fetcher, campaign, BENCHMARK, CONSTRUCTION_CONTRACTS, report, BENCHMARK_LOT5_CONTRACT };
export {};
