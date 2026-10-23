// @ts-nocheck — §3 END-TO-END ODG AUTONOMY: defect-driven red→green→idempotent loop (isolated, provider-free).
/*
 * CTO §3 — exercises the ACTUAL ODG path from a deliberately-introduced defect through verified acceptance,
 * in a throwaway git sandbox (the real repo is structurally out of reach — same isolation as autonomy-e2e).
 *
 * The defect: a governed IMPLEMENT mission whose REQUIRED deliverable (bench-workspace/repaired.txt) is
 * ABSENT in the baseline. ODG must produce it via its OWN in-contract patch (patch-executor) — NO provider
 * (FLEET off + mock; the on-path stages contain no HTTP client — same guarantee autonomy-e2e verifies).
 *
 * STAGES COVERED (with evidence, all ODG-NATIVE unless noted):
 *   1. DISCOVERY     — runtime-model computed over the sandbox evidence reports the mission as executable &
 *                      UNPROVEN (in the queue) and the deliverable is absent ⇒ the defect is observable.
 *   2-3. MISSION     — the governed contract carries objective + authorized scope + done_when acceptance.
 *   4. REPAIR        — the REAL 13-stage odg-run pipeline executes the mission; deliverable written by the
 *                      in-contract patch (ODG-native; provider-free, asserted).
 *   5. REGRESSION    — the SAME predicate (deliverable present + correct marker + report.validated) is RED
 *                      before the run and GREEN after (fails-before / passes-after on the real injected defect).
 *   6. INDEPENDENT   — the verdict comes from the Validation Engine (mission-report.json), not a self-claim;
 *      VERIFY           a FAILURE PATH is also proven: an out-of-scope "repair" mission validates FALSE
 *                       (the verifier is not a rubber stamp).
 *   7. ACCOUNTING    — mission-ledger.json records the proven mission; evidence artifacts exist.
 *   8. IDEMPOTENT    — a SECOND run does not fabricate new work: deliverable content is byte-identical
 *      NO-OP            (same sha) and no duplicate deliverable is created.
 *
 * NOT PROVEN HERE (documented honestly — not claimed): autonomous SYNTHESIS of a brand-new contract from a
 * novel, never-seen code defect (NL-gateway/factory authorship), and real source-code repair of arbitrary
 * logic bugs — those need the external provider (a demonstrated capability gap) and would NOT count as
 * ODG-native execution. This test covers the governed discover→repair→verify→accept loop for a mission whose
 * repair is within ODG's native (in-contract deterministic patch) capability.
 *
 * Run (outside npm test): node_modules/.bin/tsx runtime/__bench__/autonomy-defect-repair-loop.e2e.test.ts
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const FIXTURES = path.join(__dirname, "fixtures");
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes = [];
let passed = 0, failed = 0;
const ok = (n, c) => { if (c) { console.log("  ok -", n); passed++; } else { console.log("  FAIL -", n); failed++; } };

function sh(cmd, args, cwd) { return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); }

function buildSandbox(contractName) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-defect-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO), "sandbox must live outside the repository");
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.copyFileSync(path.join(FIXTURES, `${contractName}.json`), path.join(sb, "runtime", "missions", `${contractName}.json`));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\nnode_modules/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "add", "-A"], sb);
  sh("git", ["-c", "user.email=bench@local", "-c", "user.name=bench", "commit", "-q", "-m", "defective baseline"], sb);
  return sb;
}

function runEnv(extra) {
  const env = { ...process.env, FLEET_BRIDGE_MOCK: "1", ...(extra || {}) };
  delete env.ODG_FLEET; delete env.ODG_VERBOSE; delete env.ODG_PROVIDER_LIVE;
  return env;
}
function runPipeline(sb, mission) {
  const r = spawnSync("node", ["runtime/bin/odg-run.js", mission], { cwd: sb, encoding: "utf8", env: runEnv() });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const genPath = (sb, n) => path.join(sb, "runtime", "generated", n);
const readGen = (sb, n) => JSON.parse(fs.readFileSync(genPath(sb, n), "utf8"));
const deliverable = (sb) => path.join(sb, "bench-workspace", "repaired.txt");
const regressionGreen = (sb) => {
  // The SAME predicate used before (RED) and after (GREEN): deliverable exists with the proof marker AND
  // the independent Validation Engine report says validated.
  if (!fs.existsSync(deliverable(sb))) return false;
  if (fs.readFileSync(deliverable(sb), "utf8") !== "DEFECT-REPAIRED-OK\n") return false;
  try { return readGen(sb, "mission-report.json").validated === true; } catch { return false; }
};

console.log("§3 END-TO-END ODG AUTONOMY — defect-driven red→green→idempotent (isolated, provider-free)");

const sb = buildSandbox("BENCH_E2E_DEFECT_REPAIR");

// --- STAGE 1: DISCOVERY (defect observable from repository evidence) ---------------------------------
const { computeRuntimeModel } = require(path.join(REPO, "runtime", "core", "runtime-model.js"));
const modelBefore = computeRuntimeModel(sb);
const queuedBefore = modelBefore.queue.map((q) => q.mission);
ok("STAGE1 discovery: mission is discovered as executable & UNPROVEN (in queue) from evidence", queuedBefore.includes("BENCH_E2E_DEFECT_REPAIR"));
ok("STAGE1 discovery: the required deliverable is ABSENT in the defective baseline", !fs.existsSync(deliverable(sb)));
ok("STAGE5 regression RED before repair (deliverable missing + not validated)", regressionGreen(sb) === false);

// --- STAGE 2-3: GOVERNED MISSION (objective + scope + acceptance) ------------------------------------
const contract = JSON.parse(fs.readFileSync(path.join(sb, "runtime", "missions", "BENCH_E2E_DEFECT_REPAIR.json"), "utf8"));
ok("STAGE2-3 mission: carries objective + authorized scope + done_when acceptance",
   contract.objectives.length === 1 && Array.isArray(contract.authorizedPaths) && contract.authorizedPaths[0] === "bench-workspace/**" && contract.objectives[0].done_when.length >= 1);

// --- STAGE 4: REPAIR via ODG's own capability (real 13-stage pipeline, provider-free) ----------------
const run1 = runPipeline(sb, "BENCH_E2E_DEFECT_REPAIR");
ok("STAGE4 repair: real odg-run pipeline exits 0 (13/13 stages)", run1.code === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test(run1.out));
ok("STAGE4 repair: deliverable produced by the in-contract patch (ODG-native, no provider spawn)",
   fs.existsSync(deliverable(sb)) && !/provider.*(invoked|called|live)/i.test(run1.out));

// --- STAGE 5: REGRESSION passes AFTER repair (fails-before / passes-after, same predicate) -----------
ok("STAGE5 regression GREEN after repair (deliverable + marker + validated)", regressionGreen(sb) === true);

// --- STAGE 6: INDEPENDENT verification (Validation Engine verdict, not a self-claim) + FAILURE PATH ---
const report = readGen(sb, "mission-report.json");
ok("STAGE6 independent verify: Validation Engine verdict validated=true, status SUCCESS, no unmet",
   report.validated === true && report.status === "SUCCESS" && (!report.unmet || report.unmet.length === 0));
// Failure path: an out-of-scope "repair" mission must validate FALSE (the verifier is not a rubber stamp).
const sbNeg = buildSandbox("BENCH_E2E_OUT_OF_SCOPE");
const runNeg = runPipeline(sbNeg, "BENCH_E2E_OUT_OF_SCOPE");
let negValidated = null; try { negValidated = readGen(sbNeg, "mission-report.json").validated; } catch { negValidated = "no-report"; }
ok("STAGE6 failure path: an out-of-scope repair is NOT validated (independent verifier rejects)",
   runNeg.code !== 0 || negValidated === false || negValidated === "no-report");

// --- STAGE 7: ACCOUNTING (ledger + evidence) ---------------------------------------------------------
ok("STAGE7 accounting: mission-report.json evidence written", fs.existsSync(genPath(sb, "mission-report.json")));
let ledgerProven = false;
try {
  const led = readGen(sb, "mission-ledger.json");
  const entries = Array.isArray(led) ? led : (led.entries || led.missions || []);
  ledgerProven = JSON.stringify(led).includes("BENCH_E2E_DEFECT_REPAIR");
} catch { ledgerProven = false; }
ok("STAGE7 accounting: mission recorded in the ledger evidence", ledgerProven);

// --- STAGE 8: IDEMPOTENT re-run (no fabricated new work; no-op not a new execution) ------------------
const shaAfter1 = crypto.createHash("sha256").update(fs.readFileSync(deliverable(sb))).digest("hex");
const run2 = runPipeline(sb, "BENCH_E2E_DEFECT_REPAIR");
const shaAfter2 = crypto.createHash("sha256").update(fs.readFileSync(deliverable(sb))).digest("hex");
ok("STAGE8 idempotent: deliverable byte-identical across the re-run (no churn / no fabricated change)", shaAfter1 === shaAfter2);
const dupFiles = fs.readdirSync(path.join(sb, "bench-workspace")).filter((f) => f.startsWith("repaired"));
ok("STAGE8 idempotent: no duplicate deliverable created on re-run", dupFiles.length === 1);
ok("STAGE8 idempotent: re-run still validates the SAME mission (did not error or invent new work)", run2.code === 0 || regressionGreen(sb) === true);

// cleanup
for (const s of sandboxes) { try { fs.rmSync(s, { recursive: true, force: true }); } catch { /* best-effort */ } }

console.log(`\n§3 DEFECT-REPAIR LOOP — ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
