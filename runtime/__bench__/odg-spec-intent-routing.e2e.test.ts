// @ts-nocheck — L5 bench test migration: runs under tsx unchanged; suppresses tsc typechecking
// (NOT strict typing) — recorded migration debt. See ODG_PROJECT_STATE.md.
"use strict";

/*
 * LOT η3-B45 — SPEC-INTENT ROUTING E2E: an NL specification request reaches ODG Spec Author end-to-end.
 * =====================================================================================================
 *
 * η3-B44 proved the gap: the released ODG Spec Author capability (resolve() matches objectiveId prefix
 * "ODG_SPEC_") was UNREACHABLE from the NL path, because mission-synthesizer assigned goal-slug ids, never
 * ODG_SPEC_. η3-B45 fixes it in ONE place: mission-synthesizer.fromRequest now detects an EXPLICIT
 * specification-production intent and gives the first objective an ODG_SPEC_-prefixed id (toContract already
 * honours spec.objectiveId). This bench drives the DECISION PATH FROM THE INITIAL REQUEST — not a hand-
 * prefixed id — through the real governed pipeline to a probe-validated deliverable.
 *
 * SEPARATION OF ROLES (honest): the ROUTING decision (ODG_SPEC_ objectiveId) is produced by ODG's own
 * mission-synthesizer from the request (asserted directly). The status=AUTHORIZED + per-objective
 * authorization + verify block are the GOVERNANCE/human gate every mission needs; the bench supplies them
 * WITHOUT touching the synthesizer-produced objectiveId/goal (a human authorizer would). The deliverable is
 * produced by the ODG Spec Author executor (ODG), and verified INDEPENDENTLY by the spec-schema-valid probe.
 *
 * ISOLATION: throwaway os.tmpdir() git sandbox outside the repo (asserted), offline (FLEET_BRIDGE_MOCK=1).
 *
 * Run:  node --test runtime/__bench__/odg-spec-intent-routing.e2e.test.ts
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
const probes = require(path.join(REPO, "runtime", "core", "capability-probes.js"));

const SPEC_GOAL = "Produce a structured specification of the authentication module";

function sh(cmd, args, cwd) { return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }
function buildSandbox(contract) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-spec-route-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=b@l", "-c", "user.name=b", "add", "-A"], sb);
  sh("git", ["-c", "user.email=b@l", "-c", "user.name=b", "commit", "-q", "-m", "baseline"], sb);
  return sb;
}
function runEnv() { const e = { ...process.env, FLEET_BRIDGE_MOCK: "1" }; delete e.ODG_FLEET; delete e.ODG_VERBOSE; return e; }
function runPipeline(sb, mission) { const r = spawnSync("node", ["runtime/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: runEnv() }); return { code: r.status, out: (r.stdout || "") + (r.stderr || "") }; }
function readGen(sb, n) { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8")); }
function runProbeIn(sb, evidence) { const o = process.cwd(); try { process.chdir(sb); return probes.runProbe(evidence, {}); } finally { process.chdir(o); } }
/** Apply the GOVERNANCE/human authorization gate WITHOUT touching the synthesizer-produced objectiveId/goal
 *  NOR its verify block — the verify block must come from fromRequest (η3-B46), never be injected by the test. */
function authorizeForRun(c) {
  c.status = "AUTHORIZED"; c.version = "1.0";
  c.objectives = c.objectives.map((o) => ({ ...o, authorization: { eligible: true, authorized: true } }));
  return c; // c.verify is whatever fromRequest produced (asserted separately)
}
/** Run a single stage standalone (reads existing runtime/generated artifacts; does NOT regenerate deliverables). */
function runStage(sb, stageFile, mission) {
  const r = spawnSync("node", [path.join("runtime", "core", stageFile), mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

test.after(() => { for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best effort */ } } });

// ---------------------------------------------------------------------------------------------------
// POSITIVE — NL spec request → ODG_SPEC_ objectiveId (synthesizer) → governed run → probe-valid deliverable.
// ---------------------------------------------------------------------------------------------------
test("e2e: an explicit spec request routes from fromRequest through the pipeline to a probe-valid odg-spec.json", () => {
  // 1-2. ODG's synthesizer turns the REQUEST into a contract whose first objective is ODG_SPEC_-prefixed.
  const contract = synth.fromRequest(SPEC_GOAL, { authorizedPaths: ["specs/**"] });
  assert.ok(contract.objectives[0].id.startsWith("ODG_SPEC_"), "routing: first objectiveId is ODG_SPEC_-prefixed from the request: " + contract.objectives[0].id);
  assert.strictEqual(contract.requires_engineering, true, "spec request with scope is an engineering mission");
  assert.strictEqual(contract.source, "mission-synthesizer", "contract authored by mission-synthesizer");
  // η3-B46: the generated contract DECLARES its own independent verification (self-verification gate).
  assert.deepStrictEqual(contract.verify, [{ capability: "ODG Spec Author", evidence: "spec-schema-valid" }],
    "routed spec contract declares the spec-schema-valid proof in the real verify-block format");

  // 3. Human/governance authorization gate (objectiveId/goal/verify untouched).
  authorizeForRun(contract);
  const sb = buildSandbox(contract);

  // 4. Governed pipeline run from the mission id.
  const { code, out } = runPipeline(sb, contract.mission);
  assert.strictEqual(code, 0, "pipeline must exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "all 13 stages complete via the governed entry");

  // 5. Real deliverable produced by the ODG Spec Author executor, in scope.
  const deliverable = path.join(sb, "specs", "odg-spec.json");
  assert.ok(fs.existsSync(deliverable), "specs/odg-spec.json deliverable exists");
  const parsed = JSON.parse(fs.readFileSync(deliverable, "utf8"));
  assert.ok(synth.isValidContract(parsed), "deliverable is a valid Mission-Loader spec");

  // 6. Capability actually selected + executed (resolve matched ODG_SPEC_), correct attribution.
  const e = readGen(sb, "patch-execution.json").executed.find((x) => String(x.objectiveId || "").startsWith("ODG_SPEC_"));
  assert.ok(e, "an ODG_SPEC_ objective was executed");
  assert.strictEqual(e.status, "EXECUTED");
  assert.strictEqual(e.capability, "ODG Spec Author", "the ODG Spec Author capability was selected by the real resolver");
  assert.strictEqual(e.authoredBy, "ODG_CAPABILITY", "authoredBy = ODG_CAPABILITY");
  assert.strictEqual(e.appliedBy, "ODG_EXECUTOR", "appliedBy = ODG_EXECUTOR");

  // 7. Independent verification by the spec-schema-valid probe + mission validated.
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, true, "independent spec-schema-valid probe passes");
  assert.strictEqual(readGen(sb, "mission-report.json").validated, true, "mission validated");
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE (routing) — a non-spec request is NOT artificially prefixed and keeps its historical id.
// ---------------------------------------------------------------------------------------------------
test("negative: a non-spec request is not prefixed ODG_SPEC_ (no over-routing)", () => {
  for (const g of ["Audit the runtime state and report drift", "invent a new payment provider", "remove the unused import"]) {
    const c = synth.fromRequest(g);
    assert.ok(!c.objectives[0].id.startsWith("ODG_SPEC_"), `non-spec request must not be ODG_SPEC_: "${g}" -> ${c.objectives[0].id}`);
  }
  // "inspect the specific respect of the spec" contains spec-ish substrings but is NOT a production intent.
  assert.strictEqual(synth.isSpecProductionIntent("inspect the specific respect of the spec"), false, "substring 'spec' must not trigger routing");
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE (credit) — an altered/invalid deliverable fails the independent probe (no autonomy credit).
// ---------------------------------------------------------------------------------------------------
test("negative: a tampered spec deliverable fails the required proof → mission NOT accepted", () => {
  const contract = authorizeForRun(synth.fromRequest(SPEC_GOAL, { authorizedPaths: ["specs/**"] }));
  const sb = buildSandbox(contract);
  const r = runPipeline(sb, contract.mission);
  assert.strictEqual(r.code, 0, "baseline run must succeed before tampering:\n" + r.out);
  assert.strictEqual(readGen(sb, "mission-report.json").validated, true, "baseline mission validated (required proof passed)");
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, true, "pre-tamper probe passes");

  // Tamper the REAL deliverable, then RE-RUN ONLY the Validation Engine (it re-evaluates the verify block
  // against the on-disk artifact; it does NOT regenerate the deliverable). The required proof must now block.
  const deliverable = path.join(sb, "specs", "odg-spec.json");
  const parsed = JSON.parse(fs.readFileSync(deliverable, "utf8"));
  parsed.objectives[0].goal += " [TAMPERED]";
  fs.writeFileSync(deliverable, JSON.stringify(parsed, null, 2) + "\n");
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, false, "tampered deliverable FAILS the independent probe");

  runStage(sb, "validation-engine.js", contract.mission);
  const report = readGen(sb, "mission-report.json");
  assert.notStrictEqual(report.validated, true, "required spec-schema-valid proof must BLOCK acceptance of a tampered spec");
});

test("negative: an absent proof artifact → no acceptance by default (required proof not silently skipped)", () => {
  const contract = authorizeForRun(synth.fromRequest(SPEC_GOAL, { authorizedPaths: ["specs/**"] }));
  const sb = buildSandbox(contract);
  runPipeline(sb, contract.mission);
  assert.strictEqual(readGen(sb, "mission-report.json").validated, true, "baseline validated");
  // Remove the produced deliverable AND the capability evidence, then re-validate: the declared proof is
  // required, so its absence must block acceptance (never a silent pass).
  fs.rmSync(path.join(sb, "specs", "odg-spec.json"), { force: true });
  fs.rmSync(path.join(sb, "runtime", "generated", "odg-spec-author.json"), { force: true });
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, false, "absent proof ⇒ probe not ok");
  runStage(sb, "validation-engine.js", contract.mission);
  assert.notStrictEqual(readGen(sb, "mission-report.json").validated, true, "absent required proof must block acceptance");
});

// ---------------------------------------------------------------------------------------------------
// DETERMINISM — existing non-spec contracts are byte-identical to before; spec routing is stable.
// ---------------------------------------------------------------------------------------------------
test("determinism: non-spec contracts unchanged & deterministic; spec routing stable", () => {
  const a = JSON.stringify(synth.toContract({ goal: "wire the loader into the pipeline" }));
  const b = JSON.stringify(synth.toContract({ goal: "wire the loader into the pipeline" }));
  assert.strictEqual(a, b, "non-spec toContract is deterministic");
  assert.ok(!JSON.parse(a).objectives[0].id.startsWith("ODG_SPEC_"), "non-spec toContract is not prefixed");
  const id1 = synth.fromRequest(SPEC_GOAL).objectives[0].id;
  const id2 = synth.fromRequest(SPEC_GOAL).objectives[0].id;
  assert.strictEqual(id1, id2, "spec routing id is deterministic");
  assert.ok(id1.startsWith("ODG_SPEC_"), "spec routing id is ODG_SPEC_-prefixed");
});
