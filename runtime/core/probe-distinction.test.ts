// @ts-nocheck — spawn/require-based regression lock for the PROOF/EVIDENCE DISTINCTION fix.
/*
 * CTO "RÉPARER LA CHAÎNE DE VALIDATION ET DE LIBÉRATION" — reproduces, and locks the repair of, the
 * conflation behind the two journal defects seen on VE_CROSS_MISSION_OWNERSHIP_GUARD:
 *   (1) "Objective(s) recorded as a no-op without evidence (RECORDED)"
 *   (2) "... did not pass: unknown evidence probe ..."
 *
 * ROOT CAUSE (fixed here): the shared probe runner returned an undifferentiated {ok:false} for TWO
 * categorically different fail-closed conditions — an UNREGISTERED probe (the VERIFIER is absent ⇒ the
 * objective is UNVERIFIABLE / undetermined, NOT disproven) vs. a REGISTERED probe that ran and found the
 * EVIDENCE missing/failing. The Validation Engine collapsed both into one "did not pass" message, so the
 * verdict (and the Release Manager downstream) could not tell "wire a real probe" from "produce the
 * evidence". The fix adds a machine-readable code "UNKNOWN_PROBE" to runProbe and reports the two
 * conditions distinctly — WITHOUT changing any verdict (both still BLOCK; a valid proof still validates).
 *
 * This test proves the three mandated invariants (step 5): an objective WITHOUT evidence stays BLOCKED;
 * an UNKNOWN probe stays BLOCKED; a VALID proof that truly satisfies the contract CAN validate. Hermetic
 * (temp cwds only) and dual-port (.ts-compiled dist ≡ historical .js).
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = process.cwd();
const PROBES_JS = path.join(REPO, "runtime", "core", "capability-probes.js");
const PROBES_DIST = path.join(REPO, "runtime", "dist", "core", "capability-probes.js");
const VE_JS = path.join(REPO, "runtime", "core", "validation-engine.js");
const VE_DIST = path.join(REPO, "runtime", "dist", "core", "validation-engine.js");

console.log("PROBE/EVIDENCE DISTINCTION — unknown-probe vs missing-evidence, fail-closed, both ports");
ok("prerequisite: compiled dist capability-probes present", fs.existsSync(PROBES_DIST));
ok("prerequisite: compiled dist validation-engine present", fs.existsSync(VE_DIST));

function writeAudit(reachable) {
    fs.writeFileSync(
        "runtime/generated/connectivity-audit.json",
        JSON.stringify({ capability: "Connectivity Audit", internet: { reachable }, summary: { http: reachable ? "2/2 reachable" : "0/2 reachable" } }),
    );
}
function inTempCwd(modPath, fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-distinction-"));
    process.chdir(dir);
    try {
        fs.mkdirSync("runtime/generated", { recursive: true });
        delete require.cache[modPath];
        fn(require(modPath));
    } finally {
        process.chdir(prev);
        delete require.cache[modPath];
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// ── Part 1 — runProbe: the distinction itself, on BOTH ports. ───────────────────────────────────────
for (const [label, modPath] of [["historical .js", PROBES_JS], ["compiled dist", PROBES_DIST]]) {
    delete require.cache[modPath];
    const mod = require(modPath);
    const unknown = mod.runProbe("__no_such_probe__", {});
    ok(`${label}: unknown probe ⇒ ok:false + code UNKNOWN_PROBE (verifier absent) — stays blocked`,
        unknown.ok === false && unknown.code === "UNKNOWN_PROBE" && /unknown evidence probe/.test(unknown.detail));
    delete require.cache[modPath];
}

// ── Part 2 — a KNOWN probe: missing evidence (blocked, NOT UNKNOWN_PROBE) vs valid evidence (passes). ──
inTempCwd(PROBES_JS, (mod) => {
    const missing = mod.runProbe("internet-reachable", {});
    ok("known probe + MISSING evidence ⇒ ok:false, code≠UNKNOWN_PROBE (evidence genuinely missing — distinct condition)",
        missing.ok === false && missing.code !== "UNKNOWN_PROBE");
    writeAudit(true);
    const valid = mod.runProbe("internet-reachable", {});
    ok("known probe + VALID evidence ⇒ ok:true (a real proof CAN pass — validation is still possible)", valid.ok === true);
});

// ── Part 3 — evaluateObjectiveProofs threads the code and stays blocking in both fail cases. ─────────
inTempCwd(PROBES_JS, (mod) => {
    const unk = mod.evaluateObjectiveProofs([{ id: "O1", proof: "__nope__" }], {});
    ok("objective declaring an UNKNOWN proof ⇒ ok:false (blocked) + failing carries code UNKNOWN_PROBE",
        unk.ok === false && unk.failing.length === 1 && unk.failing[0].code === "UNKNOWN_PROBE");
    const fail = mod.evaluateObjectiveProofs([{ id: "O2", proof: "internet-reachable" }], {}); // no audit on disk
    ok("objective declaring a KNOWN-but-unsatisfied proof ⇒ ok:false (blocked), code≠UNKNOWN_PROBE",
        fail.ok === false && fail.failing.length === 1 && fail.failing[0].code !== "UNKNOWN_PROBE");
    writeAudit(true);
    const pass = mod.evaluateObjectiveProofs([{ id: "O3", proof: "internet-reachable" }], {});
    ok("objective declaring a SATISFIED proof ⇒ ok:true (validation permitted)", pass.ok === true && pass.failing.length === 0);
});

// ── Part 4 — end-to-end through the real Validation Engine, BOTH ports: the three step-5 invariants
//            plus the faithful real-journal case (RECORDED no-op + unknown proof, now reported distinctly).
function runVE(engine, opts) {
    const { proof, audit, recorded, engineering, requiresExecution } = opts;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ve-probe-"));
    const G = (n) => path.join(dir, "runtime", "generated", n);
    fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
    const obj = { id: "OBJ1" };
    if (proof) obj.proof = proof;
    if (requiresExecution) obj.requiresExecution = true;
    const mode = engineering ? "ENGINEERING" : "READ_ONLY";
    fs.writeFileSync(G("mission-plan.json"), JSON.stringify({ mission: "M", mode, requiresEngineering: engineering === true, authorizedPaths: engineering ? ["runtime/x"] : [], objectives: [obj], definitionOfDone: ["x"] }));
    fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "M", patches: [{ id: 1, action: "OBJ1", objectiveId: "OBJ1", status: "PLANNED" }] }));
    const execEntry = { objectiveId: "OBJ1", action: "OBJ1", status: recorded ? "RECORDED" : "EXECUTED" };
    if (!recorded) execEntry.evidence = "runtime/generated/e.json";
    fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "M", executed: [execEntry] }));
    if (!recorded) fs.writeFileSync(G("e.json"), JSON.stringify({ x: 1 }));
    if (audit === true || audit === false) fs.writeFileSync(G("connectivity-audit.json"), JSON.stringify({ capability: "Connectivity Audit", internet: { reachable: audit }, summary: { http: "x" } }));
    fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true }));
    const r = spawnSync("node", [engine], { cwd: dir, encoding: "utf8" });
    const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
    fs.rmSync(dir, { recursive: true, force: true });
    return { exit: r.status ?? -1, status: rep.status, validated: rep.validated, unmet: rep.unmet || [], checks: rep.checks || {} };
}

for (const [label, VE] of [["historical .js", VE_JS], ["compiled dist", VE_DIST]]) {
    // (a) UNKNOWN probe ⇒ BLOCKED, and the reason is reported as UNVERIFIABLE (not generic "did not pass").
    const unknown = runVE(VE, { proof: "__no_probe__" });
    ok(`${label}: objective w/ UNKNOWN proof ⇒ BLOCKED validated=false (unknown probe stays blocked)`,
        unknown.status === "BLOCKED" && unknown.validated === false && unknown.exit === 1);
    ok(`${label}: unmet DISTINGUISHES the unverifiable case (names UNVERIFIABLE + the proof)`,
        unknown.unmet.some((u) => /UNVERIFIABLE/.test(u) && /__no_probe__/.test(u)));
    ok(`${label}: checks name it as objectiveProofsUnverifiable; objectiveProofsFailed is empty`,
        Array.isArray(unknown.checks.objectiveProofsUnverifiable) &&
        unknown.checks.objectiveProofsUnverifiable.some((e) => e.proof === "__no_probe__") &&
        Array.isArray(unknown.checks.objectiveProofsFailed) && unknown.checks.objectiveProofsFailed.length === 0);

    // (b) KNOWN probe, missing evidence ⇒ BLOCKED, reported as evidence-missing (distinct from unverifiable).
    const failing = runVE(VE, { proof: "internet-reachable" }); // no audit ⇒ evidence missing
    ok(`${label}: objective w/ KNOWN failing proof ⇒ BLOCKED (objective without evidence stays blocked)`,
        failing.status === "BLOCKED" && failing.validated === false);
    ok(`${label}: unmet uses the evidence-missing wording; checks.objectiveProofsFailed names it, unverifiable empty`,
        failing.unmet.some((u) => /did not pass \(evidence missing or failing\)/.test(u)) &&
        failing.checks.objectiveProofsFailed.some((e) => e.proof === "internet-reachable") &&
        failing.checks.objectiveProofsUnverifiable.length === 0);

    // (c) VALID proof truly satisfying the contract ⇒ SUCCESS (validation is still reachable — no over-blocking).
    const valid = runVE(VE, { proof: "internet-reachable", audit: true });
    ok(`${label}: objective w/ VALID proof ⇒ SUCCESS validated=true (a real, satisfied proof validates)`,
        valid.status === "SUCCESS" && valid.validated === true && valid.exit === 0);

    // (d) faithful real-journal case: an ENGINEERING RECORDED no-op + an UNKNOWN proof ⇒ BLOCKED with BOTH
    //     reasons present and now DISTINCT (the no-op gate AND the unverifiable-proof gate).
    const both = runVE(VE, { proof: "__no_probe__", recorded: true, engineering: true, requiresExecution: true });
    ok(`${label}: RECORDED no-op + UNKNOWN proof ⇒ BLOCKED with BOTH defects reported distinctly`,
        both.status === "BLOCKED" && both.validated === false &&
        both.unmet.some((u) => /no-op without evidence \(RECORDED\)/.test(u)) &&
        both.unmet.some((u) => /UNVERIFIABLE/.test(u) && /__no_probe__/.test(u)));
}

console.log(`\nPROBE/EVIDENCE DISTINCTION — ${passed} assertions passed.`);
