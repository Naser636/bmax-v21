#!/usr/bin/env node

/* Self-Diagnostic CYCLE — end-to-end demonstration of the autonomous engineering cycle on ISOLATED,
 * SYNTHETIC faults, reusing the EXISTING repair (local-fixers) and rollback (build-recovery-engine)
 * mechanisms. Never touches live state. Network-independent.
 *
 *  (A) FAULT → DETECT → REPRODUCE → DIAGNOSE → REPAIR → TEST → VERIFY   (reuses local-fixers)
 *  (B) ROLLBACK on a deliberately unsafe candidate                       (reuses build-recovery.recover)
 *  (C) PROTECTED divergence → HUMAN_APPROVAL_REQUIRED (prepare, not apply)
 *  (D) audit() is bounded + prepare-not-apply + honours loop-protection freeze
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const localFixers = require("./local-fixers");
const buildRecovery = require("./build-recovery-engine");
const diag = require("./self-diagnostic");

function tmpdir(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), tag)); }

// -------------------------------------------------------------------------------------------------
// (A) Full repair cycle on a controlled fault fixture, reusing the EXISTING local-fixers repair.
// -------------------------------------------------------------------------------------------------
(() => {
  const dir = tmpdir("sdc-repair-");
  const target = path.join(dir, "faulty.js");
  const FAULT = "const a = 1;   \nconst b = 2;\n\n\n\nconst c = 3;"; // trailing ws, no final newline, blank run
  fs.writeFileSync(target, FAULT);

  // DETECT (expected vs observed, content-level): a well-formed file has no trailing ws and ends in \n.
  const detect = (p) => {
    const s = fs.readFileSync(p, "utf8");
    return { trailingWs: /[ \t]+$/m.test(s), noFinalNewline: !s.endsWith("\n") };
  };
  const before = detect(target);
  ok("FAULT detected (trailing whitespace + missing final newline)", before.trailingWs && before.noFinalNewline);

  // REPRODUCE: detection is deterministic (same input ⇒ same observation).
  ok("fault reproduces deterministically", JSON.stringify(detect(target)) === JSON.stringify(before));

  // DIAGNOSE: the self-diagnostic classifier yields a candidate cause + a discriminating test.
  const route = diag.classifyRepairability({ category: "failed-action", firstDifferenceAt: target, evidence_refs: [target] });
  ok("DIAGNOSE routes to an existing repair mechanism with a discriminating test", route.mechanism && route.discriminatingTest);

  // REPAIR: reuse the EXISTING local-fixers (no reinvented repair logic).
  const res = localFixers.applyFixers(target, ["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"]);
  ok("REPAIR applied via existing local-fixers", res.changed === true);

  // TEST / VERIFY: fault gone, idempotent (re-applying is a no-op ⇒ no oscillation).
  const after = detect(target);
  ok("VERIFY: fault resolved (no trailing ws, final newline present)", !after.trailingWs && !after.noFinalNewline);
  const again = localFixers.applyFixers(target, ["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"]);
  ok("repair is idempotent (second apply is a no-op — no oscillating fix)", again.changed === false);
})();

// -------------------------------------------------------------------------------------------------
// (B) ROLLBACK on an unsafe candidate — reuse the EXISTING build-recovery rollback-guarded loop.
//     An injected constant typecheck keeps the error count flat, so the engine's own restore(snapshot)
//     reverts the iteration and refuses to promote. We assert the file is byte-identical afterwards.
// -------------------------------------------------------------------------------------------------
(() => {
  const dir = tmpdir("sdc-rollback-");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  const target = path.join(dir, "src", "f.ts");
  const ORIGINAL = "import { Foo } from './x';\nexport const y = 1;\n";
  fs.writeFileSync(target, ORIGINAL);

  const configPath = path.join(dir, "recovery.json");
  fs.writeFileSync(configPath, JSON.stringify({
    maxIterations: 3,
    authorizedFixers: [{ code: "TS6133", fixer: "removeUnusedImport", rootCause: "unused-import" }],
  }));

  // Constant diagnostic regardless of file content ⇒ the fix never reduces the count ⇒ engine reverts.
  const constantTypecheck = ["node", "-e", "process.stdout.write(\"src/f.ts(1,10): error TS6133: 'Foo' is declared but its value is never read.\\n\")"];

  const result = buildRecovery.recover({
    cwd: dir,
    configPath,
    typecheckCommand: constantTypecheck,
    authorizedPaths: ["src"],
    runBuild: false,
  });

  ok("unsafe candidate NOT promoted (improved === false)", result.improved === false);
  ok("red gate stays red (typescript === false) — no false success", result.typescript === false);
  ok("escalated instead of promoted (providerAuthorized === true)", result.providerAuthorized === true);
  ok("ROLLBACK via existing engine: file is byte-identical to the original", fs.readFileSync(target, "utf8") === ORIGINAL);
})();

// -------------------------------------------------------------------------------------------------
// (C) PROTECTED divergence ⇒ HUMAN_APPROVAL_REQUIRED, never auto-applied.
// -------------------------------------------------------------------------------------------------
(() => {
  const perm = diag.classifyRepairability({ category: "unexpected-permission", firstDifferenceAt: "runtime/core/x.js", evidence_refs: [] });
  ok("out-of-write-set edit is PROTECTED → HUMAN_APPROVAL_REQUIRED", perm.action === "HUMAN_APPROVAL_REQUIRED" && perm.protected === true);
  const inv = diag.classifyRepairability({ category: "failed-invariant", firstDifferenceAt: "I2", evidence_refs: [] });
  ok("invariant failure is PROTECTED → HUMAN_APPROVAL_REQUIRED", inv.action === "HUMAN_APPROVAL_REQUIRED" && inv.protected === true);
})();

// -------------------------------------------------------------------------------------------------
// (D) audit() is bounded, prepare-not-apply, and respects loop-protection freeze.
// -------------------------------------------------------------------------------------------------
(() => {
  const prev = process.cwd();
  const dir = tmpdir("sdc-audit-");
  process.chdir(dir);
  try {
    delete require.cache[require.resolve("./autonomy-store")];
    delete require.cache[require.resolve("./self-diagnostic")];
    const d2 = require("./self-diagnostic");
    fs.mkdirSync("runtime/generated", { recursive: true });
    fs.writeFileSync("runtime/generated/mission-plan.json", JSON.stringify({
      mission: "M", requiresEngineering: true, authorizedPaths: ["runtime/core/x.js"],
      objectives: [{ id: "OBJ_1" }, { id: "OBJ_2" }],
    }));
    fs.writeFileSync("runtime/generated/patch-execution.json", JSON.stringify({
      executed: [{ objectiveId: "OBJ_1", status: "EXECUTED", evidence: "runtime/generated/e1.json" }],
    })); // OBJ_2 missing ⇒ divergence
    fs.writeFileSync("runtime/generated/e1.json", "{\"x\":1}");

    let a = d2.audit({ now: "T0", maxAttempts: 2 });
    ok("audit runs a single bounded pass and prepares (PREPARE_NOT_APPLY)", a.mode === "PREPARE_NOT_APPLY" && a.repairPlan);
    ok("audit prepares an AUTO repair for the missing output (routes to existing engine)", a.repairPlan.autoRepairable.some((s) => s.category === "missing-output"));
    ok("bounds present (maxRepairFiles, maxAttempts, singlePass)", a.repairPlan.bounds.singlePass === true && Number.isInteger(a.repairPlan.bounds.maxAttempts));
    // Re-audit to trip loop protection (maxAttempts=2) → FROZEN ⇒ applyAllowed false.
    const a2 = d2.audit({ now: "T1", maxAttempts: 2 });
    ok("loop protection: incident FROZEN after maxAttempts ⇒ apply NOT allowed", a2.incident.status === "FROZEN" && a2.repairPlan.applyAllowed === false);
  } finally {
    process.chdir(prev);
  }
})();

console.log(`\nSelf-Diagnostic CYCLE — ${passed} assertions passed.`);
