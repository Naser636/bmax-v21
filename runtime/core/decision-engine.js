#!/usr/bin/env node

/*
 * Decision Engine — mission-driven.
 *
 * The decision is now derived from the loaded mission's OWN objectives (mission-plan.json), not from
 * a static, mission-independent list of repo-scan actions. Different missions therefore produce
 * different decisions (one action per objective, in contract order). The old hardcoded
 * PROCESS_TODOS / PROCESS_FIXMES / IMPLEMENT_MISSING_CAPABILITIES generation is removed; repo
 * metrics from knowledge.json are kept only as optional, non-driving context.
 *
 * Deterministic: output is a pure function of the mission plan AND the (git-ignored) Patch Memory
 * state — identical plan + identical memory ⇒ identical decision.json (no wall-clock stamp). With an
 * empty Patch Memory (fresh clone), behaviour is byte-identical to the pre-WAKE-1 engine.
 */

const fs = require("fs");

// WAKE-1 — canonical RESOLVER. The live decision path consults the EXISTING tiered Capability Router
// (Memory → Rules → Local LLM → External AI, runtime/core/capability-router.js). Only the Memory tier
// yields a reusable artifact HERE: a previously-APPLIED, validated patch for this objective's signature,
// replayed as the objective's optional `patch` payload — the SAME field the Patch Engine already
// consumes. Every other tier (and any router error) attaches NOTHING, so a no-precedent objective is
// byte-identical to prior behaviour (deterministic fallthrough). The router NEVER writes or executes:
// its edits are a DECISION INPUT that the Patch Executor applies under authorizedPaths and the
// Validation Engine re-checks — no new primitive, no new stage, no new authority, no governance bypass.
let router = null;
try {
    router = require("./capability-router");
} catch {
    router = null; // router absent ⇒ pre-WAKE-1 behaviour (no memory reuse)
}

// C4 (review N4 remediation) — REAL reuse accounting. The Capability Router's Memory tier LOOKS UP a
// precedent (pure) but nothing ever marked it USED, so patch-memory.reuseCount stayed 0 forever even
// when a precedent was genuinely replayed (observed in exam N3). Here — the ONE place a precedent's
// edits are actually attached to a mission objective and handed to the Patch Executor — we record the
// reuse via patch-memory.hit(), using the SAME task key the router/lookup keyed on. This runs only in
// the live Decision STAGE (once per mission execution), NEVER in the pure dry-run gateway, so routing
// stays side-effect-free and decision.json stays deterministic (reuseCount is a metrics field, not an
// output). Best-effort: absent module ⇒ reuse is simply not counted (prior behaviour).
let patchMemory = null;
try {
    patchMemory = require("./patch-memory");
} catch {
    patchMemory = null;
}

// A router Memory result is reusable only if it is a non-empty list of well-formed edits, each naming a
// target and carrying EXACTLY ONE of content/diff (the Patch Executor's contract). Anything else is
// rejected here (never attached) — a malformed precedent can never become a silent action.
function isReusableEdits(edits) {
    return (
        Array.isArray(edits) &&
        edits.length > 0 &&
        edits.every(
            (e) =>
                e &&
                typeof e === "object" &&
                typeof e.target === "string" &&
                e.target.length > 0 &&
                (typeof e.content === "string") !== (typeof e.diff === "string"),
        )
    );
}

// Resolve a reusable Memory patch for one objective, or null. Memory-first, fail-closed. An objective
// that already carries an author-provided `patch` is left untouched (never overridden).
function memoryPatchFor(objective) {
    if (!router || !objective || typeof objective.id !== "string") return null;
    if (objective.patch) return null;
    try {
        const routed = router.route({ goal: objective.goal, objectiveId: objective.id });
        if (
            routed &&
            routed.chosen &&
            routed.chosen.tier === "PATCH_MEMORY" &&
            isReusableEdits(routed.chosen.edits)
        ) {
            return routed.chosen.edits;
        }
    } catch {
        /* fail closed: any router/memory error ⇒ no reuse, exact prior behaviour */
    }
    return null;
}

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

const plan = readJsonSafe("runtime/generated/mission-plan.json");
if (!plan || !Array.isArray(plan.objectives) || plan.objectives.length === 0) {
    console.error("STOP: mission-plan.json missing or has no objectives — Mission Loader must run first.");
    process.exit(1);
}

// Optional, non-driving repository context (best-effort).
const knowledge = readJsonSafe("runtime/generated/knowledge.json");
const metrics = knowledge && knowledge.project ? knowledge.project : null;

// One action per mission objective, in contract order. This is what makes execution mission-scoped.
const actions = plan.objectives.map((o) => o.id);

// WAKE-1 — enrich each objective with a reusable Memory patch when the Capability Router has one for
// its signature. Pure/order-preserving: ids (and therefore `actions`) are unchanged; only an optional
// `patch` is added on a Memory hit. No hit ⇒ the objective passes through verbatim (prior behaviour).
const objectives = plan.objectives.map((o) => {
    const mem = memoryPatchFor(o);
    if (!mem) return o;
    // C4 — a precedent is genuinely being REUSED (its edits are attached to this objective and will be
    // applied by the Patch Executor): count it on the matching entry, using the SAME task key the router
    // keyed on. Fail-closed/best-effort: a miss or module error never affects the decision.
    if (patchMemory) {
        try {
            patchMemory.hit({ goal: o.goal, objectiveId: o.id });
        } catch {
            /* reuse accounting is advisory — never block the decision on it */
        }
    }
    return { ...o, patch: mem };
});

const result = {
    mission: plan.mission,
    mode: plan.mode,
    status: "READY",
    priority: plan.priority || "NORMAL",
    requiresEngineering: plan.requiresEngineering === true,
    authorizedPaths: Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [],
    actions,
    objectives,
    metrics, // context only; does not influence actions
};

// Transport-only: carry the research_acquisition authorization block verbatim toward the Patch Engine.
// Absent ⇒ no key (other missions unaffected). No authority/policy decision is made here.
if (plan.research_acquisition && typeof plan.research_acquisition === "object") {
    result.research_acquisition = plan.research_acquisition;
}

fs.mkdirSync("runtime/generated", { recursive: true });
fs.writeFileSync(
    "runtime/generated/decision.json",
    JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("DECISION ENGINE v4 (mission-driven)");
console.log("======================================");
console.log("Mission  :", result.mission);
console.log("Mode     :", result.mode);
console.log("Priority :", result.priority);
console.log("Actions  :", result.actions.length, "(one per objective)");
for (const a of result.actions) console.log(" -", a);
console.log("======================================");
