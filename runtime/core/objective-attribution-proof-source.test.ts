// @ts-nocheck — Lot C: attribution reads the proof binding from the CONTRACT objective (plan), not the patch.
/*
 * CTO "attribution/validation consistency" — regression lock reproducing VE_CROSS_MISSION_OWNERSHIP_GUARD.
 * The proof binding is declared on the mission CONTRACT objective (plan.objectives[].proof) — the SAME
 * source the Validation Engine reads. Previously objective-attribution read ONLY patches[i].proof, so a
 * mission that declared its proof on the contract (and not on the patch) was mis-observed as
 * NO-PROOF-BINDING while the engine correctly saw it ⇒ a documented analyzer disagreement. This proves the
 * fix: the proof is now resolved from the contract (by objectiveId), with a legacy patch fallback, dual-port.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = process.cwd();
const JS = path.join(REPO, "runtime", "core", "objective-attribution.js");
const DIST = path.join(REPO, "runtime", "dist", "core", "objective-attribution.js");
const evProbe = (p) => { try { return fs.existsSync(path.join(REPO, p)); } catch { return false; } };

console.log("ATTRIBUTION PROOF SOURCE — proof read from the contract objective (VE case), both ports");
ok("prerequisite: compiled dist objective-attribution present", fs.existsSync(DIST));

// Reproduce VE: proof on the CONTRACT objective, NONE on the patch. Real probe registry (defaults).
const vePlan = { objectives: [{ id: "VE_1", proof: "ve-cross-mission-ownership-guard-proven" }] };
const vePatch = { patches: [{ objectiveId: "VE_1", done_when: ["x"] }] }; // deliberately no proof here
const veExec = { executed: [{ objectiveId: "VE_1", status: "EXECUTED", evidence: "runtime/generated/mission-report.json" }] };

const veOut = {};
for (const [label, modPath] of [["historical .js", JS], ["compiled dist", DIST]]) {
    delete require.cache[modPath];
    const mod = require(modPath);
    const { objectives } = mod.attributeObjectives(vePlan, vePatch, veExec, evProbe); // real runProbe + known
    const o = objectives.find((x) => x.objectiveId === "VE_1");
    veOut[label] = o.declaredProof;
    ok(`${label}: proof resolved from the CONTRACT objective (not the patch)`,
        o.declaredProof.proof === "ve-cross-mission-ownership-guard-proven");
    ok(`${label}: observed PROBE-PASSED (guard present) — was a false NO-PROOF-BINDING pre-fix`,
        o.declaredProof.observed === "PROBE-PASSED");
}
ok("dual-port parity: VE declaredProof identical (.js ≡ dist)",
    JSON.stringify(veOut["historical .js"]) === JSON.stringify(veOut["compiled dist"]));

// Negative: an UNKNOWN proof declared on the contract ⇒ PROBE-MISSING, never a PASS.
{
    delete require.cache[JS];
    const mod = require(JS);
    const { objectives } = mod.attributeObjectives(
        { objectives: [{ id: "U_1", proof: "__no_such_probe__" }] },
        { patches: [{ objectiveId: "U_1", done_when: ["x"] }] },
        { executed: [{ objectiveId: "U_1", status: "RECORDED" }] },
        evProbe,
    );
    const o = objectives.find((x) => x.objectiveId === "U_1");
    ok("unknown contract proof ⇒ PROBE-MISSING (never PASS)",
        o.declaredProof.observed === "PROBE-MISSING" && o.declaredProof.observed !== "PROBE-PASSED");
}

// Backward-compat: a LEGACY proof declared on the PATCH only (no contract proof) is still observed (fallback).
{
    delete require.cache[JS];
    const mod = require(JS);
    const { objectives } = mod.attributeObjectives(
        { objectives: [{ id: "L_1" }] },                                   // no contract proof
        { patches: [{ objectiveId: "L_1", done_when: ["x"], proof: "build-green" }] },
        { executed: [{ objectiveId: "L_1", status: "RECORDED" }] },
        evProbe,
        () => ({ ok: true, detail: "fake" }),                              // injected runner
        () => true,                                                        // injected known
        {},
    );
    const o = objectives.find((x) => x.objectiveId === "L_1");
    ok("backward-compat: legacy patch-declared proof still resolves via fallback",
        o.declaredProof.proof === "build-green" && o.declaredProof.observed === "PROBE-PASSED");
}

console.log(`\nATTRIBUTION PROOF SOURCE — ${passed} assertions passed.`);
