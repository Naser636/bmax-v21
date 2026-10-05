#!/usr/bin/env node

/*
 * Mission Contract Factory — Roadmap → missing Mission Contracts.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Runtime executes the ordered list of missions in runtime/governance/ROADMAP.json. The
 * autonomy work-list, though, is sourced from the runtime-model queue, which only surfaces mission
 * CONTRACTS that already exist on disk with objectives (runtime/core/runtime-model.js). A roadmap
 * entry that names a mission with NO contract file therefore never becomes a candidate: it is
 * silently skipped and the campaign can never reach it "from the roadmap alone".
 *
 * This module closes that gap. Given the roadmap it:
 *   1. reads the manifest;
 *   2. detects entries whose contract is absent (or present but declares no objectives);
 *   3. GENERATES a complete, Mission-Loader-conformant contract for each gap, filling every
 *      obligatory field (objective, priority, mode, authorized_paths when engineering, validation
 *      criteria, checkpoints, ledger descriptor);
 *   4. validates the generated contract with the SAME structural guard the Mission Loader enforces;
 *   5. writes it to runtime/missions/<id>.json (the location the Mission Loader consumes).
 *
 * It creates NO new runtime and NO new schema: the contract shape and the validator are reused from
 * runtime/core/mission-synthesizer.js, and the produced files are the exact contracts the existing
 * Mission Loader / pipeline / autonomy loop already run. Once the gaps are materialised the EXISTING
 * autonomy loop selects, executes and advances through them — and its ledger + checkpoint already
 * give campaign resume for free.
 *
 * Deterministic + idempotent: buildContract is a pure function of the roadmap entry (no wall-clock,
 * no randomness), and generateMissing skips any entry that already has an executable contract, so
 * re-running never churns the tree (DETERMINISM_FIRST).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const synth = require("./mission-synthesizer");

const ROADMAP_REL = path.join("runtime", "governance", "ROADMAP.json");
const MISSIONS_REL = path.join("runtime", "missions");
const POLICIES_REL = path.join("runtime", "policies", "runtime-policies.json");

// The canonical governance lifecycle chain (mirrors runtime/governance/state-machine.json). Declared
// on every generated contract so a synthesized mission carries the SAME lifecycle the Mission
// Lifecycle Driver walks — it is descriptive metadata, never a second source of truth (the driver
// still reads state-machine.json at run time).
const LIFECYCLE_STATES = [
    "CREATED",
    "QUALIFIED",
    "ANALYZED",
    "PLANNED",
    "PREPARED",
    "VALIDATED",
    "EXECUTED",
    "VERIFIED",
    "RELEASED",
    "ARCHIVED",
];

// The governance policies a generated contract runs under, using the EXISTING policy vocabulary
// (runtime/policies/runtime-policies.json governance.strategy / reusePolicy + the LOCAL_FIRST
// execution discipline the adapter enforces). Descriptive, deterministic.
const CONTRACT_POLICIES = ["DETERMINISM_FIRST", "REUSE_BEFORE_CREATE", "LOCAL_FIRST"];

// The runtime artifacts a mission run is expected to produce as its evidence surface (git-ignored,
// regenerated every run). Lets Verify/Converge treat a generated contract as a normal Runtime proof.
const CONTRACT_EVIDENCE = [
    "runtime/generated/mission-plan.json",
    "runtime/generated/mission-report.json",
    "runtime/generated/mission-ledger.json",
];

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

// Mission modes/verbs that DECLARE a mission as code-authoring (engineering). Mirrors the runtime's
// established engineering-mode vocabulary (src/providers/provider-port.ts ENGINEERING_MODES) so the
// factory classifies a synthesized mission the SAME way the provider router does — no second source
// of truth. Word-boundary matched (case-insensitive) against the mission id/title/goal/description.
const ENGINEERING_INTENT = [
    "ENGINEERING", "IMPLEMENT", "FIX", "REPAIR", "REFACTOR",
    "BUILD", "CREATE", "GENERATE", "MIGRATE", "ENABLE", "EVOLVE", "SCAFFOLD", "INTEGRATE",
];
const ENGINEERING_INTENT_RE = new RegExp(`\\b(${ENGINEERING_INTENT.join("|")})\\b`, "i");

function entryText(entry) {
    return [entry.id, entry.title, entry.goal, entry.description]
        .filter((s) => typeof s === "string")
        .join(" ");
}

/*
 * Machine-checkable capability probes a synthesized contract DECLARES from its intent. Each rule maps
 * an intent regex (matched case-insensitively against the mission id/title/goal/description) to the
 * probe descriptor(s) to declare when it matches. The `evidence` names are the SAME probes the
 * Capability Probe Framework already registers (runtime/core/capability-probes.js) — no new probe, no
 * second source of truth. Declaring them is what makes the Validation Engine EXECUTE the probes and
 * report capability proofs, instead of the report reading "no capability probes declared".
 *
 * Connectivity/internet missions are the one registered probe (`internet-reachable`) that otherwise
 * has no declaration home: the framework's internet capability gate reuses the Connectivity Audit
 * connector's evidence, so a mission whose intent is to reach the network declares that proof.
 */
const PROBE_INTENT = [
    {
        // Connectivity / internet / "online" intent all require the network: a mission to explore
        // online opportunities cannot be proven without proving the Internet is actually reachable.
        match: /\b(connectivity|internet|online)\b/i,
        probes: [{ capability: "Internet reachable (Connectivity Audit)", evidence: "internet-reachable" }],
    },
    {
        // External research acquisition intent requires the research-acquired proof (verified per-source
        // provenance). This is DISTINCT from connectivity/internet: reachability NEVER satisfies it, so a
        // research mission cannot be proven by a HEAD probe. Declaration only — no new authority.
        match: /\bexternal research\b|\bresearch acquisition\b|\bEXTERNAL_RESEARCH\b/i,
        probes: [{ capability: "External research acquired (verified per-source provenance)", evidence: "research-acquired" }],
    },
];

/*
 * Resolve the capability proofs a mission's intent implies. Pure/deterministic (a function of `entry`
 * only). De-duplicated by evidence name so overlapping rules never declare the same probe twice.
 */
function resolveVerifyProbes(entry) {
    const text = entryText(entry);
    const out = [];
    const seen = new Set();
    for (const rule of PROBE_INTENT) {
        if (!rule.match.test(text)) continue;
        for (const p of rule.probes) {
            if (seen.has(p.evidence)) continue;
            seen.add(p.evidence);
            out.push({ capability: p.capability, evidence: p.evidence });
        }
    }
    return out;
}

/*
 * Resolve whether a mission AUTHORIZES CODE GENERATION (engineering). Precedence, strongest first:
 *   1. an explicit engineering flag (requiresEngineering / requires_engineering) — true OR false wins,
 *      so a mission can always force read-only regardless of its title;
 *   2. explicitly declared authorized_paths (non-empty ⇒ engineering);
 *   3. an explicit engineering mode (ENGINEERING / IMPLEMENT / FIX / REPAIR / REFACTOR);
 *   4. an engineering intent inferred from the mission id/title/goal/description text.
 *
 * (4) is what fixes the "always resolved as read-only/local" blocker for CONTRACT ON DEMAND missions
 * synthesized from an id alone (generateForMission): they carry no explicit flag, so previously they
 * ALWAYS fell through to engineering=false. Their own contract text is the signal that they authorize
 * code generation. Pure/deterministic — a function of `entry` only.
 */
function resolveEngineering(entry) {
    if (entry.requiresEngineering === true || entry.requires_engineering === true) return true;
    if (entry.requiresEngineering === false || entry.requires_engineering === false) return false;
    const explicitPaths = Array.isArray(entry.authorized_paths)
        ? entry.authorized_paths
        : Array.isArray(entry.authorizedPaths) ? entry.authorizedPaths : null;
    if (explicitPaths && explicitPaths.length > 0) return true;
    if (ENGINEERING_INTENT.includes(String(entry.mode || "").toUpperCase())) return true;
    return ENGINEERING_INTENT_RE.test(entryText(entry));
}

/*
 * Is Contract On Demand authorized? The two capabilities this factory delivers
 * (DYNAMIC_MISSION_CONTRACT_FACTORY / AUTONOMOUS_CONTRACT_EVOLUTION) are governed like every other
 * Runtime capability: their enablement lives in runtime/policies/runtime-policies.json under
 * `contractOnDemand.enabled`. An operator/CI can force the answer with ODG_CONTRACT_ON_DEMAND
 * (`0`/`false` disables, any other value enables) without editing policy — used by tests and by a
 * strict flow that wants the historical "STOP for human authoring" behaviour back.
 */
function isOnDemandEnabled(root = process.cwd()) {
    const env = process.env.ODG_CONTRACT_ON_DEMAND;
    if (typeof env === "string" && env.length > 0) {
        return !(env === "0" || env.toLowerCase() === "false");
    }
    const policies = readJson(path.join(root, POLICIES_REL));
    return !!(policies && policies.contractOnDemand && policies.contractOnDemand.enabled === true);
}

/** The ordered roadmap entries that name a mission id (invalid entries are dropped). */
function readRoadmap(root) {
    const manifest = readJson(path.join(root, ROADMAP_REL));
    const missions = manifest && Array.isArray(manifest.missions) ? manifest.missions : [];
    return missions.filter((m) => m && typeof m.id === "string");
}

/** Where a roadmap entry's contract lives: the manifest's explicit path, else the convention. */
function contractPathFor(root, entry) {
    const rel =
        typeof entry.contract === "string" && entry.contract.trim()
            ? entry.contract
            : path.join(MISSIONS_REL, `${entry.id}.json`);
    return path.join(root, rel);
}

/*
 * A roadmap entry is "missing a contract" when no contract file exists, OR the file exists but
 * declares no objectives — the SAME executability guard the Mission Loader (runtime/core/
 * mission-loader.js) and the runtime-model queue enforce. Both cases would keep the mission out of
 * the autonomous work-list, so both are gaps this factory fills.
 */
function isContractMissing(root, entry) {
    const raw = readJson(contractPathFor(root, entry));
    if (raw === null) return true;
    return !(Array.isArray(raw.objectives) && raw.objectives.length > 0);
}

/*
 * Build a COMPLETE, Mission-Loader-conformant contract for a roadmap entry.
 *
 * The canonical base schema (mission / objectives / definition_of_done / mode / priority /
 * authorized_paths) comes from mission-synthesizer.toContract so there is ONE schema source; this
 * function only enriches it with the remaining obligatory fields the campaign needs:
 *   - authorized_paths + engineering flag (a safe runtime-scoped default when engineering and no
 *     explicit paths are declared on the roadmap entry);
 *   - validation criteria (definition_of_done / done_when);
 *   - checkpoints: the resumable milestones (the durable per-stage checkpoint stays owned by
 *     runtime/core/checkpoint-engine.js at run time — these are the declared boundaries);
 *   - ledger: the entry the Mission Ledger should record on release (the append stays owned by
 *     runtime/core/mission-ledger.js — this is the intended entry, never a write).
 *
 * Pure: a deterministic function of `entry` only.
 */
function buildContract(entry) {
    const engineering = resolveEngineering(entry);

    // Honour explicit authorized paths from the roadmap entry; otherwise use a safe runtime-scoped
    // default when the mission is engineering, or none for a read-only mission.
    const explicitPaths = Array.isArray(entry.authorized_paths)
        ? entry.authorized_paths
        : Array.isArray(entry.authorizedPaths)
            ? entry.authorizedPaths
            : null;
    const authorizedPaths = explicitPaths || (engineering ? ["runtime/**"] : []);

    const goal = String(entry.title || entry.goal || entry.id);
    const doneWhen = [
        `Objective "${goal}" satisfied.`,
        "Validation Engine reports success.",
        engineering ? "Authorized patch applied." : "Read-only evidence produced.",
    ];

    const base = synth.toContract({
        id: entry.id,
        goal,
        priority: entry.priority || "NORMAL",
        mode: entry.mode || (engineering ? "ENGINEERING" : "SEQUENTIAL"),
        authorizedPaths,
        doneWhen,
        description:
            entry.description ||
            `Auto-generated contract for roadmap mission ${entry.id} (${goal}).`,
    });

    const objectiveId = base.objectives[0].id;
    // Capability proofs the mission's intent implies — declared so the Validation Engine executes
    // them and reports capability proofs (empty ⇒ omitted, so unrelated missions are unchanged).
    const verify = resolveVerifyProbes(entry);

    return {
        ...base,
        ...(verify.length ? { verify } : {}),
        // authorizedPaths alias some engineering contracts/consumers read alongside authorized_paths.
        authorizedPaths,
        status: "AUTHORIZED",
        completion: ["Release Manager decision is RELEASE."],
        // Permissions the mission runs under — the SAME facts the Mission Loader derives
        // (requires_engineering ⇐ authorized_paths non-empty). Declared explicitly so a synthesized
        // contract states its boundary without a consumer having to re-derive it. Network is never
        // granted by the factory (deterministic, local-first).
        permissions: {
            engineering,
            authorizedPaths,
            network: false,
        },
        // Governance lifecycle this mission advances through (state-machine.json) — descriptive.
        lifecycle: LIFECYCLE_STATES.slice(),
        // Governance policies in force — reuse the existing policy vocabulary.
        policies: CONTRACT_POLICIES.slice(),
        // Evidence surface the run is expected to produce (Verify/Converge read these as normal proofs).
        evidence: CONTRACT_EVIDENCE.slice(),
        checkpoints: [
            { id: `${objectiveId}__PLANNED`, when: "mission-plan.json generated" },
            { id: `${objectiveId}__VALIDATED`, when: "Validation Engine reports success" },
            { id: `${objectiveId}__RELEASED`, when: "mission ledger entry proven" },
        ],
        ledger: { mission: entry.id, capability: entry.id, status: "PENDING", proven: false },
        source: "mission-contract-factory",
        generatedBy: "mission-contract-factory",
    };
}

/*
 * Humanize a mission id into a readable title/goal for a contract generated ON DEMAND (no roadmap
 * entry): "DYNAMIC_MISSION_CONTRACT_FACTORY" → "Dynamic Mission Contract Factory". Deterministic.
 */
function humanizeId(id) {
    return String(id || "")
        .replace(/[_\-]+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/*
 * Read the roadmap, generate every missing contract, validate it, and (by default) write it to the
 * conventional mission-contract location. Returns a report:
 *   { roadmap: [...ids], generated: [{mission, path}], skipped: [...ids], invalid: [...ids] }
 * `skipped` are entries that already have an executable contract; `invalid` are entries whose
 * generated contract failed the structural validator (should never happen for a well-formed entry —
 * surfaced rather than written so a bad contract can never reach the loader). Pass {write:false} to
 * detect/generate without touching the tree (used by tests and dry-runs).
 */
function generateMissing(root = process.cwd(), options = {}) {
    const write = options.write !== false;
    const roadmap = readRoadmap(root);
    const report = { roadmap: roadmap.map((e) => e.id), generated: [], skipped: [], invalid: [] };

    for (const entry of roadmap) {
        if (!isContractMissing(root, entry)) {
            report.skipped.push(entry.id);
            continue;
        }
        const contract = buildContract(entry);
        if (!synth.isValidContract(contract)) {
            report.invalid.push(entry.id);
            continue;
        }
        const target = contractPathFor(root, entry);
        if (write) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, JSON.stringify(contract, null, 2) + "\n");
        }
        report.generated.push({ mission: entry.id, path: path.relative(root, target) });
    }

    return report;
}

/*
 * CONTRACT ON DEMAND (DYNAMIC_MISSION_CONTRACT_FACTORY).
 *
 * Generate a complete, Mission-Loader-conformant contract for an ARBITRARY mission id — one that is
 * NOT required to appear in the roadmap manifest. This is what removes the dependency on a CLOSED
 * list of pre-written contracts: any mission the Runtime is asked to run can be materialised on the
 * fly, then the normal pipeline resumes.
 *
 * Behaviour:
 *   - If an executable contract already exists on disk, it is REUSED verbatim (backward compatible —
 *     an existing hand-written contract is never overwritten). Returns {reused:true}.
 *   - Otherwise a contract is BUILT from the roadmap entry when one exists (so roadmap hints such as
 *     requiresEngineering are honoured), else synthesized from the id alone (+ optional `hints`),
 *     validated with the SAME structural guard the Mission Loader enforces, and (by default) written
 *     to runtime/missions/<id>.json — the exact location every runner consumes. Returns
 *     {generated:true}. An invalid build is surfaced ({invalid:true}) rather than written.
 *
 * Pure apart from the single opt-in write; deterministic (buildContract has no wall-clock/randomness),
 * so re-generating an identical mission never churns the tree.
 */
function generateForMission(root = process.cwd(), missionId, options = {}) {
    const write = options.write !== false;
    const entryLike = { id: missionId };
    const target = contractPathFor(root, entryLike);
    const rel = path.relative(root, target);

    // Reuse an already-executable contract untouched (backward compatibility / no churn).
    if (!isContractMissing(root, entryLike)) {
        return { mission: missionId, path: rel, generated: false, reused: true, contract: readJson(target) };
    }

    // Prefer the roadmap entry (honours declared hints); else synthesize from the id alone.
    const roadmapEntry = readRoadmap(root).find((e) => e.id === missionId);
    const entry = roadmapEntry || {
        id: missionId,
        title: humanizeId(missionId),
        ...(options.hints && typeof options.hints === "object" ? options.hints : {}),
    };

    const contract = buildContract(entry);
    if (!synth.isValidContract(contract)) {
        return { mission: missionId, path: rel, generated: false, reused: false, invalid: true, contract: null };
    }

    if (write) {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, JSON.stringify(contract, null, 2) + "\n");
    }
    return { mission: missionId, path: rel, generated: true, reused: false, contract };
}

module.exports = {
    readRoadmap,
    contractPathFor,
    isContractMissing,
    resolveVerifyProbes,
    buildContract,
    generateMissing,
    generateForMission,
    isOnDemandEnabled,
    humanizeId,
    LIFECYCLE_STATES,
    CONTRACT_POLICIES,
    CONTRACT_EVIDENCE,
};
