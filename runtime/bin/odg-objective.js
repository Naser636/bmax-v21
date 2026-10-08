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
const authz = require(path.join(__dirname, "..", "core", "capability-authorization.js"));

const ROOT = path.resolve(__dirname, "..", "..");
const MISSIONS_DIR = path.join(ROOT, "runtime", "missions");
const GENERATED_DIR = path.join(ROOT, "runtime", "generated");

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
    const objs = contract.objectives;
    if (Array.isArray(objs) && objs.some((o) => o && typeof o.proof === "string" && o.proof.length > 0)) return true;
    return false;
}

// Map the governed pipeline's real terminal exit code + the resolved contract to an HONEST semantic
// verdict. A green pipeline (exit 0) is NEVER enough on its own (CTO: "Never report SUCCESS merely
// because the 13 pipeline stages ran"): SUCCESS also requires a declared evidence binding so that the
// pipeline's own validation gate was actually proving the requested objective. Otherwise the outcome
// is PARTIAL / BLOCKED with the exact reason — never a false DONE. Pure: no side effects.
function classifyOutcome(decision, pipelineExit) {
    // VALIDATED_PENDING_COMMIT (governed pipeline exit 20): the objective was EXECUTED, VALIDATED and
    // recorded PROVEN, and the engineering deliverable lies ENTIRELY within authorized_paths but is not
    // yet committed. This is NOT a failure and NOT a fabricated SUCCESS — it faithfully reports that the
    // work is proven and awaits the HUMAN commit gate (ODG never auto-commits; gitClean is not weakened).
    if (pipelineExit === 20) {
        return {
            verdict: "VALIDATED_PENDING_COMMIT",
            code: 10,
            reason: "The requested objective was executed, validated and recorded PROVEN; the engineering deliverable is within authorized_paths and awaits the HUMAN commit gate (ODG never auto-commits). Commit the authorized change to reach a clean terminal SUCCESS.",
        };
    }
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
// (runtime/missions/<id>.json, gitignored). io is injectable for tests. Returns { missionFile, reused,
// rewritten }.
//
// Resolve-to-existing reuse is correct for a PURE (read-only, no-grant) re-run of the same intent — same
// id ⇒ same contract ⇒ idempotent. But when a FRESH human grant was applied (`force`), the resolved
// contract now carries THIS grant's authorization/scope/edit, which may differ from a stale contract
// left by an earlier run of the same intent. Silently reusing the stale file would IGNORE the new grant
// (observed defect). So a grant-bearing decision ALWAYS re-materializes the current contract (grant
// rotation). The fresh grant was already fail-closed validated upstream (mission-bind/expiry/scope), so
// this never writes an unauthorized contract; it only ensures the file reflects the grant actually used.
function materializeContract(decision, io, force) {
    const existsSync = (io && io.existsSync) || fs.existsSync;
    const writeFileSync = (io && io.writeFileSync) || fs.writeFileSync;
    const mkdirSync = (io && io.mkdirSync) || fs.mkdirSync;
    const file = path.join(MISSIONS_DIR, decision.mission + ".json");
    const exists = existsSync(file);
    if (exists && !force) return { missionFile: file, reused: true };
    mkdirSync(MISSIONS_DIR, { recursive: true });
    writeFileSync(file, JSON.stringify(decision.contract, null, 2));
    return { missionFile: file, reused: false, rewritten: exists };
}

// Route a governed mission to EXECUTION through the EXISTING unified entrypoint (odg mission → mission-cli).
// No second runtime/authority: all governance gates are enforced there. Returns the pipeline's exit code.
function route(mission, io) {
    const spawn = (io && io.spawnSync) || spawnSync;
    const r = spawn("node_modules/.bin/tsx", ["src/runtime/mission-cli.ts", mission], { stdio: "inherit", cwd: ROOT });
    return typeof r.status === "number" ? r.status : 1;
}

// The consequential capabilities the gateway resolved for this decision, each as an authorization
// REQUEST (capability + current mission + objective). READ-ONLY capabilities are absent — they never
// pass through the human-authorization seam. Derived from the gateway's own per-objective capability
// resolution (decision.result.objectives); the raw sentence is never read here.
function consequentialRequests(decision) {
    const objectives = (decision.result && decision.result.objectives) || [];
    const out = [];
    objectives.forEach((p, i) => {
        const capability = p && p.capability && p.capability.chosen && p.capability.chosen.capability;
        if (capability && authz.isConsequentialCapability(capability)) {
            out.push({ index: i, capability, objectiveId: (p.objective && p.objective.id) || null });
        }
    });
    return out;
}

// Normalize the human-authorization input into a list of candidate grants. A mixed mission may carry
// several objectives with DIFFERENT authorizations, so the grant input is a COLLECTION: either a single
// grant object (back-compat) or an array of grants. Non-objects are dropped (fail-closed). Absent ⇒ [].
function normalizeGrants(grantOrGrants) {
    if (Array.isArray(grantOrGrants)) return grantOrGrants.filter((g) => g && typeof g === "object");
    return grantOrGrants && typeof grantOrGrants === "object" ? [grantOrGrants] : [];
}

// Authorize ONE consequential objective against the supplied grants. Each grant is passed verbatim to the
// governed validator (capability-authorization → action-gate), which enforces capability/mission/scope/
// expiry/revocation itself. Grants whose declared capability matches the request are tried FIRST (their
// denial is the most informative), then the rest; the first ALLOW wins. With exactly one grant this is
// byte-identical to the prior single-grant behaviour. No grant at all ⇒ the validator's NO_AUTHORIZATION
// (fail-closed). A grant authorizes ONLY the one objective it matches — never all of them.
function authorizeOne(request, grants, now) {
    const req = { capability: request.capability, mission: request.mission, requestedScope: {} };
    if (grants.length === 0) return authz.authorizeCapability(req, null, { now });
    const ordered = [
        ...grants.filter((g) => g.capability === request.capability),
        ...grants.filter((g) => g.capability !== request.capability),
    ];
    let firstDeny = null;
    for (const g of ordered) {
        const d = authz.authorizeCapability(req, g, { now });
        if (d.decision === "ALLOW") return d;
        if (!firstDeny) firstDeny = d; // the capability-matching denial, when present, is the most precise
    }
    return firstDeny;
}

// Apply the EXPLICIT human-authorization grant(s) (NEVER synthesized from the sentence) to each
// consequential objective. An objective whose capability is authorized is bound to its evidence probe
// and carries the grant to the governed executor; an unauthorized one stays unbound and BLOCKED (fail-
// closed) so the downstream per-action gate keeps it PARTIAL while any authorized objective proceeds.
// `grantOrGrants` is a single grant (back-compat) OR a list, so a MIXED mission can authorize several
// objectives — each with its OWN grant — in one invocation. Returns { authorizations, blockers } and
// records the authorization decisions as evidence.
function applyAuthorization(decision, grantOrGrants, now) {
    const requests = consequentialRequests(decision);
    const grants = normalizeGrants(grantOrGrants);
    const verify = Array.isArray(decision.contract.verify) ? decision.contract.verify.slice() : [];
    const authorizations = [];
    const blockers = [];
    for (const r of requests) {
        // Match this objective to its OWN grant among the supplied grants (capability-matching first).
        // A grant that matches one objective's capability authorizes ONLY that one; others fail closed,
        // so a mixed mission drives authorized + unauthorized objectives together (⇒ PARTIAL downstream).
        const d = authorizeOne({ capability: r.capability, mission: decision.mission }, grants, now);
        if (d.decision === "ALLOW") {
            // Bind the EXISTING capability executor: assign the objectiveId the executor matches (its
            // dispatch PREFIX, derived from the resolved capability identity — NOT from the sentence) and
            // bind the probe that verifies real objective evidence. ODG defaults to the capability's SAFE
            // (non-destructive, dry-run) probe when it has one; the capability spec/parameters come from
            // the human grant's scope, never invented here. Absent a safe probe (git/bash), the LIVE probe
            // is bound and the safe-mode run honestly cannot reach SUCCESS (fail-closed, reported).
            // Governed Source Edit — a bounded local file WRITE. The human grant's scope carries the
            // authorized paths AND the concrete edit; ODG applies them via the EXISTING Patch Executor
            // (local pipeline) under an action-contract that ENFORCES the human authority at apply time.
            // The sentence never produces the edit. authorized_paths is the evidence-class signal.
            if (r.capability === "Governed Source Edit") {
                const binding = authz.buildSourceEditBinding(d.evidence.scope, d.authority);
                const obj = decision.contract.objectives[r.index];
                if (binding && obj) {
                    decision.contract.authorized_paths = binding.authorized_paths;
                    decision.contract.requires_engineering = true;
                    obj.patch = binding.patch;
                    obj.actionContract = binding.actionContract;
                    obj.authorization = { capability: r.capability, mission: decision.mission, issuer: d.evidence.issuer, scope: d.evidence.scope, expiresAt: d.evidence.expiresAt, execute: true, human: true, mode: "GOVERNED_EDIT" };
                    authorizations.push({ ...d.evidence, boundProbe: null, dispatchObjectiveId: obj.id, engineering: true });
                } else {
                    blockers.push({ code: "MALFORMED_EDIT_GRANT", capability: r.capability, objective: r.objectiveId, detail: "grant scope must carry authorized_paths and at least one concrete edit (target + content/diff)" });
                }
                continue;
            }
            // A LIVE grant (the human explicitly set scope.live) binds the capability's LIVE probe (real
            // evidence); otherwise the non-destructive SAFE dry-run probe. The sentence never sets live.
            const live = !!(d.evidence && d.evidence.scope && d.evidence.scope.live === true);
            const chosenProbe = live ? d.probe : (d.safeProbe || d.probe);
            const obj = decision.contract.objectives[r.index];
            // Build the EXISTING capability-executor spec STRICTLY from the human grant's scope (the
            // privileged parameters come from the human, never the sentence) so it can be transported to
            // the executor. carried verbatim as { field, value } under obj.capabilitySpec.
            const execSpec = authz.buildExecutorSpec(r.capability, d.evidence.scope);
            if (obj) {
                if (d.executorPrefix) obj.id = `${d.executorPrefix}_${r.index + 1}`;
                obj.proof = chosenProbe;
                obj.authorization = { capability: r.capability, mission: decision.mission, issuer: d.evidence.issuer, scope: d.evidence.scope, expiresAt: d.evidence.expiresAt, execute: true, human: true, boundProbe: chosenProbe, mode: live ? "LIVE" : "SAFE_DRY_RUN" };
                if (execSpec) obj.capabilitySpec = execSpec;
            }
            verify.push({ capability: r.capability, evidence: chosenProbe });
            authorizations.push({ ...d.evidence, boundProbe: chosenProbe, dispatchObjectiveId: obj ? obj.id : null, capabilitySpec: execSpec || null });
        } else {
            blockers.push({ code: d.code, capability: r.capability, objective: r.objectiveId, detail: d.detail });
        }
    }
    if (verify.length) decision.contract.verify = verify;
    return { requests, authorizations, blockers };
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

    // Consequential-capability gate: a consequential capability (git / bash / external research) may be
    // executed ONLY under an EXPLICIT human authorization grant supplied out-of-band (opts.authorize) —
    // NEVER manufactured from the natural-language sentence. Absent/invalid ⇒ the objective is BLOCKED
    // (fail-closed) and never routed to execution. The grant is validated by the governed transport seam
    // (capability-authorization → action-gate), and exactly what was authorized is recorded as evidence.
    const consequential = consequentialRequests(decision);
    let grantApplied = false;
    if (consequential.length > 0) {
        const grant = opts && opts.authorize ? opts.authorize : null;
        const now = opts && Number.isFinite(opts.now) ? opts.now : Date.now();
        const authResult = applyAuthorization(decision, grant, now);
        grantApplied = authResult.authorizations.length > 0;
        if (authResult.authorizations.length > 0) {
            const evFile = path.join(GENERATED_DIR, `capability-authorization-${decision.mission}.json`);
            const writeFileSync = (io && io.writeFileSync) || fs.writeFileSync;
            const mkdirSync = (io && io.mkdirSync) || fs.mkdirSync;
            mkdirSync(GENERATED_DIR, { recursive: true });
            writeFileSync(evFile, JSON.stringify({ mission: decision.mission, authorizations: authResult.authorizations }, null, 2));
            for (const a of authResult.authorizations) log(`Authorized : ${a.capability} for ${a.mission} (issuer ${a.issuer}, expires ${a.expiresAt}) — evidence recorded`);
        }
        if (authResult.blockers.length > 0) {
            log("Consequential capability NOT authorized — human authorization required (not synthesized from the sentence):");
            for (const b of authResult.blockers) log(`  - ${b.code} [${b.capability}${b.objective ? " / " + b.objective : ""}]: ${b.detail}`);
            // Fail-closed: no authorized objective to route ⇒ BLOCKED before any execution. (When some
            // objectives ARE authorized, routing continues; the unauthorized ones remain unbound ⇒ PARTIAL.)
            if (authResult.authorizations.length === 0) {
                log(`Recovery   : supply an explicit human authorization grant: --authorize '{"capability":"<cap>","mission":"${decision.mission}","scope":{...},"expiresAt":<ms>,"execute":true,"human":true}'`);
                log("======================================");
                log("Verdict    : BLOCKED");
                log("Reason     : consequential capability requires an explicit human authorization that ODG must not self-create.");
                return 2;
            }
        }
    }

    // EXECUTE — resolve to a governed contract (existing reused, else bounded synthesis), then delegate
    // to the existing governed pipeline. The seam does NOT trust the pipeline exit alone: it maps the
    // real terminal code + the contract's evidence binding to an honest verdict (SUCCESS only when the
    // objective was validated against a real evidence binding; else PARTIAL / BLOCKED with the reason).
    // A fresh human grant (grantApplied) forces re-materialization so a stale contract from an earlier
    // run of the SAME intent can never silently override the current grant (grant rotation, P2 fix).
    const mat = materializeContract(decision, io, grantApplied);
    log(`Mission    : ${decision.mission} (${mat.rewritten ? "contract re-materialized for the fresh grant" : mat.reused ? "existing governed contract reused" : "contract synthesized on-demand"})`);
    log(`Route      : odg mission ${decision.mission}  (governed pipeline — all gates enforced)`);
    log("======================================");
    const pipelineExit = route(decision.mission, io);
    const outcome = classifyOutcome(decision, pipelineExit);
    log("======================================");
    log(`Verdict    : ${outcome.verdict}`);
    log(`Reason     : ${outcome.reason}`);
    return outcome.code;
}

module.exports = { decide, materializeContract, route, run, boundedMissionId, toBoundedContract, contractHasEvidenceBinding, classifyOutcome, consequentialRequests, applyAuthorization, normalizeGrants, authorizeOne, parseAuthorize };

// Parse an EXPLICIT human-authorization grant from the CLI: `--authorize '<json>'` or `--authorize @file`.
// This is the out-of-band human channel; the grant is NEVER derived from the objective sentence. A
// MIXED mission with several objectives/authorizations is supported by (a) repeating `--authorize` once
// per grant, and/or (b) a single `--authorize '[...]'` JSON array. Each value may also be `@file`. The
// collected grants are returned as a list together with the arg INDEXES consumed (flag + its value), so
// the CLI can strip them all from the natural-language sentence (not just the first). A malformed value
// fails closed — that grant is skipped (⇒ its consequential capability stays BLOCKED) — but its indexes
// are still consumed so a broken JSON blob never leaks into the sentence.
function parseAuthorize(args) {
    const grants = [];
    const consumed = new Set();
    for (let i = 0; i < args.length; i++) {
        if (args[i] !== "--authorize" || i + 1 >= args.length) continue;
        consumed.add(i);
        consumed.add(i + 1);
        let raw = args[i + 1];
        try {
            if (raw.startsWith("@")) raw = fs.readFileSync(raw.slice(1), "utf8");
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) grants.push(...parsed.filter((g) => g && typeof g === "object"));
            else if (parsed && typeof parsed === "object") grants.push(parsed);
        } catch {
            /* malformed ⇒ skip this grant (fail-closed); its indexes stay consumed */
        }
    }
    // Back-compat: a single grant is returned as the lone object; multiple ⇒ the list. null ⇒ none.
    const authorize = grants.length === 0 ? null : grants.length === 1 ? grants[0] : grants;
    return { authorize, consumed };
}

// ---- CLI ---------------------------------------------------------------------------------------
if (require.main === module) {
    const args = process.argv.slice(2);
    const execute = args.includes("--execute") || args.includes("--run");
    const { authorize, consumed } = parseAuthorize(args);
    const control = new Set(["--execute", "--run"]);
    const raw = args.filter((a, i) => !consumed.has(i) && !control.has(a)).join(" ");
    if (!raw.trim()) {
        process.stderr.write('Usage: odg objective "<natural-language objective>" [--execute] [--authorize \'<grant-json>\'|@file ...]\n');
        process.exit(2);
    }
    process.exit(run(raw, { execute, authorize }, null));
}
