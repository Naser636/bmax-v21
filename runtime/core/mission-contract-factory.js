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

// Read-only PROBE intent (parity twin of mission-contract-factory.ts): liveness/health/diagnostic missions
// that observe-and-report and apply NO patch. Used ONLY as a WEAK (inferred) OBSERVATION signal, consulted
// after every delivery signal is ruled out — so it never reclassifies a mission that implies engineering.
const OBSERVATION_INTENT_RE = /\b(health[- ]?check|healthcheck|health|liveness|readiness|heartbeat|status[- ]?check|self[- ]?check|self[- ]?diagnostics?|diagnostics?|diagnose|probe)\b/i;

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
    {
        // Governed git branch integration intent requires the git-branch-integrated proof (a real,
        // VERIFIED, local, fast-forward-only C03 transition). A dry-run or no-op never satisfies it, so
        // a branch-integration mission cannot be proven without an actual governed integration having
        // occurred. Declaration only — the capability self-gates authority; this adds none.
        match: /\bbranch integration\b|\bfast[- ]forward\b|\bGIT_BRANCH_INTEGRATION\b|\bintegrate .*branch\b/i,
        probes: [{ capability: "Governed git branch integration (local, ff-only, C03-verified)", evidence: "git-branch-integrated" }],
    },
    {
        // Governed bash/linux command intent requires the bash-command-governed proof: the command was
        // handled under governance (parsed, action-gated, run only in genuine isolation) with NO raw
        // shell execution. A dry-run or governed refusal never satisfies it. Declaration only — the
        // capability self-gates authority (deny-by-default); this adds none.
        match: /\bbash\b|\bshell command\b|\blinux command\b|\brun (a |the )?command\b|\bBASH_COMMAND\b/i,
        probes: [{ capability: "Governed bash/linux command (no raw shell, sandboxed, C03-verified)", evidence: "bash-command-governed" }],
    },
];

// B140 — Observability Verification intent. A mission whose deliverable is an OBSERVABLE STATE (the
// governed dashboard / autonomy-rate signal) does NO file edit on re-run, so a plain objective would be a
// no-op RECORDED (BLOCKED by anti-false-success). This SPECIFIC intent (dashboard & autonomy observability)
// binds the objective to the Governed Observability Verification capability so it does REAL evidenced work.
// Deliberately narrow: it must name the governed-dashboard/autonomy-observability deliverable.
const OBSERVABILITY_VERIFY_INTENT = /\bgoverned dashboard\b|\bautonomy observability\b|\bdashboard & autonomy\b|\bGOVERNED_DASHBOARD_OBSERVABILITY\b/i;

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

// Mission modes that POSITIVELY DECLARE a read-only observation/audit mission. These are the explicit
// read-only signal the canonical audits (M0000/M0001/M0002, mode:"AUDIT") carry. A mission is only
// treated as read-only when it DECLARES it this way (or via an explicit engineering:false flag / explicit
// empty authorized_paths / a declared per-objective proof) — never by mere inference.
const OBSERVATION_MODES = ["AUDIT", "READ_ONLY", "ANALYZE"];

/** The explicitly-declared authorized-path scope on an entry (null when none was declared). */
function explicitAuthorizedPaths(entry) {
    if (Array.isArray(entry.authorized_paths)) return entry.authorized_paths;
    if (Array.isArray(entry.authorizedPaths)) return entry.authorizedPaths;
    return null;
}

/*
 * Classify a mission into exactly one of three VERIFIABLE classes, from its DECLARED signals — NEVER the
 * mission name alone (a name keyword may only CORROBORATE a structural signal, requirement CTO #3/#5):
 *   - DELIVERY    : a positive engineering/delivery signal — an explicit engineering flag, a non-empty
 *                   authorized_paths, an engineering mode, an objective patch/edits/files, a named file
 *                   target in the text/done_when, or (corroborating) an engineering-intent keyword.
 *   - OBSERVATION : an EXPLICIT read-only declaration — an engineering:false flag, an explicit empty
 *                   authorized_paths, an observation mode (AUDIT/READ_ONLY/ANALYZE), or a declared
 *                   per-objective proof — AND no delivery signal. M0000/M0001/M0002 land here (mode:AUDIT).
 *   - UNKNOWN     : NO positive signal either way (read-only only by inference — e.g. a contract
 *                   synthesized from an id/title alone, like UI_DEPLOYMENT_FOUNDATION). FAIL-CLOSED: it is
 *                   mapped to evidence-required (engineering) so a bare RECORDED no-op can never reach
 *                   SUCCESS. It does NOT silently self-certify as a read-only audit.
 * Pure/deterministic — a function of `entry` only.
 */
function classifyMission(entry) {
    const text = entryText(entry);
    const mode = String(entry.mode || "").toUpperCase();
    const paths = explicitAuthorizedPaths(entry);
    const objectives = Array.isArray(entry.objectives) ? entry.objectives : [];
    const doneText = []
        .concat(Array.isArray(entry.done_when) ? entry.done_when : [])
        .concat(Array.isArray(entry.definition_of_done) ? entry.definition_of_done : [])
        .filter((s) => typeof s === "string")
        .join(" ");

    // Precedence: STRONG-explicit signals (both directions) before WEAK-inferred ones, so an incidental
    // file mention in prose (e.g. a doc reference) can never override an explicit audit declaration.

    // 1. STRONG DELIVERY — explicit write intent. Wins even over an observation mode: a genuine
    //    contradiction (e.g. requires_engineering:true on an AUDIT) resolves toward evidence, never
    //    toward a silent read-only pass.
    const strongDelivery = [];
    if (entry.requiresEngineering === true || entry.requires_engineering === true) strongDelivery.push("explicit requires_engineering:true");
    if (paths && paths.length > 0) strongDelivery.push("explicit non-empty authorized_paths");
    if (ENGINEERING_INTENT.includes(mode)) strongDelivery.push(`engineering mode:${mode}`);
    if (objectives.some((o) => o && (o.patch || o.edits || (Array.isArray(o.files) && o.files.length > 0)))) strongDelivery.push("objective declares a patch/edits/files");
    if (strongDelivery.length > 0) return { missionClass: "DELIVERY", classBasis: strongDelivery };

    // 2. STRONG OBSERVATION — an EXPLICIT read-only declaration. Precedes WEAK/inferred delivery so a
    //    declared audit (e.g. M0000/M0001/M0002, mode:"AUDIT") is never mis-flagged by an incidental
    //    path token or keyword in its prose.
    const observation = [];
    if (OBSERVATION_MODES.includes(mode)) observation.push(`observation mode:${mode}`);
    if (entry.requiresEngineering === false || entry.requires_engineering === false) observation.push("explicit requires_engineering:false");
    if (paths && paths.length === 0) observation.push("explicit empty authorized_paths (deliberate read-only)");
    if (objectives.some((o) => o && typeof o.proof === "string" && o.proof.length > 0)) observation.push("declared per-objective proof");
    if (observation.length > 0) return { missionClass: "OBSERVATION", classBasis: observation };

    // 3. WEAK DELIVERY — inferred ONLY when nothing was declared either way: an engineering-intent
    //    keyword or a named file target in the mission's own text / done_when.
    const weakDelivery = [];
    if (ENGINEERING_INTENT_RE.test(text)) weakDelivery.push("engineering-intent keyword (inferred)");
    if (synth.derivePaths(text).length > 0 || synth.derivePaths(doneText).length > 0) weakDelivery.push("names a concrete file target (inferred)");
    if (weakDelivery.length > 0) return { missionClass: "DELIVERY", classBasis: weakDelivery };

    // 3b. WEAK OBSERVATION — inferred read-only PROBE (health / liveness / diagnostic) with NO delivery
    //     signal. Reached ONLY after every delivery signal is ruled out, so it never overrides engineering.
    //     A pure liveness/health/diagnostic probe applies no patch ⇒ OBSERVATION lets the Validation Engine
    //     accept its observable result instead of demanding "Authorized patch applied". Fail-closed preserved
    //     for genuinely UNKNOWN missions below.
    const weakObservation = [];
    if (OBSERVATION_INTENT_RE.test(text)) weakObservation.push("read-only probe keyword (inferred: health/liveness/diagnostic; no delivery signal)");
    if (weakObservation.length > 0) return { missionClass: "OBSERVATION", classBasis: weakObservation };

    // 4. UNKNOWN — no signal either way (read-only only by inference from id/title). Fail closed.
    return {
        missionClass: "UNKNOWN",
        classBasis: ["no explicit engineering or read-only declaration; delivery intent cannot be confirmed from id/title alone — fail-closed to evidence-required so a no-op cannot reach SUCCESS"],
    };
}

/*
 * Resolve whether a mission AUTHORIZES CODE GENERATION (engineering). Delegates to classifyMission:
 * DELIVERY and UNKNOWN both require evidence (engineering=true); only an EXPLICITLY-declared OBSERVATION
 * mission is read-only. This closes the mis-classification hole where a mission synthesized from an id
 * alone (no declared signal, e.g. UI_DEPLOYMENT_FOUNDATION) fell through to read-only and could then be
 * stamped SUCCESS on a bare no-op. Pure/deterministic — a function of `entry` only.
 */
function resolveEngineering(entry) {
    return classifyMission(entry).missionClass !== "OBSERVATION";
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
 * Derive an authorized-path SCOPE from the path-like tokens a mission names in its OWN text
 * (id / title / goal / description). A token counts only when it carries a directory separator AND a
 * file-ish extension — the SAME shape the Delegation Brief derives (runtime/bin/odg-delegate.js), so a
 * synthesized contract and its brief agree on scope. Pure/deterministic: a function of `entry` text
 * only (no filesystem), de-duplicated and order-preserving. Empty when the text grounds no path — the
 * caller then falls back to the safe engineering default. This grounds the scope on the mission's own
 * declared target instead of a blind `runtime/**` guess (which the delegate's brief then inherited),
 * so a mission whose target lives OUTSIDE runtime/** (e.g. a src/runtime/** file) is finally reachable.
 * It never WIDENS an explicitly-declared scope — the caller only consults this when none was declared.
 */
function derivePathScope(entry) {
    // Reuse the ONE path-token extractor in the synthesizer (the shared schema source) so the factory
    // and the NL `fromRequest` path ground scope identically — no second, drifting implementation.
    return synth.derivePaths(entryText(entry));
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
    const classification = classifyMission(entry);
    // DELIVERY and UNKNOWN both require evidence (fail-closed); only a DECLARED OBSERVATION is read-only.
    const engineering = classification.missionClass !== "OBSERVATION";

    // Resolve the mission's authorized-path SCOPE. Precedence:
    //   1. an explicit scope on the entry — honoured verbatim (even an explicit [] = deliberately
    //      read-only), NEVER widened;
    //   2. else a scope DERIVED from the path tokens the mission names in its own text — so a
    //      synthesized contract targets the file(s) it actually concerns (incl. a target outside
    //      runtime/**, e.g. src/runtime/**) instead of a blind, over-broad, sometimes-WRONG runtime/**
    //      guess, and agrees with the scope the Delegation Brief derives the same way;
    //   3. else the safe runtime-scoped default for an engineering mission whose text grounds no path,
    //      or none for a read-only mission (backward compatible).
    const explicitPaths = Array.isArray(entry.authorized_paths)
        ? entry.authorized_paths
        : Array.isArray(entry.authorizedPaths)
            ? entry.authorizedPaths
            : null;
    let authorizedPaths;
    if (explicitPaths) {
        authorizedPaths = explicitPaths;
    } else {
        const derived = derivePathScope(entry);
        authorizedPaths = derived.length ? derived : (engineering ? ["runtime/**"] : []);
    }

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
        mode: entry.mode || (engineering ? "ENGINEERING" : "READ_ONLY"),
        authorizedPaths,
        doneWhen,
        description:
            entry.description ||
            `Auto-generated contract for roadmap mission ${entry.id} (${goal}).`,
    });

    // B140 — bind an observability-verification mission's objective to the Governed Observability
    // Verification capability (objectiveId prefix VERIFY_OBSERVABILITY_) + its independent per-objective
    // proof, so the objective does REAL evidenced work instead of a no-op RECORDED. Scoped to this intent
    // ONLY: every other mission's objective is byte-identical. Grants no new authority, fabricates no proof.
    if (OBSERVABILITY_VERIFY_INTENT.test(entryText(entry))) {
        base.objectives[0].id = "VERIFY_OBSERVABILITY_1";
        base.objectives[0].proof = "autonomy-observability-verified";
    }

    // P1 (B143) — conservative autonomy-eligibility DECLARATION per objective. The measurer
    // (autonomy-measure.eligibilityFromObjectives) reads ONLY explicit per-objective `authorization`
    // declarations and NEVER infers eligibility; an absent declaration ⇒ NON_MEASURABLE. As the contract
    // author, the factory declares conservatively: an ENGINEERING objective in this AUTHORIZED mission is
    // eligible ODG-executable authorized work ⇒ {eligible:true, authorized:true}; a read-only objective is
    // EXCLUDED from the autonomy denominator with a justified reason. This can NEVER inflate the autonomy %:
    // the numerator stays evidence-gated (a unit counts as ODG-verified only via EVIDENCED attribution,
    // decided downstream), so declaring eligibility only completes the DENOMINATOR honestly. Human-mandatory
    // work is not a factory engineering objective (ODG never auto-commits; the commit gate is a SEPARATE
    // lifecycle gate, not an objective work-actor). An explicit declaration is never overridden.
    for (const obj of base.objectives) {
        if (!obj || typeof obj !== "object" || obj.authorization) continue;
        obj.authorization = engineering
            ? { eligible: true, authorized: true }
            : { excluded: true, reason: "read-only/analysis objective — not ODG-authored engineering work; excluded from the autonomy denominator" };
    }

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
        // Explicit, verifiable mission class (OBSERVATION | DELIVERY | UNKNOWN) + the signals it was
        // decided from. OBSERVATION ⇒ read-only; DELIVERY/UNKNOWN ⇒ evidence-required (fail-closed), so an
        // UNKNOWN mission can never pass as a read-only no-op SUCCESS. Decided by classifyMission (never
        // the mission name alone). Descriptive provenance — the engine's verdict is enforced via the
        // existing requires_engineering/authorized_paths gates this class drives.
        missionClass: classification.missionClass,
        classBasis: classification.classBasis,
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
    derivePathScope,
    classifyMission,
    buildContract,
    generateMissing,
    generateForMission,
    isOnDemandEnabled,
    humanizeId,
    LIFECYCLE_STATES,
    CONTRACT_POLICIES,
    CONTRACT_EVIDENCE,
};
