// @ts-nocheck — Lot A: PROOF-BOUND ODG-NATIVE autonomy NUMERATOR demonstrated live in isolation.
/*
 * CTO Lot A — closes the §4 gap: show the canonical autonomy NUMERATOR (ODG_EXECUTED_VERIFIED) attributed
 * to a REAL ODG-native execution whose evidence is BOUND to the result, reproducibly and in isolation.
 *
 * The canonical proof-bound mission is ODG_SPEC_SMOKE (contract.verify = [{capability:"ODG Spec Author",
 * evidence:"spec-schema-valid"}], pre-authorized ODG_SPEC_ objective). This is retained + exercised (not
 * re-manufactured — per Lot A: if already proven, document it). It runs in a throwaway git sandbox via the
 * REAL 13-stage odg-run pipeline, provider-free, then odg-state produces the canonical autonomy-rate.json.
 *
 * PROVES:
 *   LIVE   — proof-bound ODG-native run ⇒ autonomy-rate measurable, numerator=1, denominator=1, 100%,
 *            ODG_EXECUTED_VERIFIED=1, all other categories 0, evidenceValid=1 (evidence bound to the result);
 *            mission-report validated=true SUCCESS; the objective proof is OBSERVED (not NO-PROOF-BINDING).
 *   SCORER — via the canonical measureAutonomy over a mixed unit set (correct unit schema): the numerator
 *            counts ONLY the ODG-verified unit; an OPERATOR/provider unit, a FAILED unit, a HUMAN-mandatory
 *            unit and a RECORDED no-op are all EXCLUDED (no inflation); a proof-unbound/actorless DONE unit
 *            makes the measure not-measurable (fail-closed).
 *
 * Covered autonomy stages: discovery→mission→ODG-native execution→independent verification→evidence→
 *   measurable verified numerator. NOT covered (documented): provider-delegated code repair counted as
 *   ODG-native (it is categorically OPERATOR_OR_EXTERNAL); autonomous synthesis of a brand-new contract
 *   from a novel defect. The exhaustive attribution matrix lives in runtime/core/autonomy-measure.test.ts
 *   (167 assertions); the idempotent-no-op loop in autonomy-defect-repair-loop.e2e.test.ts.
 *
 * Run (outside npm test): node_modules/.bin/tsx runtime/__bench__/autonomy-proof-bound-numerator.e2e.test.ts
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const COPY_DIRS = ["core", "bin", "constitution", "policies", "governance", "brain"];
const sandboxes = [];
let passed = 0, failed = 0;
const ok = (n, c) => { if (c) { console.log("  ok -", n); passed++; } else { console.log("  FAIL -", n); failed++; } };
const sh = (c, a, cwd) => execFileSync(c, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

function sandbox(missionFile) {
  const sb = fs.mkdtempSync(path.join(os.tmpdir(), "odg-proofnum-"));
  sandboxes.push(sb);
  assert.ok(!sb.startsWith(REPO));
  for (const d of COPY_DIRS) fs.cpSync(path.join(REPO, "runtime", d), path.join(sb, "runtime", d), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "generated"), { recursive: true });
  fs.mkdirSync(path.join(sb, "runtime", "missions"), { recursive: true });
  fs.copyFileSync(path.join(REPO, "runtime", "missions", missionFile), path.join(sb, "runtime", "missions", missionFile));
  fs.writeFileSync(path.join(sb, ".gitignore"), "runtime/generated/\n");
  sh("git", ["init", "-q"], sb);
  sh("git", ["-c", "user.email=a@b", "-c", "user.name=a", "add", "-A"], sb);
  sh("git", ["-c", "user.email=a@b", "-c", "user.name=a", "commit", "-q", "-m", "base"], sb);
  return sb;
}
function env() { const e = { ...process.env, FLEET_BRIDGE_MOCK: "1" }; delete e.ODG_FLEET; delete e.ODG_PROVIDER_LIVE; return e; }
function runIn(sb, bin, mission) { const a = mission ? [bin, mission] : [bin]; return spawnSync("node", a, { cwd: sb, encoding: "utf8", env: env() }); }
const readGen = (sb, n) => JSON.parse(fs.readFileSync(path.join(sb, "runtime", "generated", n), "utf8"));

console.log("Lot A — PROOF-BOUND ODG-NATIVE AUTONOMY NUMERATOR (live, isolated) + scorer cross-checks");

// --- LIVE: the canonical proof-bound ODG-native mission ⇒ verified numerator ------------------------
const sb = sandbox("ODG_SPEC_SMOKE.json");
const run = runIn(sb, "runtime/bin/odg-run.js", "ODG_SPEC_SMOKE");
ok("LIVE: real 13-stage pipeline exits 0 (13/13)", run.status === 0 && /PIPELINE SUCCESS — 13\/13 stages/.test((run.stdout || "") + (run.stderr || "")));
const report = readGen(sb, "mission-report.json");
ok("LIVE: Validation Engine verdict validated=true SUCCESS", report.validated === true && report.status === "SUCCESS");
runIn(sb, "runtime/bin/odg-state.js", null);
const rate = readGen(sb, "autonomy-rate.json");
const m = rate.measure || rate;
ok("LIVE: autonomy measurable with explicit denominator", m.measurable === true && m.denominator === 1);
ok("LIVE: numerator = ODG_EXECUTED_VERIFIED = 1 (proof-bound ODG-native)", m.numerator === 1 && m.categories.ODG_EXECUTED_VERIFIED === 1 && m.autonomyPercent === 100);
ok("LIVE: NOT provider/operator (OPERATOR_OR_EXTERNAL=0) and nothing blocked", m.categories.OPERATOR_OR_EXTERNAL === 0 && m.categories.BLOCKED_REFUSED_FAILED === 0);
ok("LIVE: evidence bound to the result (distinctions.evidenceValid=1)", m.distinctions && m.distinctions.evidenceValid === 1);
// The proof binding for this mission is at contract.verify[] (capability+probe), read by the Validation
// Engine; the run SATISFYING it (validated=true + evidenceValid=1 above) is what makes the unit a verified
// ODG-native numerator — NOT the objective-level declaredProof proxy (which is a separate observation).
const sbContract = JSON.parse(fs.readFileSync(path.join(sb, "runtime", "missions", "ODG_SPEC_SMOKE.json"), "utf8"));
const boundProbe = Array.isArray(sbContract.verify) && sbContract.verify.some((v) => v && v.evidence === "spec-schema-valid" && v.capability === "ODG Spec Author");
ok("LIVE: mission declares a verify PROOF BINDING (ODG Spec Author ⇒ spec-schema-valid) satisfied by the run",
   boundProbe && report.validated === true && (!report.unmet || report.unmet.length === 0));

// --- SCORER: the canonical measureAutonomy excludes non-ODG-native units from the numerator ----------
const { measureAutonomy, CATEGORY, ACTOR, KIND } = require(path.join(REPO, "runtime", "core", "autonomy-measure.js"));
const unit = (over) => ({ id: "u", eligible: true, authorized: true, actor: ACTOR.ODG, status: "EXECUTED", kind: KIND.ACTION, verified: true, humanMandatory: false, accepted: false, ...over });
const mixed = measureAutonomy([
  unit({ id: "odg-verified" }),
  unit({ id: "operator-or-provider", actor: ACTOR.OPERATOR }),
  unit({ id: "failed", status: "FAILED" }),
  unit({ id: "human-gated", humanMandatory: true }),
  unit({ id: "noop", kind: KIND.PLAN, status: "RECORDED", verified: false }),
]);
ok("SCORER: numerator counts ONLY the ODG-verified unit (operator/failed/human/no-op excluded)",
   mixed.measurable === true && mixed.numerator === 1 && mixed.categories.ODG_EXECUTED_VERIFIED === 1 &&
   mixed.categories.OPERATOR_OR_EXTERNAL === 1 && mixed.categories.BLOCKED_REFUSED_FAILED === 1 &&
   mixed.categories.HUMAN_MANDATORY === 1 && mixed.categories.NOT_EXECUTED === 1);
// proof-unbound / actorless DONE ⇒ fail-closed not-measurable (ambiguous attribution).
const ambiguous = measureAutonomy([unit({ id: "unbound", actor: null, verified: false, status: "DONE" })]);
ok("SCORER: an actorless/proof-unbound DONE unit ⇒ not-measurable (fail-closed, no false numerator)", ambiguous.measurable === false);

for (const s of sandboxes) { try { fs.rmSync(s, { recursive: true, force: true }); } catch { /* best-effort */ } }
console.log(`\nLot A PROOF-BOUND NUMERATOR — ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
