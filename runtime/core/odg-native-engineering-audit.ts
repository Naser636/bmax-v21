#!/usr/bin/env node
"use strict";

/*
 * V249 §1/§2 — NATIVE-ENGINEERING AUDIT (honest actor attribution + deterministic-capability census). PURE, deterministic.
 * It answers the CTO's P0 question WITHOUT narrating autonomy that does not exist: who REALLY did the work in V247/V248,
 * and which engineering operations ODG can do NATIVELY (deterministically, no generative model) vs which still require the
 * bounded provider (Claude Code). It reads real evidence (git authorship, module presence); it builds NO engine.
 *
 * BLUNT FINDING (ODG-CTC-001 honesty): in V247/V248 the gap-selection, research, planning, and novel CODE WRITING were done
 * by the PROVIDER (Claude Code); the gate was run by the provider; the independent inspection was a DISTINCT agent context
 * (a real author/reviewer separation, but still a spawned model, not the ODG runtime); merge/acceptance was the OWNER's.
 * There is NO evidence of the ODG RUNTIME autonomously selecting/decomposing/executing a mission this campaign. The
 * deterministic native engines (task-fix-*, ast-operations, transform-catalog, change-impact-graph, scope-observer,
 * delegate-isolation, coding-executor) all EXIST, but they were NOT the execution path — so native dependency-reduction is
 * PENDING a wired autonomous ODG decide→drive loop (owner/L1-L2-gated), not achieved by writing more provider code.
 */

const ACTORS = Object.freeze(["ODG_RUNTIME", "CLAUDE_CODE_PROVIDER", "INDEPENDENT_AGENT", "OWNER", "UNKNOWN"]);

// honest per-action attribution for the V247/V248 engineering campaigns (evidence-grounded, not aspirational).
const ATTRIBUTION = Object.freeze([
  { action: "select the métier/gap to improve", realActor: "CLAUDE_CODE_PROVIDER", evidence: "the provider read the modules and chose the gap; the directive named the métier but the specific defect was provider-identified", confidence: "HIGH" },
  { action: "research / Radar (find the reference)", realActor: "CLAUDE_CODE_PROVIDER", evidence: "the provider issued the WebSearch (e.g. SRE Workbook burn-rate); ODG's Radar components were not the driver", confidence: "HIGH" },
  { action: "produce the implementation plan", realActor: "CLAUDE_CODE_PROVIDER", evidence: "provider-authored design; no ODG-runtime plan artifact", confidence: "HIGH" },
  { action: "write the code (novel)", realActor: "CLAUDE_CODE_PROVIDER", evidence: "git Co-Authored-By trailer = Claude; the métier functions were provider-written, NOT routed through coding-executor/task-fix-*", confidence: "HIGH" },
  { action: "run the tests / gate", realActor: "CLAUDE_CODE_PROVIDER", evidence: "provider ran `npm run test:report`; the result was read/interpreted by the provider", confidence: "HIGH" },
  { action: "independent inspection", realActor: "INDEPENDENT_AGENT", evidence: "a DISTINCT agent context re-derived evidence (real author≠reviewer separation) — but a spawned model, not the ODG runtime", confidence: "HIGH" },
  { action: "merge / acceptance", realActor: "OWNER", evidence: "the squash-merge commit author is the repo owner; final strategic acceptance is owner/CTO, not provider self-acceptance", confidence: "HIGH" },
  { action: "autonomous ODG-runtime decision distinct from the directive", realActor: "UNKNOWN", evidence: "NO trace of the ODG runtime autonomously selecting/decomposing/executing — NOT_PROVEN", confidence: "NOT_PROVEN" },
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// deterministic native-engineering capability modules (non-generative). Classify from REAL presence (injected predicate).
const NATIVE_CAPS = Object.freeze([
  { cap: "deterministic fixers (exports/require/json/unused-imports)", modules: ["task-fix-exports", "task-fix-require", "task-fix-json", "task-fix-unused-imports"] },
  { cap: "AST parse/transform", modules: ["odg-ast-operations", "odg-transform-catalog"] },
  { cap: "code map / impact graph", modules: ["change-impact-graph"] },
  { cap: "write-set / scope enforcement", modules: ["scope-observer", "delegate-isolation"] },
  { cap: "bounded execution (no eval)", modules: ["odg-closed-executor", "coding-executor"] },
  { cap: "generative repair adapter (provider-backed)", modules: ["generative-repair-adapter"] },
]);

/* attributionMatrix() -> the honest V247/V248 actor matrix + the blunt conclusion. */
function attributionMatrix(): any {
  const byActor: Record<string, number> = {};
  for (const r of ATTRIBUTION) byActor[r.realActor] = (byActor[r.realActor] || 0) + 1;
  return Object.freeze({
    rows: ATTRIBUTION, byActor: Object.freeze(byActor),
    odgRuntimeAutonomousActions: ATTRIBUTION.filter((r) => r.realActor === "ODG_RUNTIME").length, // honestly 0
    providerActions: byActor["CLAUDE_CODE_PROVIDER"] || 0,
    conclusion: "V247/V248 were OWNER-directed, PROVIDER-executed engineering with INDEPENDENT-AGENT inspection; the ODG RUNTIME did NOT autonomously select/decompose/execute. 'ODG decided' is a directive→provider narrative, not a runtime fact. Provider dependency for NOVEL code is near-total.",
  });
}

/* nativeCapabilityCensus(exists) -> which deterministic engines are present, and the honest autonomy caveat. */
function nativeCapabilityCensus(exists?: any): any {
  const ex = typeof exists === "function" ? exists : (() => false);
  const rows = NATIVE_CAPS.map((c) => {
    const present = c.modules.map((m) => ({ m, present: ex(m) === true }));
    const allPresent = present.every((p) => p.present);
    return Object.freeze({ cap: c.cap, modules: Object.freeze(present),
      status: allPresent ? "NATIVE_DETERMINISTIC_PRESENT" : (present.some((p) => p.present) ? "PARTIAL" : "ABSENT"),
      autonomyCaveat: "PRESENT ≠ autonomously driven — not routed by an ODG-runtime decision in V247/V248" });
  });
  return Object.freeze({
    rows, presentCount: rows.filter((r) => r.status === "NATIVE_DETERMINISTIC_PRESENT").length, total: rows.length,
    requiresProvider: Object.freeze(["novel code generation for a new capability", "gap judgment / design choice", "risk/security judgment (V247: local model PROPOSER_ONLY, unreliable)"]),
    note: "the deterministic engines EXIST; real dependency-reduction needs an autonomous ODG decide→drive loop over them (owner/L1-L2-gated), NOT more provider-written code",
  });
}

function demonstrate(): any {
  const fs = require("fs");
  const exists = (m: string) => { try { return fs.existsSync("runtime/core/" + m + ".ts"); } catch { return false; } };
  const attr = attributionMatrix();
  const census = nativeCapabilityCensus(exists);
  return Object.freeze({
    attribution: attr, census,
    dependencyHonest: Object.freeze({ odgRuntimeAutonomous: attr.odgRuntimeAutonomousActions === 0 ? "NONE_PROVEN" : "SOME",
      deterministicEnginesPresent: census.presentCount + "/" + census.total,
      realReduction: "NOT_YET — the native engines are present but were not the execution path; wiring an autonomous ODG decide→drive loop is the next structural step (gated)" }),
  });
}

const NATIVE_ENGINEERING_AUDIT_CONTRACT = Object.freeze({
  id: "V249-NATIVE-ENGINEERING-AUDIT",
  purpose: "§1/§2 — honest actor attribution for V247/V248 + deterministic native-capability census; isolates the real generative gap without narrating false autonomy",
  actors: ACTORS,
  invariants: Object.freeze([
    "ODG_RUNTIME autonomous actions in V247/V248 = 0 (NOT_PROVEN); attribution is evidence-grounded, an action is never credited to ODG just because a directive addressed it",
    "deterministic native engines (task-fix-*/ast/transform/impact/scope/executor) are censused by REAL module presence; PRESENT ≠ autonomously driven",
    "novel code generation + gap/risk judgment still REQUIRE the bounded provider (V247: local model PROPOSER_ONLY); real dependency-reduction is PENDING a wired ODG decide→drive loop (gated)",
    "reads real evidence (git/module presence); builds NO engine, no 10th primitive; honest — never claims ODG is autonomous",
  ]),
});

module.exports = { ATTRIBUTION, NATIVE_CAPS, attributionMatrix, nativeCapabilityCensus, demonstrate, NATIVE_ENGINEERING_AUDIT_CONTRACT };
export {};
