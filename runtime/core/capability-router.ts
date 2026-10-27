#!/usr/bin/env node

/*
 * P8 — Local Capability Router.
 *
 * The decision core of the permanent architecture. Given a task, it builds an ordered plan across
 * the tiers and picks the FIRST local resolver — external AI is appended only as an explicit last
 * resort and is chosen only when every local tier fails:
 *
 *   Memory (Patch Memory, P1) → Rules (P4) → Local LLM (P9) → External AI (last resort)
 *
 * Deterministic fixers (P2) and local tests (P3) are the executors a chosen capability invokes;
 * the router selects the capability. Among competing local capabilities it prefers the one with the
 * best measured success rate (P7 metrics). The Runtime always decides; LLMs are only executors.
 *
 * STRICT TS PORT (V63): behaviour-preserving transliteration of the historical .js. The tier ordering,
 * the memory-always-wins rule, the metrics tie-break, the always-last External-AI last-resort entry and
 * the injectable localModelAvailable seam are byte-identical. Reuses the co-located patch-memory /
 * decision-rules / capability-metrics (.js) and the dual-ported local-model-manager; no concurrent router.
 */

"use strict";

const patchMemory: any = require("./patch-memory");
const rules: any = require("./decision-rules");
const metrics: any = require("./capability-metrics");
const EXC: any = require("./excellence-policy");   // AXE 1: gate the CHOSEN route (shared boundary), opt-in

function localModelAvailable(opts: any): boolean {
  if (opts && typeof opts.localModelAvailable === "boolean") return opts.localModelAvailable;
  try {
    return require("./local-model-manager").isAvailable();
  } catch {
    return false; // P9 absent ⇒ treat local LLM as unavailable (never blocks routing)
  }
}

function route(task: any, opts?: any): any {
  task = task || {};
  const plan: any[] = [];

  // Tier 1 — Memory: a known, previously-APPLIED solution for this exact signature.
  const memEdits = patchMemory.lookup(task);
  if (memEdits) plan.push({ tier: "PATCH_MEMORY", source: "LOCAL", action: "replay", edits: memEdits });

  // Tier 2 — Rules: a deterministic capability implied by the goal.
  const rule = rules.match(task.goal);
  if (rule) plan.push({ tier: "RULES", source: "LOCAL", capability: rule.capability, fixers: rule.fixers });

  // Tier 3 — Local LLM: only if a local model is actually available.
  if (localModelAvailable(opts)) plan.push({ tier: "LOCAL_LLM", source: "LOCAL", capability: "local-llm" });

  // Tier 4 — External AI: always present, always LAST, always flagged as the last resort.
  plan.push({ tier: "EXTERNAL_AI", source: "EXTERNAL", capability: "external-ai", lastResort: true });

  let chosen;
  if (memEdits) {
    chosen = plan[0]; // Memory always wins when it has an answer.
  } else {
    const local = plan.filter((s) => s.source === "LOCAL");
    if (local.length) {
      const caps = local.map((s) => s.capability).filter(Boolean);
      const bestCap = caps.length > 1 ? metrics.best(caps) : caps[0];
      chosen = local.find((s) => s.capability === bestCap) || local[0];
    } else {
      chosen = plan[plan.length - 1]; // only External AI remained
    }
  }

  // AXE 1 — OPT-IN excellence gate on the CHOSEN route (the selection that influences execution). Only engaged when
  // opts.excellence is supplied; otherwise EXACT legacy behaviour (public contract preserved). A PROHIBITED unproven-
  // superlative claim ⇒ the route is NOT admitted (chosen:null, admit:false) so a contract-honouring caller does NOT
  // dispatch it. Stale/offline references + reviewer-unavailable ⇒ ADVISORY, non-blocking (chosen kept). Reuses the
  // shared requireExcellence boundary (no duplication, no new primitive).
  if (opts && opts.excellence) {
    const ex = opts.excellence;
    let review: any; let reviewerErrored = false;
    if (typeof ex.reviewer === "function") { try { review = ex.reviewer(chosen); } catch { reviewerErrored = true; } }
    if (!review) review = reviewerErrored
      ? { verdict: "ADVISORY_ERROR", claims: [], staleReferences: [], gaps: [] }
      : EXC.reviewForExcellence({ domain: ex.domain || "capability-selection", now: ex.now || "", registry: ex.registry || [], currentPractices: [chosen && (chosen.capability || chosen.tier)].filter(Boolean), thresholds: {}, measured: {}, claims: (task.claims) || ex.claims || [] });
    const gate = EXC.requireExcellence(review, {});
    const excellence = { verdict: review.verdict, admit: gate.admit, advisory: gate.advisory, reason: gate.reason, staleReferences: review.staleReferences || [], reviewerErrored };
    if (!gate.admit) return { task, plan, chosen: null, usesExternalAI: false, excellence, admit: false };
    return { task, plan, chosen, usesExternalAI: chosen.source === "EXTERNAL", excellence, admit: true };
  }

  return { task, plan, chosen, usesExternalAI: chosen.source === "EXTERNAL" };
}

module.exports = { route };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope (no global-script collisions).
export {};
