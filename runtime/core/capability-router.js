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
 */

"use strict";

const patchMemory = require("./patch-memory");
const rules = require("./decision-rules");
const metrics = require("./capability-metrics");

function localModelAvailable(opts) {
    if (opts && typeof opts.localModelAvailable === "boolean") return opts.localModelAvailable;
    try {
        return require("./local-model-manager").isAvailable();
    } catch {
        return false; // P9 absent ⇒ treat local LLM as unavailable (never blocks routing)
    }
}

function route(task, opts) {
    task = task || {};
    const plan = [];

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

    return { task, plan, chosen, usesExternalAI: chosen.source === "EXTERNAL" };
}

module.exports = { route };
