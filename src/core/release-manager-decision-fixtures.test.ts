// @ts-nocheck — Lot D: ReleaseManager.decide() decision fixtures + representative end-to-end chain.
/*
 * CTO "LIBÉRATION" — proves only a TRULY-satisfied mission releases. Part 1 drives ReleaseManager.decide()
 * directly with the four mandated fixtures (valid proof / missing proof / unknown probe / human-decision-
 * required) plus the full gate matrix + the incomplete-evidence refusal. Part 2 runs a REPRESENTATIVE
 * mission through the whole chain — validation-engine (real, spawned) → missionPipeline=validated →
 * ReleaseManager — for a valid registered proof (⇒ RELEASE) and an unknown proof (⇒ NO_RELEASE), tying the
 * verifiable proof to a correct release decision end-to-end. No production-authz or human-reserved change.
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReleaseManager } from "@/core/release-manager";
import { RELEASE_CONTRACT_VERSION } from "@/contracts/release";

let passed = 0;
function ok(name: any, cond: any) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const REPO = process.cwd();
const rm = new ReleaseManager();

function inputs(overrides: any = {}) {
  const v = { build: true, typescript: true, gitClean: true, missionPipeline: true, ...(overrides.validation || {}) };
  const base: any = {
    requestId: overrides.requestId || "M_REP",
    releaseContractVersion: RELEASE_CONTRACT_VERSION,
    validation: v,
    source: { commit: "abc1234", branch: "main" },
    documentationProof: { inputsHash: "deadbeefcafe" },
    artifacts: [{ kind: "report", id: "mission-report", version: "1" }],
    previousReleaseRef: null,
  };
  if ("documentationProof" in overrides) base.documentationProof = overrides.documentationProof;
  return base;
}

console.log("RELEASE MANAGER — decision fixtures + representative end-to-end");

// ── Part 1 — the four mandated fixtures. ─────────────────────────────────────────────────────────────
ok("1. valid proof + all gates green ⇒ RELEASE",
  (() => { const r = rm.decide(inputs()); return r.ok === true && r.record.decision === "RELEASE"; })());
ok("2. missing/failed proof ⇒ missionPipeline=false ⇒ NO_RELEASE",
  (() => { const r = rm.decide(inputs({ validation: { missionPipeline: false } })); return r.ok === true && r.record.decision === "NO_RELEASE" && r.record.gates.missionPipeline === false; })());
ok("3. unknown-probe mission ⇒ validation BLOCKED ⇒ missionPipeline=false ⇒ NO_RELEASE",
  (() => { const r = rm.decide(inputs({ requestId: "UNKNOWN_PROOF", validation: { missionPipeline: false } })); return r.record.decision === "NO_RELEASE"; })());
ok("4. human-decision-required mission ⇒ not validated ⇒ NO_RELEASE (never auto-released)",
  (() => { const r = rm.decide(inputs({ requestId: "DEPLOY_PROD", validation: { missionPipeline: false } })); return r.record.decision === "NO_RELEASE"; })());

// Gate matrix — flipping ANY single gate false ⇒ NO_RELEASE (all gates genuinely required).
for (const g of ["build", "typescript", "gitClean", "missionPipeline"]) {
  const r = rm.decide(inputs({ validation: { [g]: false } }));
  ok(`gate ${g}=false ⇒ NO_RELEASE (no partial release)`, r.record.decision === "NO_RELEASE");
}

// Incomplete evidence (no documentation proof) ⇒ ok:false EVIDENCE_INCOMPLETE — no decision, never RELEASE.
ok("incomplete evidence (no doc proof) ⇒ ok:false, never RELEASE",
  (() => { const r = rm.decide(inputs({ documentationProof: undefined })); return r.ok === false && r.error && /INCOMPLETE/.test(r.error.code); })());

// ── Part 2 — representative mission through the WHOLE chain (validation-engine → release). ────────────
const VE_JS = path.join(REPO, "runtime", "dist", "core", "validation-engine.js");

// Spawn the real validation-engine in a temp cwd seeded so the ve-cross-mission guard probe can read the
// (present) guard sources; return the mission report. Faithful: same engine, same probe registry.
function runVE(proof: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rel-e2e-"));
  const G = (n: string) => path.join(dir, "runtime", "generated", n);
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(dir, "runtime", "core"), { recursive: true });
  // seed the guard sources + acceptance test so the structural probe observes them (present ⇒ passes).
  for (const f of ["validation-engine.ts", "validation-engine-cross-mission.test.ts"]) { // ZERO-JS: source .js retired; .ts seeds the structural probe
    fs.copyFileSync(path.join(REPO, "runtime", "core", f), path.join(dir, "runtime", "core", f));
  }
  // ZERO-JS: the ve-cross-mission probe also reads the COMPILED dist port (cwd-relative) — seed it too.
  fs.mkdirSync(path.join(dir, "runtime", "dist", "core"), { recursive: true });
  fs.copyFileSync(path.join(REPO, "runtime", "dist", "core", "validation-engine.js"), path.join(dir, "runtime", "dist", "core", "validation-engine.js"));
  fs.writeFileSync(G("mission-plan.json"), JSON.stringify({ mission: "VE_CROSS_MISSION_OWNERSHIP_GUARD", mode: "READ_ONLY", requiresEngineering: false, authorizedPaths: [], objectives: [{ id: "VE_1", proof }], definitionOfDone: ["x"] }));
  fs.writeFileSync(G("patch-plan.json"), JSON.stringify({ mission: "VE_CROSS_MISSION_OWNERSHIP_GUARD", patches: [{ id: 1, action: "VE_1", objectiveId: "VE_1", status: "PLANNED" }] }));
  fs.writeFileSync(G("patch-execution.json"), JSON.stringify({ mission: "VE_CROSS_MISSION_OWNERSHIP_GUARD", executed: [{ objectiveId: "VE_1", action: "VE_1", status: "EXECUTED", evidence: "runtime/generated/e.json" }] }));
  fs.writeFileSync(G("e.json"), JSON.stringify({ x: 1 }));
  fs.writeFileSync(G("runtime-verify.json"), JSON.stringify({ build: true, typescript: true }));
  const r = spawnSync("node", [VE_JS], { cwd: dir, encoding: "utf8" });
  const rep = JSON.parse(fs.readFileSync(G("mission-report.json"), "utf8"));
  fs.rmSync(dir, { recursive: true, force: true });
  return { exit: r.status ?? -1, validated: rep.validated === true, status: rep.status };
}

// Map the validation verdict into ReleaseInputs exactly as runtime-autonomy.assembleReleaseInputs does
// (missionPipeline = the mission-pipeline verdict), then let the real ReleaseManager decide.
function releaseFor(validated: boolean) {
  return rm.decide(inputs({ requestId: "VE_CROSS_MISSION_OWNERSHIP_GUARD", validation: { missionPipeline: validated } }));
}

// (a) VALID registered proof (guard present) ⇒ validation SUCCESS ⇒ RELEASE.
const veOk = runVE("ve-cross-mission-ownership-guard-proven");
ok("E2E: VE valid proof ⇒ validation SUCCESS (validated=true)", veOk.validated === true && veOk.status === "SUCCESS" && veOk.exit === 0);
const relOk = releaseFor(veOk.validated);
ok("E2E: validated mission ⇒ ReleaseManager RELEASE", relOk.ok === true && relOk.record.decision === "RELEASE");

// (b) UNKNOWN proof ⇒ validation BLOCKED ⇒ NO_RELEASE (chain refuses an unverifiable mission).
const veNo = runVE("__no_registered_probe__");
ok("E2E: VE unknown proof ⇒ validation BLOCKED (validated=false)", veNo.validated === false && veNo.status === "BLOCKED");
const relNo = releaseFor(veNo.validated);
ok("E2E: unvalidated mission ⇒ ReleaseManager NO_RELEASE", relNo.record.decision === "NO_RELEASE");

console.log(`\nRELEASE MANAGER DECISION FIXTURES — ${passed} assertions passed.`);
