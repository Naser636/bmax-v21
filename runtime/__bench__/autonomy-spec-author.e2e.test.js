"use strict";

/*
 * AUTONOMY E2E — ODG SPEC AUTHOR (η3-B30): first VERIFIABLE SEMANTIC deliverable.
 * =================================================================================
 *
 * Drives the REAL runtime pipeline (runtime/bin/odg-run.js, 13 stages) for an engineering mission whose
 * objective (reserved prefix ODG_SPEC_) resolves to the NEW capability "ODG Spec Author"
 * (capability-executors.js). That capability FORMULATES a Mission-Loader-schema specification ITSELF via
 * the existing mission-synthesizer.toContract (deterministic; NOT a flat manifest; NEVER a copy of a
 * contract-supplied patch) and writes ONE JSON file strictly inside authorized_paths after the SAME
 * pre-write confinement (traversal/symlink/governance) as the Synthetic Deliverable.
 *
 * The deliverable's CORRECTNESS is verified INDEPENDENTLY by the spec-schema-valid probe
 * (capability-probes.js): JSON parse + isValidContract + objective/done_when structure + confined
 * authorized_paths + source=mission-synthesizer + decompose(goal) consistency + BYTE-IDENTICAL
 * toContract(spec) determinism. A file merely EXISTING is NOT the proof.
 *
 * PROVES THREE DISTINCT ROLES: AUTHOR (ODG_CAPABILITY, mission-synthesizer) ≠ APPLICATOR (ODG_EXECUTOR,
 * patch-executor) ≠ VERIFIER (spec-schema-valid probe, capability-probes). Negatives: content tamper
 * (determinism FAIL), semantic divergence (decompose mismatch FAIL), invalid scope (refused, no write),
 * governance target without elevation (refused, no write). No score is inflated; this asserts a per-mission
 * autonomous+verified unit ONLY — it does NOT claim any change to the real aggregate denominator.
 *
 * ISOLATION (reused harness): throwaway os.tmpdir() git repo outside the real repo (asserted), offline
 * (FLEET_BRIDGE_MOCK=1, ODG_FLEET cleared); the capability uses only fs + a pure scope check (no network).
 *
 * Run:  node --test runtime/__bench__/autonomy-spec-author.e2e.test.js
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

const { attributeObjectives } = require(path.join(REPO, "runtime", "core", "objective-attribution.js"));
const { eligibilityFromObjectives, fromExecution, measureAutonomy } =
  require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));
const probes = require(path.join(REPO, "runtime", "core", "capability-probes.js"));
const synth = require(path.join(REPO, "runtime", "core", "mission-synthesizer.js"));

// A goal that decomposes to THREE objectives — proves a real SEMANTIC transform (3 ≠ 1 echo).
const SPEC_GOAL = "1. scan inputs 2. validate schema 3. report findings";
const EXPECTED_OBJECTIVES = synth.decompose(SPEC_GOAL).length; // = 3

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}
function buildSandbox(contract) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-spec-e2e-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox must live OUTSIDE the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.writeFileSync(path.join(sb, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "add", "-A"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-q", "-m", "baseline"], sb);
  return sb;
}
function runEnv() {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1" };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE;
  return env;
}
function runPipeline(sb, mission) {
  const r = spawnSync("node", ["runtime/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
function readGen(sb, name) { return JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", name), "utf8")); }
function genExists(sb, name) { return fs.existsSync(path.join(sb, "runtime", "generated", name)); }
/** Run a probe with cwd = sandbox (probes read CWD-relative evidence/deliverable paths). */
function runProbeIn(sb, evidence) {
  const orig = process.cwd();
  try { process.chdir(sb); return probes.runProbe(evidence, {}); }
  finally { process.chdir(orig); }
}

test.after(() => {
  for (const sb of sandboxes) { try { fs.rmSync(sb, { recursive: true, force: true }); } catch { /* best-effort */ } }
});

function contract(mission, authorizedPaths) {
  return {
    mission, version: "1.0", status: "AUTHORIZED", mode: "IMPLEMENT",
    priority: "NORMAL", requires_engineering: true, authorized_paths: authorizedPaths,
    objectives: [{
      id: "ODG_SPEC_1",
      goal: SPEC_GOAL,
      done_when: ["An ODG-authored specification JSON exists inside the authorized scope and passes spec-schema-valid."],
      authorization: { eligible: true, authorized: true },
    }],
    verify: [{ capability: "ODG Spec Author", evidence: "spec-schema-valid" }],
    definition_of_done: ["ODG-authored specification written strictly within the authorized scope and schema-valid."],
    completion: ["Validation successful."],
  };
}
const DELIVERABLE_REL = path.join("bench-spec", "odg-spec.json");

// ---------------------------------------------------------------------------------------------------
// POSITIVE — ODG authors a valid semantic spec; VERIFIED; author/applicator/verifier all distinct.
// ---------------------------------------------------------------------------------------------------
test("positive: ODG Spec Author writes a schema-valid semantic spec; author≠applicator≠verifier", () => {
  assert.ok(EXPECTED_OBJECTIVES >= 2, "test goal must decompose to >=2 objectives (real semantic transform)");
  const sb = buildSandbox(contract("BENCH_SPEC_POSITIVE", ["bench-spec/**"]));
  const { code, out } = runPipeline(sb, "BENCH_SPEC_POSITIVE");
  assert.strictEqual(code, 0, "pipeline must exit 0:\n" + out);
  assert.match(out, /PIPELINE SUCCESS — 13\/13 stages/, "all 13 stages complete");

  // Real ODG-authored deliverable, and it is a genuine semantic spec (decomposed objectives).
  const deliverable = path.join(sb, DELIVERABLE_REL);
  assert.ok(fs.existsSync(deliverable), "the in-scope spec deliverable must exist");
  const parsed = JSON.parse(fs.readFileSync(deliverable, "utf8"));
  assert.ok(synth.isValidContract(parsed), "deliverable is a valid Mission-Loader contract");
  assert.strictEqual(parsed.source, "mission-synthesizer", "content carries mission-synthesizer provenance");
  assert.strictEqual(parsed.objectives.length, EXPECTED_OBJECTIVES, "objective count = decompose(goal) (semantic, not 1:1 echo)");

  // AUTHOR (ODG_CAPABILITY) ≠ APPLICATOR (ODG_EXECUTOR) — proven on the executed record + evidence.
  const exec = readGen(sb, "patch-execution.json");
  const e = exec.executed.find((x) => x.objectiveId === "ODG_SPEC_1");
  assert.ok(e, "ODG_SPEC_1 recorded");
  assert.strictEqual(e.status, "EXECUTED");
  assert.strictEqual(e.capability, "ODG Spec Author");
  assert.strictEqual(e.authoredBy, "ODG_CAPABILITY", "AUTHOR is genuinely ODG (not CONTRACT/UNKNOWN)");
  assert.strictEqual(e.appliedBy, "ODG_EXECUTOR", "APPLICATOR is the ODG executor (distinct from author)");
  const evArtifact = readGen(sb, "odg-spec-author.json");
  assert.strictEqual(evArtifact.authoredBy, "ODG_CAPABILITY");
  assert.strictEqual(evArtifact.target, DELIVERABLE_REL, "evidence records the confined target");

  // VERIFIER (independent module) — the spec-schema-valid probe passes on the real content.
  const verdict = runProbeIn(sb, "spec-schema-valid");
  assert.strictEqual(verdict.ok, true, "spec-schema-valid probe must pass: " + verdict.detail);

  // Mission validates; engineering caps at VERIFIED (human-commit gate withholds RELEASED/ARCHIVED).
  const report = readGen(sb, "mission-report.json");
  assert.strictEqual(report.validated, true, "validated: " + JSON.stringify(report.unmet));
  assert.strictEqual(report.status, "SUCCESS");
  const lifecycle = readGen(sb, "mission-lifecycle.json");
  assert.strictEqual(lifecycle.achieved, "VERIFIED", "engineering mission reaches VERIFIED: " + lifecycle.achieved);

  // Independent per-mission autonomy recompute = 1/1 (NOT a global-aggregate claim).
  const plan = readGen(sb, "mission-plan.json");
  const patchPlan = readGen(sb, "patch-plan.json");
  const probe = (p) => { try { return typeof p === "string" && p.length > 0 && fs.statSync(path.join(sb, p)).size > 0; } catch { return false; } };
  const attribution = attributeObjectives(plan, patchPlan, exec, probe, () => ({}), () => false, {});
  const { map, complete } = eligibilityFromObjectives(Array.isArray(plan.objectives) ? plan.objectives : []);
  assert.strictEqual(complete, true, "denominator complete");
  const coverageOk = !!(report.checks && report.checks.objectiveCoverage === true);
  const measured = measureAutonomy(fromExecution(exec, attribution, map, { runComplete: coverageOk }));
  assert.strictEqual(measured.measurable, true, "measurable: " + JSON.stringify(measured));
  assert.strictEqual(measured.numerator, 1);
  assert.strictEqual(measured.denominator, 1);
  assert.strictEqual(exec.executed.some((x) => x.authoredBy === "UNKNOWN" || x.authoredBy === "CONTRACT"), false, "no CONTRACT/UNKNOWN credited");
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE — content tamper (same objective count) ⇒ determinism FAIL ⇒ probe refuses (file present ≠ proof).
// ---------------------------------------------------------------------------------------------------
test("negative: tampered content fails the probe even though the file exists (determinism)", () => {
  const sb = buildSandbox(contract("BENCH_SPEC_TAMPER", ["bench-spec/**"]));
  const { code } = runPipeline(sb, "BENCH_SPEC_TAMPER");
  assert.strictEqual(code, 0, "baseline positive run must succeed before tampering");
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, true, "pre-tamper probe passes");

  // Tamper ONE objective's goal in place (count unchanged ⇒ isolates the DETERMINISM check).
  const deliverable = path.join(sb, DELIVERABLE_REL);
  const parsed = JSON.parse(fs.readFileSync(deliverable, "utf8"));
  parsed.objectives[0].goal = parsed.objectives[0].goal + " [TAMPERED]";
  fs.writeFileSync(deliverable, JSON.stringify(parsed, null, 2) + "\n");

  const verdict = runProbeIn(sb, "spec-schema-valid");
  assert.strictEqual(verdict.ok, false, "a tampered deliverable must FAIL the probe");
  assert.match(verdict.detail, /determinism|tampered|non-deterministic/i, "failure cites determinism: " + verdict.detail);
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE — semantic divergence (extra objective) ⇒ decompose mismatch ⇒ probe refuses.
// ---------------------------------------------------------------------------------------------------
test("negative: semantic divergence (extra objective) fails the decompose-consistency check", () => {
  const sb = buildSandbox(contract("BENCH_SPEC_DIVERGE", ["bench-spec/**"]));
  runPipeline(sb, "BENCH_SPEC_DIVERGE");
  const deliverable = path.join(sb, DELIVERABLE_REL);
  const parsed = JSON.parse(fs.readFileSync(deliverable, "utf8"));
  parsed.objectives.push({ id: "BOGUS_X", goal: "injected", done_when: ["x"] }); // count now != decompose(goal)
  fs.writeFileSync(deliverable, JSON.stringify(parsed, null, 2) + "\n");

  const verdict = runProbeIn(sb, "spec-schema-valid");
  assert.strictEqual(verdict.ok, false, "a semantically divergent spec must FAIL the probe");
  assert.match(verdict.detail, /semantic mismatch|decompose/i, "failure cites semantic mismatch: " + verdict.detail);
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE — invalid (empty) scope ⇒ capability refuses before any write; no deliverable; not validated.
// ---------------------------------------------------------------------------------------------------
test("negative: empty authorized scope ⇒ refused before any write; probe fails", () => {
  const sb = buildSandbox(contract("BENCH_SPEC_NOSCOPE", []));
  runPipeline(sb, "BENCH_SPEC_NOSCOPE");
  assert.strictEqual(fs.existsSync(path.join(sb, DELIVERABLE_REL)), false, "no deliverable under an empty scope");
  if (genExists(sb, "patch-execution.json")) {
    const e = readGen(sb, "patch-execution.json").executed.find((x) => x.objectiveId === "ODG_SPEC_1");
    if (e) { assert.notStrictEqual(e.status, "EXECUTED"); assert.notStrictEqual(e.status, "APPLIED"); }
  }
  if (genExists(sb, "mission-report.json")) {
    assert.notStrictEqual(readGen(sb, "mission-report.json").validated, true, "refused mission must not validate");
  }
  assert.strictEqual(runProbeIn(sb, "spec-schema-valid").ok, false, "no evidence/deliverable ⇒ probe fails");
});

// ---------------------------------------------------------------------------------------------------
// NEGATIVE — governance-subsuming scope WITHOUT elevation ⇒ shared guard refuses before any write.
// ---------------------------------------------------------------------------------------------------
test("negative: governance-subsuming scope is refused before any write (no elevation)", () => {
  const sb = buildSandbox(contract("BENCH_SPEC_GOV", ["runtime/governance/**"])); // NO allowProtectedGovernance
  runPipeline(sb, "BENCH_SPEC_GOV");
  assert.strictEqual(fs.existsSync(path.join(sb, "runtime", "governance", "odg-spec.json")), false,
    "no governance deliverable without explicit elevated authorization");
  if (genExists(sb, "mission-report.json")) {
    assert.notStrictEqual(readGen(sb, "mission-report.json").validated, true, "governance-refused mission must not validate");
  }
});
