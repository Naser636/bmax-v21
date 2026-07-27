#!/usr/bin/env node

/*
 * Local-First Autonomy Facade — integration point for the P1–P10 capability stack.
 *
 * This is NOT a new runtime and NOT a new architecture: it is a thin facade that composes the
 * existing capability modules into the permanent flow, so the Runtime can turn a natural-language
 * request into a mission, decide locally, and learn from the result — reaching external AI only as a
 * last resort.
 *
 *   request ──P5 synthesize──▶ mission contract
 *           ──P8 route───────▶ Memory(P1) ▸ Rules(P4) ▸ LocalLLM(P9) ▸ ExternalAI(last resort)
 *           ──P10 factory────▶ manufacture a local capability instead of escalating (optional)
 *   result  ──P6 learn───────▶ Patch Memory(P1) + Metrics(P7)  (auto-enriched memory)
 *
 * The Runtime decides; LLMs are only executors. Pure orchestration — no I/O beyond the modules it
 * delegates to.
 */

"use strict";

const synth = require("./mission-synthesizer");     // P5
const router = require("./capability-router");       // P8 (uses P1, P4, P7, P9)
const learning = require("./capability-learning");   // P6 (feeds P1, P7)
const factory = require("./capability-factory");     // P10

// request → mission → local-first decision. `opts.manufactureIfMissing` lets the Runtime build a
// local capability (P10) rather than escalate to external AI when nothing local resolves the task.
function handle(request, opts) {
    opts = opts || {};
    const contract = synth.fromRequest(request, opts.spec);
    const objective = contract.objectives[0];
    const task = {
        goal: objective.goal,
        objectiveId: objective.id,
        target: objective.patch && objective.patch.target,
        rootCause: opts.rootCause,
    };
    const decision = router.route(task, opts);

    let manufactured = null;
    if (decision.usesExternalAI && opts.manufactureIfMissing) {
        manufactured = factory.create(contract.resolvedCapability || contract.mission, { goal: objective.goal });
    }

    return {
        request,
        contract,
        task,
        decision,
        manufactured,
        // External AI is only truly used when no local tier resolved AND we did not manufacture one.
        usesExternalAI: decision.usesExternalAI && !manufactured,
    };
}

// Close the loop after a mission executes: learn the outcome (enriches Patch Memory + Metrics).
function complete(missionReport) {
    return learning.learn(missionReport);
}

module.exports = { handle, complete };
