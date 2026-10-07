/*
 * ENGINEERING TERMINAL VERDICT + GRANT ROTATION — exam-N2 remediation (P1 + P2).
 *
 * P1: a VALIDATED + proven engineering mission whose deliverable is still uncommitted must NOT read as
 * BLOCKED (failure) nor as a fabricated SUCCESS. The governed pipeline signals it with exit 20, which the
 * seam maps to the honest terminal state VALIDATED_PENDING_COMMIT (code 10). gitClean is NOT weakened:
 * exit 20 is produced ONLY when every dirty path is inside authorized_paths (enforced by the pipeline);
 * any out-of-scope change stays a hard failure (exit 1 ⇒ BLOCKED here).
 *
 * P2: a FRESH human grant must re-materialize the contract (grant rotation) instead of silently reusing a
 * stale contract left by an earlier run of the same intent. A pure (no-grant) re-run still reuses.
 *
 * Run: node_modules/.bin/tsx src/runtime/engineering-terminal-verdict.test.ts
 */
import path from "node:path";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const seam = require_(path.join(process.cwd(), "runtime", "bin", "odg-objective.js")) as {
  classifyOutcome: (d: unknown, exit: number) => { verdict: string; code: number; reason: string };
  materializeContract: (d: unknown, io: unknown, force?: boolean) => { reused: boolean; rewritten?: boolean };
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("ENGINEERING TERMINAL VERDICT + GRANT ROTATION (P1 + P2)");

// === P1 — terminal verdict distinguishes proven-pending-commit from failure and from success. =====
{
  const d = { contract: { authorized_paths: ["factory"], objectives: [{ id: "x" }] } };
  const pending = seam.classifyOutcome(d, 20);
  check(pending.verdict === "VALIDATED_PENDING_COMMIT" && pending.code === 10, "exit 20 ⇒ VALIDATED_PENDING_COMMIT (code 10) — proven, awaiting human commit");
  check(/awaits the HUMAN commit gate/.test(pending.reason) && /never auto-commits/.test(pending.reason), "reason states proven + awaiting human commit, no auto-commit");
  check(seam.classifyOutcome(d, 0).verdict === "SUCCESS", "exit 0 (clean + evidence binding) ⇒ SUCCESS");
  check(seam.classifyOutcome(d, 1).verdict === "BLOCKED", "exit 1 ⇒ BLOCKED (real failure, unchanged)");
  check(seam.classifyOutcome(d, 2).verdict === "BLOCKED", "any other non-zero ⇒ BLOCKED (not pending-commit)");
  // A pending-commit is NOT a fabricated success: its code is non-zero (10), distinct from SUCCESS (0).
  check(seam.classifyOutcome(d, 20).code !== 0, "VALIDATED_PENDING_COMMIT is NOT a success (non-zero code)");
}

// === P2 — fresh grant re-materializes the contract; pure re-run reuses. ===========================
{
  let writes = 0;
  const io = { existsSync: () => true, writeFileSync: () => { writes += 1; }, mkdirSync: () => {} };
  const d = { mission: "NL_X", contract: { mission: "NL_X", objectives: [] } };

  writes = 0;
  const reused = seam.materializeContract(d, io, false);
  check(reused.reused === true && writes === 0, "existing contract + NO fresh grant ⇒ reused (idempotent, zero write)");

  writes = 0;
  const rotated = seam.materializeContract(d, io, true);
  check(rotated.reused === false && rotated.rewritten === true && writes === 1, "existing contract + FRESH grant ⇒ re-materialized (grant rotation, not silently ignored)");
}

console.log(failures === 0 ? "ALL PASS — ENGINEERING TERMINAL VERDICT + GRANT ROTATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
