#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.
"use strict";
/*
 * SHARED-DEP SCRIPTS DUAL-PORT PARITY (CTO L6 sub-lot 2) — capability-classify (consumed by odg-status
 * both ports via require(.../scripts/capability-classify.js)) and compass-update (consumed by the resume
 * command + odg-local-pipeline.sh + 2 tests). tsx-run dual-port: TS SOURCE + JS rollback. The consumers
 * load the .js explicitly + cwd-anchored, so it stays the consumed port until L7; the .ts is proven
 * byte-equivalent here. Runs under tsx so it requires BOTH ports; fs-touching functions use a temp repoRoot.
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }
const load = (rel) => require(path.join(REPO, rel));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ===== capability-classify: pure classOf/classify + fs readRegistryNames =====
{
  const js = load("scripts/capability-classify.js"), ts = load("scripts/capability-classify.ts");
  ok("capability-classify: same API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
  const names = ["NL_FOO_1", "IMPLEMENT_X", "FIX_Y", "quote-engine", "invoicing", "NL_BAR_2", "quote-engine", "AUDIT_Z"];
  for (const n of ["NL_A", "IMPLEMENT_X", "quote-engine", "deploy-thing", "M0001"]) ok(`classOf parity — ${n}`, js.classOf(n) === ts.classOf(n));
  ok("classify parity (buckets + coherence + duplicates)", eq(js.classify(names), ts.classify(names)));
  ok("classify non-vacuous (3 classes, duplicate detected, coherent flag)",
    js.classify(names).nlGenerated === 2 && js.classify(names).missionDerived === 3 && js.classify(names).duplicates.includes("quote-engine") && js.classify(names).coherent === false);
  // readRegistryNames from a temp repoRoot with a fixture registry.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "capclass-par-"));
  fs.mkdirSync(path.join(root, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(path.join(root, "runtime", "generated", "capability-registry.json"), JSON.stringify({ capabilities: ["NL_A", { id: "FIX_B" }, "quote"] }));
  ok("readRegistryNames parity (string + {id} forms)", eq(js.readRegistryNames(root), ts.readRegistryNames(root)) && js.readRegistryNames(root).length === 3);
  ok("readRegistryNames parity (absent registry → null)", js.readRegistryNames(path.join(root, "nope")) === ts.readRegistryNames(path.join(root, "nope")));
  fs.rmSync(root, { recursive: true, force: true });
}

// ===== compass-update: sig/effectiveStatus/update/fromReport/resumeState (fail-closed) =====
{
  const js = load("scripts/compass-update.js"), ts = load("scripts/compass-update.ts");
  ok("compass-update: same API", eq(Object.keys(js).sort(), Object.keys(ts).sort()));
  const r = { mission: "M", commit: "abc", status: "PASS", evidence: ["a", "b"] };
  ok("sig parity (deterministic sha)", js.sig(r) === ts.sig(r));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "compass-par-"));
  fs.mkdirSync(path.join(root, "runtime", "generated"), { recursive: true });
  fs.writeFileSync(path.join(root, "evidence.txt"), "x");
  const now = () => "2026-01-01T00:00:00.000Z";
  const effCases = [
    { mission: "M", status: "PASS", acceptanceMet: true, evidence: ["evidence.txt"] },   // PASS (evidence exists)
    { mission: "M", status: "PASS", acceptanceMet: true, evidence: ["missing.txt"] },     // → BLOCKED (missing)
    { mission: "M", status: "PASS", acceptanceMet: false, evidence: ["evidence.txt"] },   // → BLOCKED (acceptance)
    { mission: "M", status: "PASS", acceptanceMet: true, evidence: [] },                  // → BLOCKED (no evidence)
    { mission: "M", status: "FAIL", reason: "boom" },                                     // FAIL as-is
    { mission: "M", status: "PARTIAL" },                                                  // PARTIAL as-is
  ];
  for (const c of effCases) ok(`effectiveStatus parity — ${c.status}/${c.acceptanceMet}/${(c.evidence || []).length}ev`, eq(js.effectiveStatus(c, root), ts.effectiveStatus(c, root)));
  ok("effectiveStatus non-vacuous (fail-closed downgrades)",
    js.effectiveStatus(effCases[0], root).status === "PASS" && js.effectiveStatus(effCases[1], root).status === "BLOCKED" && js.effectiveStatus(effCases[2], root).status === "BLOCKED");

  // update() → compare returned state + written file, on independent temp files, injected clock.
  function drive(mod, file) {
    const res = mod.update({ mission: "M", commit: "c1", status: "PASS", acceptanceMet: true, evidence: ["evidence.txt"], verified: true, branch: "main", worktreeClean: true }, { repoRoot: root, file, now });
    return { res, written: fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "<ABSENT>" };
  }
  const jU = drive(js, path.join(root, "ckpt-js.json")), tU = drive(ts, path.join(root, "ckpt-ts.json"));
  ok("update parity (returned effective + note + state)", eq(jU.res.effective, tU.res.effective) && jU.res.note === tU.res.note);
  ok("update parity (written checkpoint byte-identical)", jU.written === tU.written && /"verifiedCheckpoint"/.test(jU.written) && /"commit": "c1"/.test(jU.written));

  // fromReport() with a fixture mission-report (identity + freshness guards).
  fs.writeFileSync(path.join(root, "runtime", "generated", "mission-report.json"), JSON.stringify({ mission: "M", status: "SUCCESS", validated: true }));
  ok("fromReport parity (identity match → PASS-eligible)", eq(stripGit(js.fromReport("M", root, {})), stripGit(ts.fromReport("M", root, {}))));
  ok("fromReport parity (identity mismatch → NOT_RUN)", eq(stripGit(js.fromReport("OTHER", root, {})), stripGit(ts.fromReport("OTHER", root, {}))) && js.fromReport("OTHER", root, {}).status === "NOT_RUN");

  // resumeState() with a fixture checkpoint (git HEAD unavailable in temp → fields comparable).
  fs.writeFileSync(path.join(root, "runtime", "generated", "compass-checkpoint.json"), JSON.stringify({ verifiedCheckpoint: { commit: "deadbeef", mission: "M" }, lastMission: { mission: "M", status: "PASS" } }));
  ok("resumeState parity (verdict + reason, git-normalized)", eq(normHead(js.resumeState(root)), normHead(ts.resumeState(root))));
  fs.rmSync(root, { recursive: true, force: true });
}

// gitId() varies by environment; strip commit/branch so the comparison is of the migration-relevant logic.
function stripGit(o) { const c = { ...o }; delete c.commit; delete c.branch; return c; }
function normHead(o) { const c = { ...o }; c.head = "<HEAD>"; if (c.consistent !== undefined) c.consistent = typeof c.consistent; c.status = c.status; return c; }

console.log(`\nshared-dep scripts dual-port parity — ${passed} assertions passed.`);
