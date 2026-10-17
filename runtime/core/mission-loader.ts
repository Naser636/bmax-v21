#!/usr/bin/env node

/*
 * Mission Loader — mission-driven.
 *
 * Loads the REAL mission contract from runtime/missions/<MISSION>.json and projects it into
 * runtime/generated/mission-plan.json for the downstream stages. It NO LONGER emits the generic
 * MASTER_PLAN capability list for every mission (the "generic replay" blockage): the objectives,
 * definition_of_done, completion, mode, priority and authorized paths all come from the mission's
 * own contract.
 *
 * When no contract exists the pipeline STOPS with an explicit, human-actionable blocker instead of
 * fabricating a generic "READY_FOR_EXECUTION" plan — so a mission can no longer be silently faked.
 *
 * Deterministic: the output is a pure function of the contract file (no wall-clock stamp), so an
 * identical mission produces an identical mission-plan.json (DETERMINISM_FIRST / reproducible).
 */

import * as fs from "fs";
import * as path from "path";
const budgetContract: any = require("./budget-contract");

const mission = process.argv[2];

if (!mission) {
    console.error("STOP: Missing mission name");
    process.exit(1);
}

const CONTRACT_PATH = path.join("runtime", "missions", `${mission}.json`);

if (!fs.existsSync(CONTRACT_PATH)) {
    // CONTRACT ON DEMAND (DYNAMIC_MISSION_CONTRACT_FACTORY). When governance authorizes it, an unknown
    // mission is no longer a hard blocker: the Mission Contract Factory synthesizes a complete,
    // Mission-Loader-conformant contract for it and the pipeline resumes immediately — no human
    // authoring, no closed list of pre-written contracts. The strict STOP below is preserved as the
    // fallback for a genuinely failed generation or when the policy disables on-demand generation.
    try {
        const factory: any = require("./mission-contract-factory");
        if (factory.isOnDemandEnabled(process.cwd())) {
            const result = factory.generateForMission(process.cwd(), mission, { write: true });
            if (result.generated && fs.existsSync(CONTRACT_PATH)) {
                console.log("======================================");
                console.log("MISSION LOADER — CONTRACT ON DEMAND");
                console.log("======================================");
                console.log(`No contract for "${mission}" — synthesized one automatically.`);
                console.log("Generated  :", result.path);
                console.log("Resuming the normal pipeline with the generated contract.");
                console.log("======================================");
            }
        }
    } catch (err: any) {
        // Never let the factory's absence/failure change behaviour: fall through to the strict STOP.
        console.error(`[mission-loader] Contract On Demand unavailable: ${err.message}`);
    }
}

if (!fs.existsSync(CONTRACT_PATH)) {
    console.error("======================================");
    console.error("MISSION LOADER");
    console.error("======================================");
    console.error(`BLOCKED: no mission contract for "${mission}".`);
    console.error(`Expected a real mission definition at: ${CONTRACT_PATH}`);
    console.error("The Runtime no longer replays a generic pipeline for undefined missions.");
    console.error("Author the mission contract (or enable Contract On Demand) and re-run.");
    console.error("======================================");
    process.exit(1);
}

let spec: any;
try {
    spec = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));
} catch (err: any) {
    console.error(`STOP: mission contract ${CONTRACT_PATH} is not valid JSON: ${err.message}`);
    process.exit(1);
}

// --- Normalize the contract's objectives into a single, stable shape -------
// A mission objective is either a plain string (goal only) or an object
// { id?, goal?, done_when? }. Both existing shapes in runtime/missions/*.json are supported.
function slug(value: any, fallback: any) {
    const s = String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    return s || fallback;
}

function asStrings(value: any) {
    return Array.isArray(value) ? value.filter((s: any) => typeof s === "string") : [];
}

const rawObjectives = Array.isArray(spec.objectives) ? spec.objectives : [];
const objectives = rawObjectives.map((o: any, i: number) => {
    if (typeof o === "string") {
        return { id: `${slug(mission, "OBJ")}_${i + 1}`, goal: o, done_when: [] };
    }
    const normalized: any = {
        id: typeof o.id === "string" ? o.id : `${slug(mission, "OBJ")}_${i + 1}`,
        goal: typeof o.goal === "string" ? o.goal : "",
        done_when: asStrings(o.done_when),
    };
    // Optional concrete edit payload for engineering objectives. Preserved verbatim so the
    // Patch Engine can turn a symbolic objective into a real, file-modifying patch. Absent on
    // legacy/read-only objectives, which stay symbolic (backward compatible).
    if (o.patch && typeof o.patch === "object") {
        normalized.patch = o.patch;
    }
    // Optional explicit Action Contract carrying the HUMAN authority for a consequential WRITE. Preserved
    // verbatim (transport only, never interpreted here) so the Patch Executor's action-gate ENFORCES the
    // human authority before any mutation. Absent on read-only/legacy objectives (backward compatible).
    if (o.actionContract && typeof o.actionContract === "object") {
        normalized.actionContract = o.actionContract;
    }
    // Optional OPT-IN per-objective proof binding (ObjectiveSpec.proof): the NAME of a registered
    // probe that independently verifies this objective. Carried verbatim so the Validation Engine's
    // objective-proof gate can consume it. Absent on objectives that declare none (backward compatible).
    if (typeof o.proof === "string" && o.proof) {
        normalized.proof = o.proof;
    }
    // Optional per-objective governance DECLARATION (CTO Phase-03): eligibility/authorization for the
    // autonomy DENOMINATOR only. TRANSPORT-ONLY — never interpreted here and NEVER a runtime permission:
    // the action-gate and authorized_paths still prove effective authorization before any action. Carried
    // verbatim ONLY when it is a plain object, so legacy contracts without it are byte-identical and a
    // malformed block flows to the measurer, which classifies it ambiguous (⇒ NON_MEASURABLE). The loader
    // never rejects a contract for lacking it.
    if (o.authorization && typeof o.authorization === "object" && !Array.isArray(o.authorization)) {
        normalized.authorization = o.authorization;
    }
    // Optional per-objective Governed Git Branch Integration spec (CTO Phase-03 Option A). TRANSPORT-ONLY —
    // carried verbatim toward the self-gating capability executor (git-branch-integration.js), EXACTLY like
    // the research_acquisition transport. Introduces NO authority/policy and NO default: the capability
    // self-gates (local, ff-only, dry-run unless execute===true, protected-branch rules) and FAILS CLOSED.
    // Absent ⇒ no key (every other mission byte-for-byte unaffected). Objective-level (per-patch), so it
    // survives the Decision Engine's verbatim objective passthrough and is read by the Patch Engine.
    if (o.git_branch_integration && typeof o.git_branch_integration === "object" && !Array.isArray(o.git_branch_integration)) {
        normalized.git_branch_integration = o.git_branch_integration;
    }
    return normalized;
});

if (objectives.length === 0) {
    console.error(`STOP: mission contract ${CONTRACT_PATH} declares no objectives.`);
    process.exit(1);
}

const authorizedPaths = asStrings(spec.authorized_paths ?? spec.authorizedPaths);
const requiresEngineering =
    spec.requires_engineering === true ||
    spec.requiresEngineering === true ||
    authorizedPaths.length > 0;

// CONTRACT-SUFFICIENCY GATE (CTO governed-mission enforcement): an ENGINEERING mission MUST declare an
// EXPLICIT write-set (authorized_paths) BEFORE execution — a directive alone is never a sufficient contract.
// Refused here (pre-execution, zero mutation) so a mission with an absent/ambiguous write-set can never
// reach the Patch Executor. Read-only missions (requires_engineering !== true) legitimately declare none.
// The action-gate + authorized_paths remain the RUNTIME scope controls for in-scope writes; this is the
// UPSTREAM gate. (Scan @ install: 0 of 48 engineering contracts lacked a write-set ⇒ zero blast radius.)
if (spec.requires_engineering === true && authorizedPaths.length === 0) {
    console.error(`STOP: engineering mission "${mission}" declares no explicit write-set (authorized_paths).`);
    console.error("A governed write-set is REQUIRED before any code modification (contract-sufficiency gate). Refused pre-execution.");
    process.exit(1);
}

// CM-5: per-objective governance authorization DECLARATION for the autonomy DENOMINATOR, DERIVED from the
// mission's DECLARED governance ENVELOPE (mode + requires_engineering + authorized_paths) — a verifiable
// source, NOT a generic stamp and NOT inferred from an objective's mere presence. Only UNAMBIGUOUS classes
// are declared eligible+authorized: a read-only AUDIT/ANALYZE mission (authorized to READ, no write scope)
// or a scoped-engineering mission (an authorized_paths grant IS the authorization). Everything else —
// OPERATIONAL/reserved/human-gated (e.g. DEPLOY_* with no scope) or ambiguous — is left UNDECLARED, so the
// measurer stays fail-closed NOT_MEASURABLE and can NEVER be inflated. An explicit per-objective contract
// declaration (above) is ALWAYS respected and never overwritten. TRANSPORT-ONLY for measurement — this is
// NOT a runtime permission (the action-gate + authorized_paths still enforce effective authorization).
const _modeUpper = (typeof spec.mode === "string" ? spec.mode : "").toUpperCase();
const _readOnlyMeasured = (_modeUpper === "AUDIT" || _modeUpper === "ANALYZE") &&
    spec.requires_engineering !== true && spec.requiresEngineering !== true && authorizedPaths.length === 0;
const _scopedEngineering = authorizedPaths.length > 0;
// Contract governance may FORBID measurement even when paths are present: a governed-DEPRECATED mission is
// never auto-declared eligible (an authorized_paths grant does NOT override the deprecation).
const _governanceAllows = spec.governedStatus !== "DEPRECATED";
const _derivedAuthorization = (_governanceAllows && (_readOnlyMeasured || _scopedEngineering))
    ? { eligible: true, authorized: true, basis: _readOnlyMeasured ? "governance-envelope:read-only-audit" : "governance-envelope:scoped-engineering" }
    : null;
if (_derivedAuthorization) {
    for (const _obj of objectives as Array<Record<string, unknown>>) {
        if (!_obj.authorization) _obj.authorization = { ..._derivedAuthorization };
    }
}

const plan: any = {
    mission,
    source: CONTRACT_PATH,
    priority: typeof spec.priority === "string" ? spec.priority : "NORMAL",
    mode: typeof spec.mode === "string" ? spec.mode : "SEQUENTIAL",
    requiresEngineering,
    authorizedPaths,
    objectives,
    nextObjective: objectives[0].id,
    definitionOfDone: asStrings(spec.definition_of_done),
    completion: asStrings(spec.completion),
    status: "READY_FOR_EXECUTION",
};

// V5 Stage 3 budget SOURCE (spec.budget): carry a mission's declared budget block into the plan when it
// is well-formed, so cost accounting can meter against it. Absent ⇒ no plan.budget key (NO fabricated
// default — budget ABSENT stays distinct from DECLARED/EXHAUSTED). A present-but-malformed block is
// dropped (not silently coerced); the mission simply carries no budget. Transport only (no metering here).
{
    const resolved = budgetContract.resolveBudget(spec);
    if (resolved.present && resolved.ok) plan.budget = resolved.budget;
}

// Machine-checkable capability probes (spec.verify). Each entry is { capability, evidence, required? }
// where `evidence` names a probe the Validation Engine knows how to run against real generated
// artifacts. Absent on legacy missions ⇒ the Validation Engine adds no extra gate, so behaviour is
// unchanged. Present ⇒ the mission's Definition of Done becomes genuinely verified rather than merely
// asserted. `required` is carried through verbatim (opt out with `required: false`) so the Validation
// Engine's optional-proof handling — a proof that is recorded but never blocks SUCCESS — actually
// reaches the gate; a dropped flag would silently force every declared proof to be required.
if (Array.isArray(spec.verify)) {
    plan.verify = spec.verify
        .filter((v: any) => v && typeof v === "object" && typeof v.evidence === "string")
        .map((v: any) => {
            const entry: any = { capability: String(v.capability || v.evidence), evidence: v.evidence };
            if (v.required === false) entry.required = false;
            return entry;
        });
}

// Runtime-level enforcement of REQUIRED capability proofs — a mission's INTENT can imply proofs its
// contract omits (a stale or hand-authored `verify`-less contract), and completion must be forbidden
// until those proofs are produced. A mission to reach/explore the Internet, for example, MUST prove
// Internet reachability. The Mission Loader therefore derives the intent-implied proofs from the SAME
// resolver the Contract Factory declares from (mission-contract-factory.resolveVerifyProbes — one
// source of truth, no second vocabulary) and MERGES any not already declared as REQUIRED proofs. This
// closes the hole where such a mission could reach MISSION SUCCESS with NO capability proof at all;
// the Validation Engine's required-proof gate then blocks until the probe's real evidence exists.
// De-duplicated by evidence name; missions with no intent-implied proof are entirely unaffected.
try {
    const { resolveVerifyProbes }: any = require("./mission-contract-factory");
    const implied = resolveVerifyProbes({
        id: mission,
        title: spec.mission,
        goal: objectives.map((o: any) => o.goal).filter(Boolean).join(" "),
        description: spec.description,
    });
    if (implied.length > 0) {
        const declared = Array.isArray(plan.verify) ? plan.verify : (plan.verify = []);
        const seen = new Set(declared.map((v: any) => v.evidence));
        for (const p of implied) {
            if (seen.has(p.evidence)) continue;
            seen.add(p.evidence);
            declared.push({ capability: p.capability, evidence: p.evidence });
        }
    }
} catch (err: any) {
    console.error(`[mission-loader] capability-proof derivation unavailable: ${err.message}`);
}

// Transport-only: carry the mission's research_acquisition authorization block verbatim so the
// downstream Decision Engine → Patch Engine → capability executor can self-gate on it. Absent ⇒ no
// key (every other mission is byte-for-byte unaffected). This introduces NO authority and NO policy:
// it is data the self-gating executor reads and FAILS CLOSED on.
if (spec.research_acquisition && typeof spec.research_acquisition === "object" && !Array.isArray(spec.research_acquisition)) {
    plan.research_acquisition = spec.research_acquisition;
}

fs.mkdirSync("runtime/generated", { recursive: true });
fs.writeFileSync(
    "runtime/generated/mission-plan.json",
    JSON.stringify(plan, null, 2)
);

console.log("======================================");
console.log("MISSION LOADER");
console.log("======================================");
console.log("Mission    :", mission);
console.log("Contract   :", CONTRACT_PATH);
console.log("Mode       :", plan.mode);
console.log("Objectives :", objectives.length);
console.log("Next       :", plan.nextObjective);
console.log("Engineering:", requiresEngineering ? "YES (authorized paths)" : "no (read-only/local)");
console.log("Status     :", plan.status);
console.log("Output     : runtime/generated/mission-plan.json");
console.log("======================================");

// OFFICIAL MISSION CONTEXT. The Mission Engine now composes its context through the single official
// source (MissionContextBuilder) instead of leaving every downstream engine to re-derive it. This is
// additive and best-effort: mission-plan.json above is unchanged (public contract preserved) and the
// builder runs in "cache-only" mode so it never spawns a repository scan or blocks the load. It emits
// runtime/generated/mission-context.json for Capability Registry / Policy Engine / Brief Generator.
try {
    const { buildMissionContext }: any = require("./mission-context-builder");
    const context = buildMissionContext(mission, { runtime: "cache-only", write: true });
    console.log(
        "Context    : runtime/generated/mission-context.json",
        context.runtimeComplete ? "(runtime resolved)" : "(runtime pending)"
    );
} catch (err: any) {
    console.error(`[mission-loader] MissionContext not emitted: ${err.message}`);
}
