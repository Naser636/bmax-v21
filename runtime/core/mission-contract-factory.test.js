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

console.log(`\nMISSION CONTRACT FACTORY — ${passed} assertions passed.`);
