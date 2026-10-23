#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

/*
 * Mission Contract Factory — behavioural test.
 *
 * Proves the capability end-to-end against a throwaway repo layout in a temp dir (no writes to the
 * real tree): a roadmap with a mix of present / missing / read-only / engineering entries must yield
 * complete, Mission-Loader-conformant contract files for exactly the missing entries, and be
 * idempotent on a second run.
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const factory = require("./mission-contract-factory");
const synth = require("./mission-synthesizer");
// Note: runtime/core/mission-loader.js is a CLI entrypoint that self-executes on require (it reads
// process.argv and exits), so it is intentionally NOT imported here. The factory reuses only the
// pure mission-synthesizer schema/validator, and the generated files are asserted valid against it.

let passed = 0;
function ok(name, cond) {
    assert.ok(cond, name);
    console.log("  ok -", name);
    passed += 1;
}

// --- build a throwaway repo layout -------------------------------------------------------------
const root = fs.mkdtempSync(path.join(os.tmpdir(), "mcf-"));
const missionsDir = path.join(root, "runtime", "missions");
const govDir = path.join(root, "runtime", "governance");
fs.mkdirSync(missionsDir, { recursive: true });
fs.mkdirSync(govDir, { recursive: true });

// An already-authored, executable contract for PRESENT — the factory must leave it untouched.
fs.writeFileSync(
    path.join(missionsDir, "PRESENT.json"),
    JSON.stringify({ mission: "PRESENT", objectives: [{ id: "P1", goal: "already here" }] }, null, 2),
);

fs.writeFileSync(
    path.join(govDir, "ROADMAP.json"),
    JSON.stringify(
        {
            missions: [
                { id: "PRESENT", title: "Present mission", requiresEngineering: false },
                { id: "READ_ONLY_GAP", title: "A read-only gap", requiresEngineering: false },
                { id: "ENG_GAP", title: "An engineering gap", requiresEngineering: true },
            ],
        },
        null,
        2,
    ),
);

console.log("Case 1 — detection distinguishes present from missing contracts");
ok("present executable contract is NOT missing", factory.isContractMissing(root, { id: "PRESENT" }) === false);
ok("absent contract IS missing", factory.isContractMissing(root, { id: "READ_ONLY_GAP" }) === true);

console.log("Case 2 — buildContract fills every obligatory field and is Loader-valid");
const eng = factory.buildContract({ id: "ENG_GAP", title: "An engineering gap", requiresEngineering: true });
ok("structurally valid (Mission Loader guard)", synth.isValidContract(eng) === true);
ok("has an objective with id + goal", typeof eng.objectives[0].id === "string" && eng.objectives[0].goal.length > 0);
ok("priority present", typeof eng.priority === "string");
ok("mode present", typeof eng.mode === "string");
ok("engineering ⇒ requires_engineering true", eng.requires_engineering === true);
ok("engineering ⇒ default authorized_paths scoped to runtime", eng.authorized_paths.includes("runtime/**"));
ok("validation criteria present (definition_of_done)", Array.isArray(eng.definition_of_done) && eng.definition_of_done.length > 0);
ok("checkpoints declared", Array.isArray(eng.checkpoints) && eng.checkpoints.length >= 1);
ok("ledger descriptor present", eng.ledger && eng.ledger.mission === "ENG_GAP");

const ro = factory.buildContract({ id: "READ_ONLY_GAP", title: "A read-only gap", requiresEngineering: false });
ok("read-only ⇒ requires_engineering false", ro.requires_engineering === false);
ok("read-only ⇒ no authorized_paths", ro.authorized_paths.length === 0);

console.log("Case 3 — generateMissing writes exactly the gaps, skips the present one");
const report = factory.generateMissing(root, { write: true });
ok("both gaps generated", report.generated.map((g) => g.mission).sort().join(",") === "ENG_GAP,READ_ONLY_GAP");
ok("present mission skipped", report.skipped.includes("PRESENT"));
ok("nothing invalid", report.invalid.length === 0);
ok("generated contract file exists on disk", fs.existsSync(path.join(missionsDir, "ENG_GAP.json")));
const onDisk = JSON.parse(fs.readFileSync(path.join(missionsDir, "ENG_GAP.json"), "utf8"));
ok("written contract is Loader-valid", synth.isValidContract(onDisk) === true);

console.log("Case 4 — idempotent: a second run generates nothing new");
const before = fs.readFileSync(path.join(missionsDir, "ENG_GAP.json"), "utf8");
const report2 = factory.generateMissing(root, { write: true });
ok("second run generates nothing", report2.generated.length === 0);
ok("previously-missing entries now skipped", report2.skipped.includes("ENG_GAP") && report2.skipped.includes("READ_ONLY_GAP"));
ok("generated file byte-identical (deterministic, no churn)", fs.readFileSync(path.join(missionsDir, "ENG_GAP.json"), "utf8") === before);

console.log("Case 5 — dry-run detects without writing");
const dryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcf-dry-"));
fs.mkdirSync(path.join(dryRoot, "runtime", "governance"), { recursive: true });
fs.mkdirSync(path.join(dryRoot, "runtime", "missions"), { recursive: true });
fs.writeFileSync(
    path.join(dryRoot, "runtime", "governance", "ROADMAP.json"),
    JSON.stringify({ missions: [{ id: "DRY_GAP", title: "gap" }] }, null, 2),
);
const dry = factory.generateMissing(dryRoot, { write: false });
ok("dry-run reports the gap", dry.generated.map((g) => g.mission).join(",") === "DRY_GAP");
ok("dry-run wrote no file", fs.existsSync(path.join(dryRoot, "runtime", "missions", "DRY_GAP.json")) === false);

console.log("Case 6 — buildContract fills the FULL contract shape (lifecycle/permissions/evidence/policies)");
const full = factory.buildContract({ id: "FULL_GAP", title: "Full gap", requiresEngineering: true });
ok("permissions block present + reflects engineering", full.permissions && full.permissions.engineering === true && full.permissions.network === false);
ok("permissions.authorizedPaths mirrors authorized_paths", JSON.stringify(full.permissions.authorizedPaths) === JSON.stringify(full.authorized_paths));
ok("lifecycle states declared (CREATED..ARCHIVED)", Array.isArray(full.lifecycle) && full.lifecycle[0] === "CREATED" && full.lifecycle[full.lifecycle.length - 1] === "ARCHIVED");
ok("policies declared (existing vocabulary)", Array.isArray(full.policies) && full.policies.includes("DETERMINISM_FIRST"));
ok("evidence surface declared", Array.isArray(full.evidence) && full.evidence.some((e) => e.includes("mission-report.json")));

console.log("Case 7 — Contract On Demand: generateForMission synthesizes an ARBITRARY (non-roadmap) mission");
const odRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcf-od-"));
fs.mkdirSync(path.join(odRoot, "runtime", "missions"), { recursive: true });
fs.mkdirSync(path.join(odRoot, "runtime", "governance"), { recursive: true });
fs.writeFileSync(path.join(odRoot, "runtime", "governance", "ROADMAP.json"), JSON.stringify({ missions: [] }, null, 2));
const od = factory.generateForMission(odRoot, "SOME_BRAND_NEW_MISSION", { write: true });
ok("reports generated (not reused)", od.generated === true && od.reused === false);
ok("wrote the contract to the conventional path", fs.existsSync(path.join(odRoot, "runtime", "missions", "SOME_BRAND_NEW_MISSION.json")));
const odContract = JSON.parse(fs.readFileSync(path.join(odRoot, "runtime", "missions", "SOME_BRAND_NEW_MISSION.json"), "utf8"));
ok("on-demand contract is Loader-valid", synth.isValidContract(odContract) === true);
ok("on-demand contract is stamped generatedBy factory", odContract.generatedBy === "mission-contract-factory");
ok("goal humanized from id", odContract.objectives[0].goal.includes("Some Brand New Mission"));

console.log("Case 8 — generateForMission REUSES an existing executable contract untouched (backward compat)");
fs.writeFileSync(
    path.join(odRoot, "runtime", "missions", "HAND_WRITTEN.json"),
    JSON.stringify({ mission: "HAND_WRITTEN", objectives: [{ id: "H1", goal: "authored by a human" }] }, null, 2),
);
const beforeHW = fs.readFileSync(path.join(odRoot, "runtime", "missions", "HAND_WRITTEN.json"), "utf8");
const reuse = factory.generateForMission(odRoot, "HAND_WRITTEN", { write: true });
ok("reports reused (not generated)", reuse.reused === true && reuse.generated === false);
ok("existing contract left byte-identical", fs.readFileSync(path.join(odRoot, "runtime", "missions", "HAND_WRITTEN.json"), "utf8") === beforeHW);

console.log("Case 9 — isOnDemandEnabled is governed by policy + env override");
const polDir = path.join(odRoot, "runtime", "policies");
fs.mkdirSync(polDir, { recursive: true });
fs.writeFileSync(path.join(polDir, "runtime-policies.json"), JSON.stringify({ contractOnDemand: { enabled: true } }, null, 2));
const savedEnv = process.env.ODG_CONTRACT_ON_DEMAND;
delete process.env.ODG_CONTRACT_ON_DEMAND;
ok("enabled when policy enables it", factory.isOnDemandEnabled(odRoot) === true);
fs.writeFileSync(path.join(polDir, "runtime-policies.json"), JSON.stringify({ contractOnDemand: { enabled: false } }, null, 2));
ok("disabled when policy disables it", factory.isOnDemandEnabled(odRoot) === false);
process.env.ODG_CONTRACT_ON_DEMAND = "1";
ok("env override forces enabled", factory.isOnDemandEnabled(odRoot) === true);
process.env.ODG_CONTRACT_ON_DEMAND = "0";
ok("env override forces disabled", factory.isOnDemandEnabled(odRoot) === false);
if (savedEnv === undefined) delete process.env.ODG_CONTRACT_ON_DEMAND;
else process.env.ODG_CONTRACT_ON_DEMAND = savedEnv;

console.log("Case 10 — intent implies capability proofs (verify) the Validation Engine executes");
const conn = factory.buildContract({ id: "RUN_CONNECTIVITY_AUDIT", title: "Run Connectivity Audit", requiresEngineering: false });
ok("connectivity mission declares a verify block", Array.isArray(conn.verify) && conn.verify.length === 1);
ok("declared probe is the registered internet-reachable evidence", conn.verify[0].evidence === "internet-reachable");
ok("declared contract stays Loader-valid with verify", synth.isValidContract(conn) === true);
const internet = factory.buildContract({ id: "INTERNET_CONNECTIVITY_AUDIT", title: "Internet Connectivity Audit" });
ok("internet mission also declares the probe", Array.isArray(internet.verify) && internet.verify[0].evidence === "internet-reachable");
const online = factory.buildContract({ id: "EXPLORE_ONLINE_OPPORTUNITIES", title: "Explore Online Opportunities", requiresEngineering: false });
ok("online-opportunity mission declares the internet-reachable proof", Array.isArray(online.verify) && online.verify[0].evidence === "internet-reachable");
const unrelated = factory.buildContract({ id: "READ_ONLY_GAP", title: "A read-only gap", requiresEngineering: false });
ok("unrelated mission declares NO verify block (unchanged behaviour)", unrelated.verify === undefined);
ok("resolveVerifyProbes de-duplicates by evidence", factory.resolveVerifyProbes({ id: "X", title: "connectivity internet check" }).length === 1);

// External research intent declares the research-acquired proof, and is DISTINCT from connectivity.
const research = factory.resolveVerifyProbes({ id: "ADD_GOVERNED_EXTERNAL_RESEARCH_EXECUTOR", title: "Add governed external research executor" });
ok("external-research intent declares the research-acquired proof", research.some((p) => p.evidence === "research-acquired"));
ok("external-research intent does NOT declare internet-reachable", !research.some((p) => p.evidence === "internet-reachable"));
const onlineProbes = factory.resolveVerifyProbes({ id: "EXPLORE_ONLINE_OPPORTUNITIES", title: "Explore Online Opportunities" });
ok("a connectivity/online mission does NOT declare research-acquired (reachability ≠ research)", !onlineProbes.some((p) => p.evidence === "research-acquired"));

console.log("Case 11 — scope is GROUNDED on the mission's own path tokens, not a blind runtime/** guess");
// Regression for FIX_AUTONOMY_*: the real target lived in src/runtime/** (outside runtime/**), yet the
// factory fabricated authorized_paths=['runtime/**'], which the Delegation Brief then inherited — so the
// brief handed Claude Code a WRONG scope and the repair could never be delegated. A mission that NAMES
// its target in its own text must now scope to THAT path.
const grounded = factory.buildContract({
    id: "FIX_SOMETHING",
    title: "Fix something",
    goal: "Repair the loop in src/runtime/autonomy-cli.ts so it continues after a blocked mission",
    requiresEngineering: true,
});
ok("derives the named target path (reaches outside runtime/**)", grounded.authorized_paths.includes("src/runtime/autonomy-cli.ts"));
ok("does NOT fabricate the blind runtime/** default when a path is grounded", !grounded.authorized_paths.includes("runtime/**"));
ok("grounded-scope contract stays Loader-valid", synth.isValidContract(grounded) === true);
ok("brief would derive the SAME scope (factory ↔ delegate agree)", JSON.stringify(factory.derivePathScope({ goal: "x src/runtime/autonomy-cli.ts y" })) === JSON.stringify(["src/runtime/autonomy-cli.ts"]));

// Backward compatible: a mission whose text grounds NO path keeps the safe engineering default.
const noPath = factory.buildContract({ id: "FIX_GENERIC", title: "Fix generic thing", requiresEngineering: true });
ok("no grounded path ⇒ safe runtime/** default preserved (backward compatible)", noPath.authorized_paths.includes("runtime/**"));

// An explicitly-declared scope is honoured verbatim and NEVER widened by derivation (no scope creep).
const explicitScoped = factory.buildContract({ id: "X_EXPLICIT", title: "names src/foo.ts in title", authorized_paths: ["runtime/core/x.js"], requiresEngineering: true });
ok("explicit authorized_paths honoured verbatim (derivation never widens it)", JSON.stringify(explicitScoped.authorized_paths) === JSON.stringify(["runtime/core/x.js"]));

// P1 (B143) — conservative autonomy-eligibility declaration + end-to-end measurability via the EXISTING
// measurer (autonomy-measure.eligibilityFromObjectives), which reads ONLY explicit per-objective
// `authorization` declarations and never infers eligibility.
const measure = require("./autonomy-measure");

// An ENGINEERING mission's synthesized objectives each carry {eligible:true, authorized:true}.
const engC = factory.buildContract({ id: "ENG_MISSION", title: "Engineering mission", requiresEngineering: true, authorized_paths: ["runtime/**"] });
ok("engineering objectives declare authorization {eligible,authorized}", engC.objectives.every((o) => o.authorization && o.authorization.eligible === true && o.authorization.authorized === true));
// The measurer now finds a COMPLETE eligibility denominator (no 'missing' ⇒ measurable denominator possible).
const engElig = measure.eligibilityFromObjectives(engC.objectives);
ok("eligibilityFromObjectives(engineering) is complete (denominator declared, no missing)", engElig.complete === true && engElig.missing.length === 0);

// A READ-ONLY mission's objectives are EXCLUDED with a justified reason (conservative; not counted).
const roC = factory.buildContract({ id: "RO_MISSION", title: "Read only mission", requiresEngineering: false });
ok("read-only objectives declare a justified exclusion", roC.objectives.every((o) => o.authorization && o.authorization.excluded === true && typeof o.authorization.reason === "string" && o.authorization.reason.length > 0));
const roElig = measure.eligibilityFromObjectives(roC.objectives);
ok("read-only exclusions are a VALID (complete) classification, excluded from the denominator", roElig.complete === true && Object.values(roElig.map).every((m) => m.eligible === false && m.authorized === false));

// CONSERVATIVE: declaring eligibility NEVER by itself makes a unit a verified ODG success — the numerator
// is evidence-gated downstream. Here we only prove the DENOMINATOR is now declarable (no inflation path).
ok("declaration completes the denominator only (eligible+authorized), numerator stays evidence-gated", engElig.map[engC.objectives[0].id].eligible === true);

console.log("Case 12 — RECLASSIFY_DELIVERY: fail-closed 3-class classification (OBSERVATION | DELIVERY | UNKNOWN)");
// UI_DEPLOYMENT_FOUNDATION reproduction: synthesized from the id/title ALONE, no declared signal → UNKNOWN,
// fail-closed to engineering so a bare no-op can never pass as read-only SUCCESS (the original false success).
const uiCls = factory.classifyMission({ id: "UI_DEPLOYMENT_FOUNDATION", title: factory.humanizeId("UI_DEPLOYMENT_FOUNDATION") });
ok("UI-shape (id/title only, no signal) ⇒ UNKNOWN", uiCls.missionClass === "UNKNOWN");
ok("UNKNOWN basis is name-independent (not classified by name alone)", uiCls.classBasis.join(" ").includes("id/title alone"));
const uiBuilt = factory.buildContract({ id: "UI_DEPLOYMENT_FOUNDATION", title: factory.humanizeId("UI_DEPLOYMENT_FOUNDATION") });
ok("UNKNOWN ⇒ fail-closed engineering (NOT read-only)", uiBuilt.requires_engineering === true && uiBuilt.authorized_paths.length > 0);
ok("explicit missionClass stamped on the contract", uiBuilt.missionClass === "UNKNOWN" && Array.isArray(uiBuilt.classBasis) && uiBuilt.classBasis.length > 0);

// Legitimate OBSERVATION audits (M0000/M0001/M0002 carry mode:"AUDIT") stay read-only — A3 guard preserved.
const auCls = factory.classifyMission({ id: "SOME_AUDIT", title: "Some audit", mode: "AUDIT" });
ok("mode:AUDIT ⇒ OBSERVATION", auCls.missionClass === "OBSERVATION");
const auBuilt = factory.buildContract({ id: "SOME_AUDIT", title: "Some audit", mode: "AUDIT" });
ok("OBSERVATION ⇒ read-only preserved (requires_engineering false, no paths)", auBuilt.requires_engineering === false && auBuilt.authorized_paths.length === 0);

// An EXPLICIT requires_engineering:false is a DECLARED read-only intent ⇒ OBSERVATION (existing behaviour kept).
ok("explicit requires_engineering:false ⇒ OBSERVATION (declared read-only honoured)",
    factory.classifyMission({ id: "RO", title: "ro", requiresEngineering: false }).missionClass === "OBSERVATION");

// DELIVERY signals.
ok("explicit requires_engineering:true ⇒ DELIVERY",
    factory.classifyMission({ id: "E", title: "e", requiresEngineering: true }).missionClass === "DELIVERY");
ok("names a concrete file target ⇒ DELIVERY (structural, not a name keyword)",
    factory.classifyMission({ id: "T", title: "t", goal: "update src/app/page.tsx" }).missionClass === "DELIVERY");

// CONTRADICTORY inputs must NEVER silently resolve read-only — a delivery signal fails toward evidence.
ok("contradictory (engineering flag + AUDIT mode) ⇒ DELIVERY (evidence-required, never silent read-only)",
    factory.classifyMission({ id: "C1", title: "c1", requiresEngineering: true, mode: "AUDIT" }).missionClass === "DELIVERY");
ok("contradictory (engineering MODE + requires_engineering:false) ⇒ DELIVERY (evidence-required)",
    factory.classifyMission({ id: "C2", title: "c2", requiresEngineering: false, mode: "ENGINEERING" }).missionClass === "DELIVERY");

console.log("Case 13 — end-to-end: UNKNOWN delivery no-op is BLOCKED; declared OBSERVATION no-op still SUCCEEDS");
const { spawnSync } = require("child_process");
const VE = path.join(process.cwd(), "runtime", "core", "validation-engine.js");
function runVEforContract(contract, execStatus, seedGit) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "a1-e2e-"));
    const G = (n) => path.join(dir, "runtime", "generated", n);
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    if (seedGit) {
        // A committed in-scope file so engineeringOk is NOT the sole block reason — isolates the RECORDED no-op gate.
        spawnSync("git", ["init", "-q"], { cwd: dir });
        spawnSync("git", ["config", "user.email", "a@b.c"], { cwd: dir });
        spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
        fs.writeFileSync(path.join(dir, "runtime", "keep.js"), "module.exports={};\n");
        spawnSync("git", ["add", "-A"], { cwd: dir });
        spawnSync("git", ["commit", "-q", "-m", "seed"], { cwd: dir });
    }
    const plan = {
        mission: contract.mission,
        mode: contract.mode,
        requiresEngineering: contract.permissions.engineering,
        authorizedPaths: contract.authorized_paths,
        objectives: [{ id: "OBJ1", goal: "the thing" }],
        definitionOfDone: ["Evidence generated"],
    };
    fs.writeFileSync(G("mission-plan.json"), JSON.stringify(plan));
    fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: contract.mission, patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }] }));
    fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: contract.mission, executed: [{ action: "OBJ1", objectiveId: "OBJ1", status: execStatus }] }));
    fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true, gitClean: true }));
    const r = spawnSync("node", [VE], { cwd: dir, encoding: "utf8" });
    const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
    return { status: rep.status, validated: rep.validated, exit: r.status ?? -1 };
}
// UI-shape UNKNOWN → engineering → a RECORDED no-op is BLOCKED (was SUCCESS before the fix: baseline showed it read-only).
const uiE2E = runVEforContract(uiBuilt, "RECORDED", true);
ok("UNKNOWN delivery no-op ⇒ validation BLOCKED (exit 1)", uiE2E.validated === false && uiE2E.status === "BLOCKED" && uiE2E.exit === 1);
// Declared OBSERVATION audit → read-only → a RECORDED no-op still SUCCEEDS (A3 inert — M0000-class not over-blocked).
const auE2E = runVEforContract(auBuilt, "RECORDED", false);
ok("declared OBSERVATION no-op ⇒ validation SUCCESS (exit 0, A3 inert)", auE2E.validated === true && auE2E.status === "SUCCESS" && auE2E.exit === 0);

console.log("Case 14 — HEALTH read-only probe classification fix (CTO HEALTH_1): read-only probes are OBSERVATION");
// A liveness/health/diagnostic probe with NO delivery signal must classify OBSERVATION (not UNKNOWN→engineering),
// so a read-only mission can SUCCEED on its observable result without artificially demanding a patch.
const healthCls = factory.classifyMission({ id: "health", title: factory.humanizeId("health") });
ok("health probe (no delivery signal) ⇒ OBSERVATION", healthCls.missionClass === "OBSERVATION");
const diagCls = factory.classifyMission({ id: "self-diagnostic", title: "Self Diagnostic" });
ok("self-diagnostic probe ⇒ OBSERVATION", diagCls.missionClass === "OBSERVATION");
const healthBuilt = factory.buildContract({ id: "health", title: factory.humanizeId("health") });
ok("health contract ⇒ read-only (requires_engineering false, no authorized_paths)", healthBuilt.requires_engineering === false && healthBuilt.authorized_paths.length === 0);
ok("health contract ⇒ mode is a recognized observation mode", ["AUDIT", "READ_ONLY", "ANALYZE"].includes(String(healthBuilt.mode).toUpperCase()));
ok("health contract ⇒ done_when asks for read-only evidence, NOT 'Authorized patch applied'",
    healthBuilt.definition_of_done.some((d) => /read-only evidence/i.test(d)) && !healthBuilt.definition_of_done.some((d) => /Authorized patch applied/i.test(d)));

// FAIL-CLOSED PRESERVED: a read-only keyword that ALSO carries a delivery signal stays DELIVERY (never weakened).
ok("health keyword + requires_engineering:true ⇒ DELIVERY (delivery precedence, fail-closed intact)",
    factory.classifyMission({ id: "health", title: "health", requiresEngineering: true }).missionClass === "DELIVERY");
ok("health keyword + named file target ⇒ DELIVERY (engineering implied)",
    factory.classifyMission({ id: "fix-health", title: "fix health", goal: "repair runtime/core/health-probe.ts" }).missionClass === "DELIVERY");
// UNKNOWN fail-closed still holds for a non-probe mission with no signal (Case 12 invariant re-asserted).
ok("non-probe, no-signal mission still UNKNOWN (fail-closed unchanged)",
    factory.classifyMission({ id: "UI_DEPLOYMENT_FOUNDATION", title: factory.humanizeId("UI_DEPLOYMENT_FOUNDATION") }).missionClass === "UNKNOWN");

// END-TO-END through the real Validation Engine: the health OBSERVATION contract's RECORDED no-op SUCCEEDS,
// while an ENGINEERING no-op (uiBuilt, UNKNOWN→engineering) stays BLOCKED (fail-closed intact).
const healthE2E = runVEforContract(healthBuilt, "RECORDED", false);
ok("health OBSERVATION no-op ⇒ validation SUCCESS (exit 0; observable result accepted, no patch demanded)",
    healthE2E.validated === true && healthE2E.status === "SUCCESS" && healthE2E.exit === 0);
const engNoOpStillBlocked = runVEforContract(uiBuilt, "RECORDED", true);
ok("engineering no-op still BLOCKED (fail-closed for real-modification missions intact)",
    engNoOpStillBlocked.validated === false && engNoOpStillBlocked.status === "BLOCKED" && engNoOpStillBlocked.exit === 1);

// A GAMMA objective (requiresExecution) must STILL block even in a read-only mode (DEF-GAMMA defence intact).
const gammaPlanDir = (() => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gamma-ro-"));
    const G = (n) => path.join(dir, "runtime", "generated", n);
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    fs.writeFileSync(G("mission-plan.json"), JSON.stringify({ mission: "RO_GAMMA", mode: "READ_ONLY", requiresEngineering: false, authorizedPaths: [], objectives: [{ id: "OBJ1", goal: "x", requiresExecution: true }], definitionOfDone: ["x"] }));
    fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "RO_GAMMA", patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }] }));
    fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "RO_GAMMA", executed: [{ action: "OBJ1", objectiveId: "OBJ1", status: "RECORDED" }] }));
    fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true }));
    return dir;
})();
{
    const r = spawnSync("node", [path.join(process.cwd(), "runtime", "core", "validation-engine.js")], { cwd: gammaPlanDir, encoding: "utf8" });
    const rep = JSON.parse(fs.readFileSync(path.join(gammaPlanDir, "runtime", "generated", "mission-report.json"), "utf8"));
    ok("read-only mode does NOT excuse a requiresExecution no-op (DEF-GAMMA defence intact ⇒ BLOCKED)", rep.validated === false && (r.status ?? -1) === 1);
}

// --- IDENTIFIER GUARD (regression): the factory must NEVER persist a contract for a non-identifier ----
// Reproduces the real defect — junk files like runtime/missions/--help.json, __probe__.json and a
// free-text ".json" were written by the factory (source:mission-contract-factory) because invalid ids
// were accepted. The fail-closed guard refuses generation at the write chokepoint (no file, invalid verdict).
{
    const gdir = fs.mkdtempSync(path.join(os.tmpdir(), "mcf-guard-"));
    fs.mkdirSync(path.join(gdir, "runtime", "missions"), { recursive: true });
    fs.mkdirSync(path.join(gdir, "runtime", "governance"), { recursive: true });
    const JUNK = ["--help", "--plan-only", "__probe__", "__none__", "__SMOKE_NONEXISTENT__", "a free text objective sentence", ""];
    for (const bad of JUNK) {
        const r = factory.generateForMission(gdir, bad, { write: true });
        ok(`guard: generateForMission refuses "${bad}" (invalid, not generated)`, r && r.invalid === true && r.generated === false && r.reason === "INVALID_MISSION_IDENTIFIER");
    }
    // NOT A SINGLE junk file was written to the missions dir.
    const written = fs.readdirSync(path.join(gdir, "runtime", "missions"));
    ok("guard: no junk contract file persisted for any invalid id", written.length === 0);
    // A VALID identifier STILL generates (guard is additive, not a regression on real work).
    const good = factory.generateForMission(gdir, "REAL_MISSION_X", { write: true });
    ok("guard: a valid identifier still generates + writes", good && good.generated === true && good.invalid !== true && fs.existsSync(path.join(gdir, "runtime", "missions", "REAL_MISSION_X.json")));
    // generateMissing also routes an invalid roadmap entry id to report.invalid (no write).
    fs.writeFileSync(path.join(gdir, "runtime", "governance", "ROADMAP.json"), JSON.stringify({ missions: [{ id: "__probe__" }, { id: "GOOD_ROADMAP_MISSION" }] }));
    const rep = factory.generateMissing(gdir, { write: true });
    ok("guard: generateMissing pushes invalid roadmap id to report.invalid", Array.isArray(rep.invalid) && rep.invalid.includes("__probe__"));
    ok("guard: generateMissing did NOT write a __probe__ contract", !fs.existsSync(path.join(gdir, "runtime", "missions", "__probe__.json")));
    fs.rmSync(gdir, { recursive: true, force: true });
}

console.log(`\nMISSION CONTRACT FACTORY — ${passed} assertions passed.`);
