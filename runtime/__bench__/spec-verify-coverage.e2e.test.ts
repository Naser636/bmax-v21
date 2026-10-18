// @ts-nocheck — L5 bench test migration: runs under tsx unchanged; suppresses tsc typechecking
// (NOT strict typing) — recorded migration debt. See ODG_PROJECT_STATE.md.
"use strict";

/*
 * LOT η3-B49 — UNIFIED SPEC-VERIFICATION COVERAGE.
 * =====================================================================================================
 * η3-B46 injected the spec-schema-valid verify block only on the fromRequest path. η3-B48 showed the gap:
 * other generation paths (direct toContract, mission-contract-factory) producing an ODG_SPEC_ first
 * objective did NOT get the independent proof. η3-B49 CENTRALISES the injection in mission-synthesizer.
 * toContract (the single common generator), keyed on the first objective's ODG_SPEC_ id — so every path
 * inherits the same guarantee with no per-path duplication and no double injection.
 *
 * Proves (unit): uniform presence across fromRequest / direct toContract; factory real behaviour; non-spec
 * untouched; no double injection; determinism; the executor's own deliverable is never given a verify block.
 * Proves (e2e, real governed validation path — not just object assertions): a toContract-generated ODG_SPEC_
 * mission runs through the pipeline, the probe runs on the REAL deliverable and the mission is accepted; a
 * tampered deliverable makes the REQUIRED proof block acceptance; an absent proof is never accepted by default.
 *
 * Isolation: throwaway os.tmpdir() git sandbox outside the repo (asserted), offline (FLEET_BRIDGE_MOCK=1).
 * Run:  node --test runtime/__bench__/spec-verify-coverage.e2e.test.ts
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes = [];
const synth = require(path.join(REPO, "runtime", "core", "mission-synthesizer.js"));
const factory = require(path.join(REPO, "runtime", "core", "mission-contract-factory.js"));
const probes = require(path.join(REPO, "runtime", "core", "capability-probes.js"));
const SPEC_VERIFY = JSON.stringify([{ capability: "ODG Spec Author", evidence: "spec-schema-valid" }]);
const SPEC_GOAL = "1. scan inputs 2. validate schema 3. report findings";

function sh(c, a, cwd) { return execFileSync(c, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
function buildSandbox(contract) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-spec-cov-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox outside repo");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb); sh("git", ["-c", "user.email=b@l", "-c", "user.name=b", "add", "-A"], sb); sh("git", ["-c", "user.email=b@l", "-c", "user.name=b", "commit", "-q", "-m", "b"], sb);
  return sb;
}
function env() { const e = { ...process.env, FLEET_BRIDGE_MOCK: "1" }; delete e.ODG_FLEET; delete e.ODG_VERBOSE; return e; }
function runPipeline(sb, m) { const r = spawnSync("node", ["runtime/bin/odg-run.js", m], { cwd: sb, encoding: "utf8", env: env() }); return { code: r.status, out: (r.stdout || "") + (r.stderr || "") }; }
function runStage(sb, f, m) { return spawnSync("node", [path.join("runtime", "core", f), m], { cwd: sb, encoding: "utf8", env: env() }); }
function readGen(sb, n) { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8")); }
function runProbeIn(sb, ev) { const o = process.cwd(); try { process.chdir(sb); return probes.runProbe(ev, {}); } finally { process.chdir(o); } }
/** A directly-toContract-generated ODG_SPEC_ mission (NOT via fromRequest), authorized for a governed run. */
function directSpecContract(mission) {
  // Single-action goal ⇒ exactly ONE objective, which is the ODG_SPEC_ one (a multi-action goal would add
  // non-ODG_SPEC_ sibling objectives that route nowhere and fail the mission). The deliverable's own internal
  // decomposition is independent (produced by the executor's toContract on patch.goal).
  const c = synth.toContract({ id: mission, objectiveId: "ODG_SPEC_COVERAGE_1", goal: "Produce a structured specification of the authentication module", authorizedPaths: ["specs/**"] });
  c.mission = mission; c.status = "AUTHORIZED"; c.version = "1.0";
  c.objectives = c.objectives.map((o) => ({ ...o, authorization: { eligible: true, authorized: true } }));
  return c; // c.verify comes from toContract (centralised), NOT injected by the test
}

test.after(() => { for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /**/ } } });

// ---- UNIT: uniform coverage, no over-injection, no double injection, determinism ------------------
test("coverage: fromRequest, direct toContract, and factory are consistent; non-spec untouched; no double injection", () => {
  // 1. fromRequest explicit spec intent → exactly one spec-schema-valid block.
  const a = synth.fromRequest("Produce a structured specification of the auth module", { authorizedPaths: ["specs/**"] });
  assert.strictEqual(JSON.stringify(a.verify), SPEC_VERIFY, "fromRequest spec → spec-schema-valid");
  assert.strictEqual(Object.keys(a).filter((k) => k === "verify").length, 1, "single verify key (no double injection)");
  // 2. direct toContract with an ODG_SPEC_ objectiveId → SAME block (the B48 gap, now closed centrally).
  assert.strictEqual(JSON.stringify(synth.toContract({ goal: "x", objectiveId: "ODG_SPEC_X", authorizedPaths: ["specs/**"] }).verify), SPEC_VERIFY, "direct toContract ODG_SPEC_ → spec-schema-valid");
  // 3. factory REAL behaviour: a normal roadmap entry is NOT a spec path → no spec verify; it REUSES toContract.
  const fc = factory.buildContract({ id: "M0001", title: "Mission Framework" });
  assert.notStrictEqual(JSON.stringify(fc.verify || null), SPEC_VERIFY, "factory normal entry gets NO spec verify (unchanged real behaviour)");
  assert.ok(synth.isValidContract(fc), "factory produces a valid Mission-Loader contract (built on synth.toContract; it relabels source to mission-contract-factory)");
  // 4. non-spec contracts: no verify block added.
  assert.ok(!("verify" in synth.toContract({ goal: "wire the loader into the pipeline" })), "non-spec → no verify");
  // 5. combined/successive calls → still a single block, no accumulation.
  const b = synth.fromRequest("Generate a specification for billing", { authorizedPaths: ["specs/**"] });
  assert.strictEqual(JSON.stringify(b.verify), SPEC_VERIFY, "second spec request → single spec-schema-valid");
  // 6. determinism: same input → byte-identical contract.
  assert.strictEqual(JSON.stringify(synth.toContract({ goal: "wire the loader" })), JSON.stringify(synth.toContract({ goal: "wire the loader" })), "non-spec deterministic");
  assert.strictEqual(JSON.stringify(a), JSON.stringify(synth.fromRequest("Produce a structured specification of the auth module", { authorizedPaths: ["specs/**"] })), "spec fromRequest deterministic");
  // executor deliverable path: an id CONTAINING ODG_SPEC but whose first objectiveId is baseId_1 → NO verify.
  assert.ok(!("verify" in synth.toContract({ id: "M__ODG_SPEC_1", goal: SPEC_GOAL, authorizedPaths: [] })), "executor-internal deliverable is never given a verify block");
});

// ---- E2E: the CENTRAL (toContract-direct) path reaches the real governed validation gate --------
test("e2e: a directly-generated ODG_SPEC_ mission runs, probe executes on the real deliverable, mission accepted", () => {
  const c = directSpecContract("SPEC_COV_POS");
  assert.strictEqual(JSON.stringify(c.verify), SPEC_VERIFY, "direct spec contract carries the proof declaration");
  const sb = buildSandbox(c);
  const { code, out } = runPipeline(sb, "SPEC_COV_POS");
  assert.strictEqual(code, 0, "pipeline exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "13/13 stages");
  const deliverable = path.join(sb, "specs", "odg-spec.json");
  assert.ok(fs.existsSync(deliverable), "real deliverable produced");
  const e = readGen(sb, "patch-execution.json").executed.find((x) => String(x.objectiveId || "").startsWith("ODG_SPEC_"));
  assert.ok(e && e.capability === "ODG Spec Author" && e.authoredBy === "ODG_CAPABILITY" && e.appliedBy === "ODG_EXECUTOR", "executed by ODG Spec Author, correct attribution");
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, true, "independent probe passes on real artifact");
  assert.strictEqual(readGen(sb, "mission-report.json").validated, true, "mission accepted (required proof passed)");
});

test("e2e: a tampered deliverable makes the REQUIRED proof block acceptance", () => {
  const sb = buildSandbox(directSpecContract("SPEC_COV_TAMPER"));
  assert.strictEqual(runPipeline(sb, "SPEC_COV_TAMPER").code, 0, "baseline run ok");
  assert.strictEqual(readGen(sb, "mission-report.json").validated, true, "baseline accepted");
  const d = path.join(sb, "specs", "odg-spec.json");
  const p = JSON.parse(fs.readFileSync(d, "utf8")); p.objectives[0].goal += " [TAMPERED]"; fs.writeFileSync(d, JSON.stringify(p, null, 2) + "\n");
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, false, "tampered → probe fails");
  runStage(sb, "validation-engine.js", "SPEC_COV_TAMPER");
  assert.notStrictEqual(readGen(sb, "mission-report.json").validated, true, "required proof BLOCKS acceptance of tampered spec");
});

test("e2e: an absent proof is never accepted by default", () => {
  const sb = buildSandbox(directSpecContract("SPEC_COV_ABSENT"));
  assert.strictEqual(runPipeline(sb, "SPEC_COV_ABSENT").code, 0, "baseline run ok");
  fs.rmSync(path.join(sb, "specs", "odg-spec.json"), { force: true });
  fs.rmSync(path.join(sb, "runtime", "generated", "odg-spec-author.json"), { force: true });
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, false, "absent → probe not ok");
  runStage(sb, "validation-engine.js", "SPEC_COV_ABSENT");
  assert.notStrictEqual(readGen(sb, "mission-report.json").validated, true, "absent required proof blocks acceptance");
});
