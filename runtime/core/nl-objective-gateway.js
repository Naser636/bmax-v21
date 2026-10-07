#!/usr/bin/env node

/*
 * Natural-Language Objective Gateway — DRY-RUN compiler for "parler naturellement à ODG".
 *
 * WHAT THIS IS
 *   The missing SEAM between an existing-but-orphaned compile half and the existing governed runtime:
 *   it accepts a user's raw natural-language objective and compiles it, through EXISTING governed
 *   mechanisms, into the full governed projection the Master's Universal Resolution Loop describes:
 *
 *     Natural Language → Intent → Objective → Requirements → Dependencies → Capabilities →
 *     Mission Contract → Authority → Policy → Risk → Workgraph → (planned) Execution →
 *     Verification → Evidence → Result
 *
 * WHAT IT IS NOT (hard invariants — the runtime stays authoritative, the LLM is never the authority)
 *   - It performs NO execution. It is DRY-RUN by default and refuses live execution (see `execute`).
 *   - It makes ZERO provider calls, ZERO network calls and ZERO external writes. It never mutates the
 *     repository, the ledger, or any durable state. It only READS local governance files (as the
 *     Governance Kernel already does) and returns a plain object.
 *   - It invents no authority, no policy and no 10th primitive. Authority/Policy/Risk admission is
 *     DELEGATED to the existing deterministic gate (runtime/core/action-gate.js), authority to the
 *     existing Governance Kernel (runtime/core/governance-kernel.js), the Mission Contract to the
 *     existing Mission Synthesizer (runtime/core/mission-synthesizer.js, the Mission-Loader schema),
 *     and capability resolution to the existing Capability Router (runtime/core/capability-router.js).
 *   - It never claims a result is EXECUTED / VERIFIED / CERTIFIED. A dry-run abstains fail-closed with
 *     a structured blocker whenever a stage cannot be satisfied without an external effect.
 *
 * THE ONLY GENUINELY NEW BEHAVIOUR is a small, deterministic Risk / External-Effect classifier
 * (`classifyObjective`) — the one governance stage the audit proved had no owner. It is pure and
 * keyword-driven, so an identical objective always classifies identically (DETERMINISM_FIRST).
 *
 * Pure: no clock, no randomness, no network. `compile()` returns a plain object; same input ⇒ same
 * output (there are no timestamps in the result, so repeated identical objectives are idempotent).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const synth = require("./mission-synthesizer");       // NL → Mission-Loader contract (existing)
const router = require("./capability-router");         // objective → capability tier plan (existing)
const gate = require("./action-gate");                 // deterministic POLICY/AUTHORITY/RISK admission (existing)
const kernel = require("./governance-kernel");         // state-machine authorization (existing)
const assembler = require("./expert-profile-assembler"); // durable profile → mission-scoped §303 Expert Instance (existing, read-only)

const ROOT = path.resolve(__dirname, "..", "..");
const PROVIDER_POLICY_PATH = path.join(ROOT, "runtime", "config", "provider-policy.json");
const RUNTIME_POLICIES_PATH = path.join(ROOT, "runtime", "policies", "runtime-policies.json");

// ---- Intent derivation (mirrors src/runtime/mission-intent.ts defaults; deterministic) ----------
const MODE_SIGNALS = [
    ["ANALYZE", ["analyze", "analyse", "audit", "investigate", "assess", "review", "find", "explore", "research", "discover"]],
    ["PLAN", ["plan", "design", "roadmap", "strategize", "propose"]],
    ["IMPLEMENT", ["implement", "build", "add", "create", "write", "fix", "refactor", "wire", "integrate", "develop"]],
    ["VALIDATE", ["validate", "verify", "test", "check", "certify"]],
    ["LEARN", ["learn", "train", "study"]],
];
const HIGH_PRIORITY_SIGNALS = ["urgent", "asap", "immediately", "critical", "now", "best"];

function deriveIntent(mission, normalized) {
    const g = String(normalized || "").toLowerCase();
    let mode = "UNKNOWN";
    for (const [m, kws] of MODE_SIGNALS) {
        if (kws.some((k) => g.includes(k))) { mode = m; break; }
    }
    const priority = HIGH_PRIORITY_SIGNALS.some((k) => g.includes(k)) ? "HIGH" : "NORMAL";
    return { mission, type: "GENERIC", objective: normalized, priority, mode };
}

// ---- Normalization ------------------------------------------------------------------------------
function normalizeObjective(text) {
    return String(text == null ? "" : text).replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "").trim();
}

// ---- Requirements & constraints (deterministic extraction from the compiled contract + goal) -----
// Requirements come from the governed contract's definition_of_done (no fabrication); constraints are
// explicit negative/limiting clauses found in the objective text.
const CONSTRAINT_SIGNALS = [/\bwithout\b[^.,;]*/gi, /\bmust not\b[^.,;]*/gi, /\bno\s+\w+[^.,;]*/gi, /\bonly\b[^.,;]*/gi, /\bnever\b[^.,;]*/gi];
function extractConstraints(normalized) {
    const out = [];
    for (const re of CONSTRAINT_SIGNALS) {
        const matches = String(normalized).match(re);
        if (matches) for (const m of matches) { const s = m.trim(); if (s && !out.includes(s)) out.push(s); }
    }
    return out;
}

// ---- Risk / External-Effect classifier (THE one new governance stage) ---------------------------
// Keyword-driven and deterministic. Severity order is fixed; the first matching family wins so a
// single objective maps to exactly one external-effect family, one action class and one risk level.
const EFFECT_FAMILIES = [
    // family,          signals,                                                                   actionClass,   risk,       reversibility, requiresExternal, requiresHuman
    ["DESTRUCTIVE", ["delete file", "delete the", "drop table", "drop database", "truncate", "wipe", "destroy", "erase ", "purge ", "rm -rf"], "DELETE", "CRITICAL", "R4", false, true],
    // NOTE: the bare word "transaction" is deliberately NOT a FINANCIAL signal. Like "current" below,
    // it over-matched non-financial senses ("transactional" source repair, a DB/git "transaction log")
    // and wrongly escalated local/ambiguous objectives to TRANSACT/CRITICAL/R4. Genuine money movement
    // is already carried by the explicit verbs (pay/charge/transfer money/withdraw/deposit/invoice/…),
    // so "transaction" only escalates when qualified as a money transaction (financial/payment/…).
    ["FINANCIAL", ["pay ", "buy ", "purchase", "sell ", "invoice", "charge ", "transfer money", "payment", "financial transaction", "payment transaction", "money transaction", "bank transaction", "card transaction", "deposit", "withdraw", "spend "], "TRANSACT", "CRITICAL", "R4", true, true],
    ["DEPLOY", ["deploy", "release to production", "ship to production", "publish to", "go live", "push to prod"], "IRREVERSIBLE", "HIGH", "R3", true, true],
    ["COMMUNICATE", ["email", "send ", "post to", "publish ", "notify", " message ", "contact ", "tweet", " dm "], "COMMUNICATE", "HIGH", "R2", true, false],
    // NOTE: the bare word "current" is deliberately NOT a NETWORK signal. It over-matched local
    // repository reads ("current repository state" / "current repo state") — a V7 reliquat. True
    // "need live external data" intent is already carried by "live data" / "real-time" plus the
    // concrete transport signals (online/internet/web/http/url/fetch/download/scrape/crawl), so the
    // mere presence of "current" never alone classifies a request NETWORK.
    ["NETWORK", ["online", "internet", " web", "scrape", "crawl", "fetch ", "download", "http", "url", "market", "opportunit", "browse", "search the", "live data", "real-time"], "ANALYZE", "MEDIUM", "R0", true, false],
];

// ---- Capability → registered evidence probe binding --------------------------------------------
// Maps a RESOLVED local capability (capability-router → decision-rules) to the EXISTING capability-
// probes probe that machine-verifies its outcome. Declaring it in the synthesized contract turns a
// read-only no-op objective into a genuinely verifiable one: the objective-evidence / Validation
// Engine gate then REQUIRES that probe to pass (fail-closed), closing Mission → Capability →
// Execution → Evidence for a natural-language intent. Reuses EXISTING probe names only (no new probe).
//
// ONLY read-only capabilities whose executor runs WITHOUT a human-authorized transport are auto-bound.
// A consequential capability (Governed Git Branch Integration / Governed Bash/Linux Command / External
// Research Acquisition) self-gates deny-by-default and REQUIRES a human authorization carried on the
// objective — a natural-language sentence can never self-authorize it (no-self-authorization), so it is
// deliberately NOT auto-bound here. Those remain reachable only through an explicitly-authored mission.
const CAPABILITY_PROBE = {
    "Connectivity Audit": "internet-reachable",
};
function probeForCapability(capability) {
    return (capability && CAPABILITY_PROBE[capability]) || null;
}

function classifyObjective(goal) {
    const g = String(goal || "").toLowerCase();
    for (const [family, signals, actionClass, risk, reversibility, requiresExternal, requiresHuman] of EFFECT_FAMILIES) {
        if (signals.some((s) => g.includes(s))) {
            return { externalEffect: family, actionClass, risk, reversibility, requiresExternal, requiresHuman };
        }
    }
    // No outward-effect signal ⇒ a safe, local, observational/generative objective.
    return { externalEffect: "NONE", actionClass: "GENERATE", risk: "LOW", reversibility: "R0", requiresExternal: false, requiresHuman: false };
}

// ---- Ambiguity (ask for missing BUSINESS information only — never internal ODG commands) ---------
function detectAmbiguity(normalized) {
    const words = normalized.split(/\s+/).filter(Boolean);
    if (normalized.length === 0) {
        return { ambiguous: true, reason: "EMPTY_OBJECTIVE", question: "What outcome do you want? Describe the business goal, the target (market / audience / system), and any budget or deadline." };
    }
    if (words.length < 2) {
        return { ambiguous: true, reason: "UNDERSPECIFIED_OBJECTIVE", question: "That is too broad to act on. What specifically should be achieved, for whom, and by when?" };
    }
    return { ambiguous: false, reason: null, question: null };
}

// ---- Read-only policy loads (local file reads only; NOT external/network calls) ------------------
function readJsonSafe(p) {
    try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}
function resolveExternalProvidersEnabled(opts) {
    if (opts && typeof opts.externalProvidersEnabled === "boolean") return opts.externalProvidersEnabled;
    const policy = readJsonSafe(PROVIDER_POLICY_PATH);
    return !!(policy && policy.externalProvidersEnabled === true);
}
function resolveGovernanceStrategy() {
    const policies = readJsonSafe(RUNTIME_POLICIES_PATH);
    return (policies && policies.governance && policies.governance.strategy) || "DETERMINISM_FIRST";
}

// ---- Workgraph (deterministic linear projection over the ordered objectives) --------------------
// This is a PLAN projection, not a second executor: it mirrors the positional LOAD → objectives →
// VERIFY → REPORT ordering the Mission Orchestrator already derives, so the dry-run shows the shape
// of the work without running anything.
function buildWorkgraph(objectives) {
    const nodes = ["LOAD", ...objectives.map((o) => o.id), "VERIFY", "REPORT"];
    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) edges.push({ from: nodes[i], to: nodes[i + 1] });
    return { nodes, edges };
}

// ---- The gateway --------------------------------------------------------------------------------
/**
 * compile(rawObjective, opts) -> GatewayResult (dry-run projection; no side effects).
 *
 * opts (all optional):
 *   execute            boolean — MUST be falsy. true is refused with a structured blocker; the gateway
 *                      never executes. Live execution goes through the existing governed CLI with human
 *                      authorization, not through this gateway.
 *   currentState       string  — mission lifecycle state for the Authority check (default "CREATED").
 *   allowedPolicies    string[]— policy keys the governance context permits (passed to action-gate).
 *   revokedAuthorities string[]— authority keys revoked in context (passed to action-gate).
 *   authority          string|object — authority basis to attach to consequential planned actions.
 *   missionAuthority   string[] — authority keys the mission already carries; bounds the Expert Instance
 *                      authority_scope (intersection only — never increases authority). Default [].
 *   externalProvidersEnabled boolean — override the provider-policy flag (else read from disk).
 */
function compile(rawObjective, opts) {
    opts = opts || {};
    const counters = { providerCalls: 0, externalCalls: 0, externalWrites: 0 };

    // The gateway is dry-run only in this increment: refuse live execution fail-closed.
    if (opts.execute === true) {
        return {
            mode: "DRY_RUN",
            rawObjective: String(rawObjective == null ? "" : rawObjective),
            status: "BLOCKED",
            blockers: [{ code: "LIVE_EXECUTION_NOT_PERMITTED", detail: "The NL gateway never executes. Run the authorized mission through the governed CLI (odg mission <NAME>) with human authorization." }],
            recovery: "ABSTAIN",
            ...counters,
        };
    }

    const normalized = normalizeObjective(rawObjective);

    // Stage A — Ambiguity: ask for business info only, never internal commands.
    const ambiguity = detectAmbiguity(normalized);
    if (ambiguity.ambiguous) {
        return {
            mode: "DRY_RUN",
            rawObjective: String(rawObjective == null ? "" : rawObjective),
            normalizedObjective: normalized,
            status: "AMBIGUOUS",
            ambiguity,
            recovery: "ASK_HUMAN",
            blockers: [],
            ...counters,
        };
    }

    // Stage B — Mission Contract via the EXISTING governed mechanism (Mission Synthesizer).
    const contract = synth.fromRequest(normalized);
    const strategy = resolveGovernanceStrategy();
    const externalProvidersEnabled = resolveExternalProvidersEnabled(opts);

    // Stage C — Intent, Requirements, Constraints.
    const intent = deriveIntent(contract.mission, normalized);
    const requirements = Array.isArray(contract.definition_of_done) ? contract.definition_of_done.slice() : [];
    const constraints = extractConstraints(normalized);

    // Stage D — Dependencies + Workgraph (deterministic linear projection over the ordered objectives).
    const workgraph = buildWorkgraph(contract.objectives);
    const dependencies = workgraph.edges;

    // Stages E–H — per-objective Capability resolution + Risk/External-effect + Policy/Authority/Risk admission.
    const blockers = [];
    const perObjective = contract.objectives.map((obj) => {
        // E — Capability resolution (existing router). EXTERNAL last-resort ⇒ no LOCAL capability.
        const routed = router.route({ goal: obj.goal, objectiveId: obj.id }, opts);
        const missingLocalCapability = routed.chosen.source === "EXTERNAL";

        // F — Risk / External-effect (the new deterministic classifier).
        const classification = classifyObjective(obj.goal);

        // G/H — Build the planned action and DELEGATE the admission decision to the existing gate.
        const action = {
            principal: "odg-nl-gateway",
            verb: intent.mode === "UNKNOWN" ? "PROCESS" : intent.mode,
            target: obj.id,
            actionClass: classification.actionClass,
            contract,
            policy: opts.policy || strategy,
            authority: opts.authority != null ? opts.authority : null,
            risk: classification.risk,
            reversibility: classification.reversibility,
        };
        if (gate.CONSEQUENTIAL_CLASSES.includes(classification.actionClass)) {
            // Consequential actions need a declared expected state transition; in a dry-run the next
            // governed step would be PLANNED → PREPARED. (Observational actions are not state-gated.)
            action.expectedTransition = {
                state_before: { lifecycle: "PLANNED" },
                action: "PREPARE",
                observed_effect: "mission prepared (dry-run projection)",
                state_after: { lifecycle: "PREPARED" },
                state_version_before: 1,
                state_version_after: 2,
                difference: { lifecycle: { before: "PLANNED", after: "PREPARED" } },
                evidence_refs: ["nl-objective-gateway:dry-run"],
                verification_status: "UNVERIFIED",
            };
        }
        const admission = gate.evaluateAction(action, {
            allowedPolicies: opts.allowedPolicies,
            revokedAuthorities: opts.revokedAuthorities,
        });

        // Per-objective blockers (fail-closed, deterministic).
        if (missingLocalCapability && !classification.requiresExternal) {
            blockers.push({ code: "MISSING_CAPABILITY", objective: obj.id, detail: `No local capability resolves "${obj.goal}" and no external effect was requested.` });
        }
        if (classification.requiresExternal && !externalProvidersEnabled) {
            blockers.push({ code: "EXTERNAL_PROVIDER_DISABLED_BY_POLICY", objective: obj.id, detail: `Objective needs an external effect (${classification.externalEffect}) but externalProvidersEnabled=false.` });
        }
        if (classification.requiresExternal && externalProvidersEnabled) {
            // Providers are enabled, but a dry-run never calls them: record the pending external effect.
            blockers.push({ code: "EXTERNAL_EFFECT_NOT_RUN_IN_DRY_RUN", objective: obj.id, detail: `Objective "${obj.goal}" would require an external ${classification.externalEffect} effect; dry-run does not perform it.` });
        }
        if (admission.decision === "DENY") {
            blockers.push({ code: "ADMISSION_DENIED", objective: obj.id, detail: admission.violations.join("; ") });
        }

        return {
            objective: obj,
            capability: { chosen: routed.chosen, plan: routed.plan, missingLocalCapability },
            classification,
            admission: { decision: admission.decision, checks: admission.checks, violations: admission.violations, escalation: admission.escalation },
        };
    });

    // Stage H.b — Evidence binding. Bind each objective's RESOLVED capability to its registered probe
    // (when one exists), so the synthesized contract declares a REAL, machine-checkable evidence
    // requirement instead of a tautological done_when. The binding is emitted both as the contract
    // `verify` block (objective-evidence + Validation Engine required-proof gate) and as the per-
    // objective `proof` (Validation Engine evaluateObjectiveProofs). A green pipeline over an unbound
    // objective can no longer read as SUCCESS; a bound objective passes only when its probe genuinely
    // verifies the capability's evidence. Pure: declares the requirement; it NEVER runs the probe here.
    const verify = [];
    perObjective.forEach((p, i) => {
        const probe = probeForCapability(p.capability.chosen.capability);
        if (probe && contract.objectives[i]) {
            contract.objectives[i].proof = probe;
            verify.push({ capability: p.capability.chosen.capability, evidence: probe });
        }
    });
    if (verify.length) contract.verify = verify;

    // Stage I — Authority (existing Governance Kernel: is a state transition permitted at all?).
    let authority;
    try {
        authority = kernel.authorizeMission(contract.mission, opts.currentState || "CREATED");
    } catch (e) {
        authority = { mission: contract.mission, authorized: false, error: String(e && e.message || e) };
    }
    if (!authority.authorized) {
        blockers.push({ code: "AUTHORITY_DENIED", detail: `No valid state transition from "${opts.currentState || "CREATED"}" for mission ${contract.mission}.` });
    }

    // Aggregate decision (deny-by-default precedence: DENY > ESCALATE > ALLOW).
    const decisions = perObjective.map((p) => p.admission.decision);
    const anyDeny = decisions.includes("DENY") || !authority.authorized;
    const anyEscalate = decisions.includes("ESCALATE");
    const admissionAggregate = anyDeny ? "DENY" : anyEscalate ? "ESCALATE" : "ALLOW";

    // Stage I.b — Expert binding (read-only §304→§303→§307). Compile a mission-scoped Expert Instance
    // from the durable profile the objective family indicates (FINANCIAL ⇒ ECONOMIC, else ENGINEERING;
    // reusing the existing classifier, no new one). Pure: reads profile JSON, executes nothing, and
    // grants NO authority — authority_scope is the intersection with the mission authority passed in
    // (opts.missionAuthority, default []); it is never self-granted from the profile (§307).
    let expert;
    try {
        const anyFinancial = perObjective.some((p) => p.classification.externalEffect === "FINANCIAL");
        const profileFile = anyFinancial ? "runtime/profiles/economic.json" : "runtime/profiles/engineering.json";
        const profile = assembler.loadProfile(profileFile);
        expert = assembler.compileInstance(profile, {
            mission_id: contract.mission,
            objective_id: (contract.objectives[0] && contract.objectives[0].id) || null,
            authority: Array.isArray(opts.missionAuthority) ? opts.missionAuthority : [],
            expected_output: requirements,
        });
    } catch (e) {
        expert = { error: String((e && e.message) || e) };
    }

    // Stage J — Result. A dry-run NEVER reports EXECUTED/VERIFIED/CERTIFIED.
    let status;
    let recovery = "NONE";
    if (admissionAggregate === "DENY") { status = "DENIED"; recovery = "ABSTAIN"; }
    else if (blockers.length > 0) { status = "BLOCKED"; recovery = "ABSTAIN"; }
    else if (admissionAggregate === "ESCALATE") { status = "ESCALATE_TO_HUMAN"; recovery = "ASK_HUMAN"; }
    else { status = "READY_DRY_RUN"; recovery = "NONE"; }

    return {
        mode: "DRY_RUN",
        rawObjective: String(rawObjective == null ? "" : rawObjective),
        normalizedObjective: normalized,
        intent,
        requirements,
        constraints,
        requestedCapabilities: perObjective.map((p) => p.capability.chosen.capability || p.capability.chosen.tier),
        dependencies,
        workgraph,
        contract,
        authority,
        policy: { strategy, externalProvidersEnabled, allowedPolicies: opts.allowedPolicies || null },
        objectives: perObjective,
        expert,
        admission: admissionAggregate,
        verification: "NOT_EXECUTED (dry-run)",
        evidence: "NONE (dry-run)",
        blockers,
        recovery,
        status,
        ...counters,
    };
}

module.exports = {
    compile,
    classifyObjective,
    normalizeObjective,
    deriveIntent,
    detectAmbiguity,
    extractConstraints,
    buildWorkgraph,
    probeForCapability,
    CAPABILITY_PROBE,
};

// ---- Read-only CLI: compile an objective and print the governed dry-run projection as JSON. ------
if (require.main === module) {
    const raw = process.argv.slice(2).join(" ");
    const result = compile(raw);
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    // Exit non-zero when the gateway abstains, so callers/CI can gate on a clean dry-run.
    const clean = result.status === "READY_DRY_RUN";
    process.exit(clean ? 0 : 2);
}
