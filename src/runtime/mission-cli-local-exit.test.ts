/*
 * mission-cli runLocalRoute exit-code contract.
 *
 * BEFORE: runLocalRoute returned process exit 0 whenever `outcome.ok` (execution ran without
 * throwing) — even when `outcome.validated === false`. It printed `Validated: false` yet exited 0,
 * so `odg mission <migrated>` reported success for an UNVALIDATED local mission (reproduced with a
 * real LocalMissionRunner + a FAILED-report kernel: ok:true, validated:false).
 *
 * This locks the corrected contract: exit reflects the HONEST verdict (outcome.validated), matching
 * the sibling routes. The route is exercised DIRECTLY via an injected runner (no real execution,
 * no mse, no provider). Importing mission-cli does not run main() (guarded, like converge-cli).
 *
 * Run directly: node_modules/.bin/tsx src/runtime/mission-cli-local-exit.test.ts
 */
import { runLocalRoute } from "./mission-cli";
import { LocalMissionRunner, LocalMissionResult } from "./local-mission-runner";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

/** A stand-in LocalMissionRunner returning a fixed outcome (no real execution). The outcome is a
 *  partial shape cast to LocalMissionResult — runLocalRoute only reads ok/validated/error and the
 *  execution's logicalSteps/technicalSteps/capabilities (via its own cast). */
function outcome(o: { ok: boolean; validated?: boolean; status?: string; error?: string }): LocalMissionResult {
  return {
    mission: "M",
    ok: o.ok,
    validated: o.validated,
    error: o.error,
    execution: { report: { status: o.status ?? "FAILED" }, logicalSteps: 1, technicalSteps: 1, capabilities: [] },
  } as unknown as LocalMissionResult;
}
function fakeRunner(o: LocalMissionResult): LocalMissionRunner {
  return { run: () => o } as unknown as LocalMissionRunner;
}

console.log("MISSION-CLI runLocalRoute EXIT-CODE CONTRACT");

// The OLD contract, reproduced: `return 0` whenever ok, regardless of validated.
const oldExit = (o: LocalMissionResult): number => (!o.ok ? 1 : 0);

// 0 — defect on the OLD contract: executed-but-unvalidated ⇒ old exit 0 (false success).
check(oldExit(outcome({ ok: true, validated: false })) === 0,
  "OLD contract returned 0 for ok && validated:false (reproduces false success)");

// 1 — FIX: executed but NOT validated ⇒ exit 1.
check(runLocalRoute("M", fakeRunner(outcome({ ok: true, validated: false }))) === 1,
  "ok && validated:false ⇒ exit 1 (false success closed)");

// 2 — PRESERVED: a genuinely validated local mission ⇒ exit 0.
check(runLocalRoute("M", fakeRunner(outcome({ ok: true, validated: true, status: "SUCCESS" }))) === 0,
  "ok && validated:true ⇒ exit 0 (success preserved)");

// 3 — UNCHANGED: an execution that threw (ok:false) ⇒ exit 1.
check(runLocalRoute("M", fakeRunner(outcome({ ok: false, error: "boom" }))) === 1,
  "ok:false ⇒ exit 1 (unchanged)");

console.log(failures === 0 ? "ALL PASS — runLocalRoute EXIT-CODE CONTRACT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
