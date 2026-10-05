#!/usr/bin/env node

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

console.log(`\nMISSION CONTRACT FACTORY — ${passed} assertions passed.`);
