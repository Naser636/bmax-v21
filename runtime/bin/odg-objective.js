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
const { spawnSync } = require("child_process");
const gateway = require(path.join(__dirname, "..", "core", "nl-objective-gateway.js"));

const ROOT = path.resolve(__dirname, "..", "..");
const MISSIONS_DIR = path.join(ROOT, "runtime", "missions");

// Pure decision: compile the NL objective through the governed gateway and map its status to a routing
// decision. NO side effects (the gateway itself is pure). Reuses the gateway verbatim — invents nothing.
function decide(raw, opts) {
    const result = gateway.compile(raw, opts || {});
    if (result.status === "AMBIGUOUS") {
        return { action: "ASK", status: result.status, question: result.ambiguity && result.ambiguity.question, result };
    }
    if (result.status === "READY_DRY_RUN") {
        return { action: "EXECUTE", status: result.status, mission: result.contract.mission, contract: result.contract, result };
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
        out(JSON.stringify(decision.result, null, 2) + "\n");
        return decision.status === "READY_DRY_RUN" ? 0 : 2;
    }

    const decision = decide(raw, {});
    log(`Intent     : ${raw}`);
    log(`Resolved   : ${decision.result.contract ? decision.result.contract.mission : "(none)"}`);
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

    // EXECUTE — resolve to a governed contract, then delegate to the existing governed pipeline.
    const mat = materializeContract(decision, io);
    log(`Mission    : ${decision.mission} (${mat.reused ? "existing governed contract reused" : "contract synthesized on-demand"})`);
    log(`Route      : odg mission ${decision.mission}  (governed pipeline — all gates enforced)`);
    log("======================================");
    return route(decision.mission, io);
}

module.exports = { decide, materializeContract, route, run };

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
