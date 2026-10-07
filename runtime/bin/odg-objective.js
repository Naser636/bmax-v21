#!/usr/bin/env node
"use strict";

/*
 * `odg objective "<natural-language objective>" [--execute]` — the semantic mission entrypoint.
 *
 * HUMAN NATURAL INTENT → ODG INTERPRETATION → EXISTING GOVERNED MISSION/PLAN → EXECUTION. The user
 * never needs a mission name, a file name, a pipeline name, or an internal command.
 *
 * Default (DRY-RUN, unchanged): compiles the objective through the Natural-Language Objective Gateway
 * (runtime/core/nl-objective-gateway.js) into the governed projection and prints it as JSON. Executes
 * nothing, calls no provider, writes nothing. Exit 0 only when the dry-run is clean (READY_DRY_RUN),
 * else 2 — so CI/callers can still gate on a clean compilation.
 *
 * With --execute: this is the ONLY new behaviour — a thin SEAM that routes a CLEAN governed projection
 * to execution. It invents no authority and no second runtime:
 *   - interpretation + all governance (intent, contract, capability, risk, authority, policy, admission)
 *     stay in the gateway, which remains dry-run and never executes;
 *   - a governed mission is materialized through the EXISTING on-demand contract lifecycle
 *     (runtime/missions/<id>.json, gitignored) WITHOUT clobbering an existing contract — an existing
 *     one is REUSED (resolve-to-existing), otherwise the gateway's governed contract is written;
 *   - execution is delegated verbatim to the EXISTING unified entrypoint `odg mission <id>`
 *     (src/runtime/mission-cli.ts), so every downstream gate (action-gate, validation PARTIAL/BLOCKED,
 *     ledger proven-gate) is enforced exactly as for any other mission.
 * A governed boundary (AMBIGUOUS / BLOCKED / DENIED / ESCALATE_TO_HUMAN) STOPS before any execution and
 * reports what is needed — never a bypass, never a false DONE.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const gateway = require(path.join(__dirname, "..", "core", "nl-objective-gateway.js"));

const ROOT = path.resolve(__dirname, "..", "..");
const MISSIONS_DIR = path.join(ROOT, "runtime", "missions");

// ---- Bounded governed mission identity -----------------------------------------------------------
// ROOT CAUSE (CTO repair): the gateway's Mission Synthesizer labels its contract by slugging the WHOLE
// natural-language sentence (mission-synthesizer.fromRequest → slug(text)), so "audit the runtime
// state and report findings" became the mission id AUDIT_THE_RUNTIME_STATE_AND_REPORT_FINDINGS and
// every objective id inherited the sentence too. The raw user sentence is NOT a governed identifier.
//
// The seam — which owns the routing identity (it writes runtime/missions/<id>.json and runs
// `odg mission <id>`) — assigns a BOUNDED, deterministic identifier derived from the GOVERNED intent,
// never from the raw sentence: `NL_<MODE>_<sha256(normalizedObjective)[0..8]>`. Same intent ⇒ same id
// (DETERMINISM_FIRST, so resolve-to-existing is stable); the human-readable goal is preserved verbatim
// inside the contract (description / objective.goal / synthesizedFrom), only the IDENTIFIER is bounded.
function boundedMissionId(result) {
    const mode = (result && result.intent && result.intent.mode) || "UNKNOWN";
    const normalized = String((result && result.normalizedObjective) || "");
    const h = crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 8).toUpperCase();
    return `NL_${mode}_${h}`;
}

// Re-key the gateway's governed contract onto the bounded identifier WITHOUT changing its governed
// shape: objective goals / done_when / patch / authorized_paths / verify are preserved verbatim; only
// the mission id and the (sentence-derived) objective ids are re-based. `synthesizedFrom` keeps the
// gateway's readable label for traceability. This re-keys — it does not synthesize a second contract.
function toBoundedContract(result, boundedId) {
    const base = result.contract;
    const objectives = (Array.isArray(base.objectives) ? base.objectives : []).map((o, i) => ({
        ...o,
        id: `${boundedId}_${i + 1}`,
    }));
    return { ...base, mission: boundedId, objectives, synthesizedFrom: base.mission, nlObjective: result.normalizedObjective };
}

// Does the resolved contract declare a GENUINE mechanism to produce per-objective execution evidence?
// This is the deterministic guard behind the seam's SUCCESS verdict (CTO: "SUCCESS requires the
// requested objective(s) to have real execution evidence and validation"). Faithful to the runtime's
// own signals (validation-engine.js:66 — authorized_paths is the engineering/applied-effect class
// signal; objective-evidence.ts — verify[].evidence is the declared evidence binding). A contract with
// neither CANNOT prove its objective was executed, so a green pipeline over it is not proof of SUCCESS.
function contractHasEvidenceBinding(contract) {
    if (!contract || typeof contract !== "object") return false;
    const paths = contract.authorized_paths != null ? contract.authorized_paths : contract.authorizedPaths;
    if (Array.isArray(paths) && paths.length > 0) return true;
    const verify = contract.verify;
    if (Array.isArray(verify) && verify.some((v) => v && typeof v.evidence === "string" && v.evidence.length > 0)) return true;
    return false;
}

// Map the governed pipeline's real terminal exit code + the resolved contract to an HONEST semantic
// verdict. A green pipeline (exit 0) is NEVER enough on its own (CTO: "Never report SUCCESS merely
// because the 13 pipeline stages ran"): SUCCESS also requires a declared evidence binding so that the
// pipeline's own validation gate was actually proving the requested objective. Otherwise the outcome
// is PARTIAL / BLOCKED with the exact reason — never a false DONE. Pure: no side effects.
function classifyOutcome(decision, pipelineExit) {
    if (pipelineExit !== 0) {
        return {
            verdict: "BLOCKED",
            code: 3,
            reason: `Governed pipeline did not validate (exit ${pipelineExit}); the requested objective is NOT proven.`,
        };
    }
    if (!contractHasEvidenceBinding(decision.contract)) {
        return {
            verdict: "PARTIAL",
            code: 3,
            reason:
                "NO_OBJECTIVE_EVIDENCE_BINDING: the governed pipeline ran green but the resolved mission declares no authorized_paths and no verify-evidence, so a green run does NOT prove the requested objective was executed. Resolve to an evidenced governed mission, or declare authorized_paths / verify evidence, to obtain SUCCESS.",
        };
    }
    return {
        verdict: "SUCCESS",
        code: 0,
        reason: "Requested objective routed to the governed pipeline, which validated it (exit 0) against a declared evidence binding.",
    };
}

// Pure decision: compile the NL objective through the governed gateway and map its status to a routing
// decision. NO side effects (the gateway itself is pure). Reuses the gateway verbatim — invents nothing.
// A clean projection is re-keyed onto a BOUNDED governed identifier (never the raw sentence).
function decide(raw, opts) {
    const result = gateway.compile(raw, opts || {});
    if (result.status === "AMBIGUOUS") {
        return { action: "ASK", status: result.status, question: result.ambiguity && result.ambiguity.question, result };
    }
    if (result.status === "READY_DRY_RUN") {
        const mission = boundedMissionId(result);
        return { action: "EXECUTE", status: result.status, mission, contract: toBoundedContract(result, mission), result };
    }
    // DENIED / ESCALATE_TO_HUMAN / BLOCKED — a governed boundary. Never execute; report what blocks.
    return { action: "STOP", status: result.status, blockers: result.blockers || [], recovery: result.recovery, result };
}

// Materialize the resolved mission to a contract file through the EXISTING on-demand lifecycle
// (runtime/missions/<id>.json, gitignored). An EXISTING contract is reused (never clobbered); otherwise
// the gateway's governed contract is written. io is injectable for tests. Returns { missionFile, reused }.
function materializeContract(decision, io) {
    const existsSync = (io && io.existsSync) || fs.existsSync;
    const writeFileSync = (io && io.writeFileSync) || fs.writeFileSync;
    const mkdirSync = (io && io.mkdirSync) || fs.mkdirSync;
    const file = path.join(MISSIONS_DIR, decision.mission + ".json");
    if (existsSync(file)) return { missionFile: file, reused: true };
    mkdirSync(MISSIONS_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(decision.contract, null, 2));
    return { missionFile: file, reused: false };
}

// Route a governed mission to EXECUTION through the EXISTING unified entrypoint (odg mission → mission-cli).
// No second runtime/authority: all governance gates are enforced there. Returns the pipeline's exit code.
function route(mission, io) {
    const spawn = (io && io.spawnSync) || spawnSync;
    const r = spawn("node_modules/.bin/tsx", ["src/runtime/mission-cli.ts", mission], { stdio: "inherit", cwd: ROOT });
    return typeof r.status === "number" ? r.status : 1;
}

// Orchestrate the seam. execute=false (default) ⇒ dry-run JSON print only (behaviour preserved exactly).
function run(raw, opts, io) {
    const execute = !!(opts && opts.execute);
    const log = (io && io.log) || console.log;

    if (!execute) {
        const decision = decide(raw, {});
        const out = (io && io.print) || ((s) => process.stdout.write(s));
        // Surface the BOUNDED routing identity alongside the gateway's dry-run projection, so the
        // projection shows the governed mission id that --execute would route (never the raw sentence).
        const projection = decision.mission ? { ...decision.result, resolvedMission: decision.mission } : decision.result;
        out(JSON.stringify(projection, null, 2) + "\n");
        return decision.status === "READY_DRY_RUN" ? 0 : 2;
    }

    const decision = decide(raw, {});
    log(`Intent     : ${raw}`);
    log(`Resolved   : ${decision.mission || "(none)"}`);
    log(`Status     : ${decision.status}`);

    if (decision.action === "ASK") {
        log(`Need info  : ${decision.question || "clarify the business goal, target and deadline."}`);
        return 2;
    }
    if (decision.action === "STOP") {
        log("Governed boundary — NOT executed:");
        for (const b of decision.blockers) log(`  - ${b.code}${b.objective ? " [" + b.objective + "]" : ""}: ${b.detail}`);
        if (decision.recovery) log(`Recovery   : ${decision.recovery}`);
        return 2;
    }

    // EXECUTE — resolve to a governed contract (existing reused, else bounded synthesis), then delegate
    // to the existing governed pipeline. The seam does NOT trust the pipeline exit alone: it maps the
    // real terminal code + the contract's evidence binding to an honest verdict (SUCCESS only when the
    // objective was validated against a real evidence binding; else PARTIAL / BLOCKED with the reason).
    const mat = materializeContract(decision, io);
    log(`Mission    : ${decision.mission} (${mat.reused ? "existing governed contract reused" : "contract synthesized on-demand"})`);
    log(`Route      : odg mission ${decision.mission}  (governed pipeline — all gates enforced)`);
    log("======================================");
    const pipelineExit = route(decision.mission, io);
    const outcome = classifyOutcome(decision, pipelineExit);
    log("======================================");
    log(`Verdict    : ${outcome.verdict}`);
    log(`Reason     : ${outcome.reason}`);
    return outcome.code;
}

module.exports = { decide, materializeContract, route, run, boundedMissionId, toBoundedContract, contractHasEvidenceBinding, classifyOutcome };

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
    const args = process.argv.slice(2);
    const execute = args.includes("--execute") || args.includes("--run");
    const raw = args.filter((a) => a !== "--execute" && a !== "--run").join(" ");
    if (!raw.trim()) {
        process.stderr.write('Usage: odg objective "<natural-language objective>" [--execute]\n');
        process.exit(2);
    }
    process.exit(run(raw, { execute }, null));
}
