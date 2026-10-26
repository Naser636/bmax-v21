// @ts-nocheck — Lot B probe-registry closure: the ve-cross-mission-ownership-guard-proven verifier.
/*
 * CTO "PROBE REGISTRY CLOSURE" — proves the newly-registered verifier for VE_CROSS_MISSION_OWNERSHIP_GUARD
 * is a GENUINE, observable, fail-closed probe (pattern: legacy-runtime-retired), NOT a generic auto-pass:
 *   POSITIVE — in the real tree (guard present in both ports + acceptance test) ⇒ ok:true.
 *   NEGATIVE — guard reverted/removed in a port ⇒ ok:false; acceptance test missing ⇒ ok:false; a port
 *              file absent ⇒ ok:false.
 * Dual-port (.ts-compiled dist ≡ historical .js). Hermetic: negatives run in throwaway cwds with fixtures.
 */
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = process.cwd();
const PROBES_JS = path.join(REPO, "runtime", "core", "capability-probes.js");
const PROBES_DIST = path.join(REPO, "runtime", "dist", "core", "capability-probes.js");
const PROBE = "ve-cross-mission-ownership-guard-proven";
const GUARD = "const crossMission = plan.mission;\nconst crossMissionOk = true;"; // both defining tokens
const NO_GUARD = "const x = 1; // guard reverted — no cross-mission computation here";

console.log("PROBE REGISTRY CLOSURE — ve-cross-mission-ownership-guard-proven (genuine, fail-closed, both ports)");
ok("prerequisite: compiled dist capability-probes present", fs.existsSync(PROBES_DIST));

function load(modPath) { delete require.cache[modPath]; return require(modPath); }

// POSITIVE — the real repository: the guard IS present in both ports and the acceptance test exists.
for (const [label, modPath] of [["historical .js", PROBES_JS], ["compiled dist", PROBES_DIST]]) {
    const mod = load(modPath);
    const r = mod.runProbe(PROBE, {});
    ok(`${label}: real tree ⇒ ok:true (guard present in both ports + acceptance test)`, r.ok === true && /present/.test(r.detail));
}

// NEGATIVE — throwaway cwd with controllable fixtures. The probe reads relative paths, so cwd drives it.
function inTempTree(fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-closure-"));
    fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
    fs.mkdirSync(path.join(dir, "runtime", "dist", "core"), { recursive: true });
    process.chdir(dir);
    try { fn(dir); } finally { process.chdir(prev); fs.rmSync(dir, { recursive: true, force: true }); }
}
function seedPort(dir, name, body) { fs.writeFileSync(path.join(dir, "runtime", "core", name), body); }
// ZERO-JS: the probe's two ports are now the .ts source (runtime/core) + the compiled dist (runtime/dist/core).
function seedDist(dir, name, body) { fs.writeFileSync(path.join(dir, "runtime", "dist", "core", name), body); }

// n1 — guard present in both ports + test present ⇒ ok:true even in a bare fixture tree (control).
inTempTree((dir) => {
    const mod = load(PROBES_JS);
    seedDist(dir, "validation-engine.js", GUARD);
    seedPort(dir, "validation-engine.ts", GUARD);
    seedPort(dir, "validation-engine-cross-mission.test.ts", "// test");
    ok("control: guard in both ports + test ⇒ ok:true", mod.runProbe(PROBE, {}).ok === true);
});

// n2 — guard REMOVED from the .ts port ⇒ ok:false (fails closed on a reverted guard).
inTempTree((dir) => {
    const mod = load(PROBES_JS);
    seedDist(dir, "validation-engine.js", GUARD);
    seedPort(dir, "validation-engine.ts", NO_GUARD);
    seedPort(dir, "validation-engine-cross-mission.test.ts", "// test");
    const r = mod.runProbe(PROBE, {});
    ok("guard reverted in a port ⇒ ok:false (no false PASS)", r.ok === false && /absent/.test(r.detail));
});

// n3 — acceptance test MISSING ⇒ ok:false.
inTempTree((dir) => {
    const mod = load(PROBES_JS);
    seedDist(dir, "validation-engine.js", GUARD);
    seedPort(dir, "validation-engine.ts", GUARD);
    const r = mod.runProbe(PROBE, {});
    ok("acceptance test missing ⇒ ok:false", r.ok === false && /acceptance test missing/.test(r.detail));
});

// n4 — a port file entirely absent ⇒ ok:false.
inTempTree((dir) => {
    const mod = load(PROBES_JS);
    seedDist(dir, "validation-engine.js", GUARD); // .ts absent
    seedPort(dir, "validation-engine-cross-mission.test.ts", "// test");
    const r = mod.runProbe(PROBE, {});
    ok("a port file absent ⇒ ok:false", r.ok === false && /port missing/.test(r.detail));
});

console.log(`\nPROBE REGISTRY CLOSURE — ${passed} assertions passed.`);
