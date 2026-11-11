#!/usr/bin/env node
"use strict";
/* M12 (V12.4 prolonged-autonomy accumulated-state integrity) — battery. Proves a prolonged workload survives REPEATED
 * interrupt/restart cycles with: NO duplicated work, NO resource leak (spend exactly once), IDEMPOTENT resume, STALE
 * checkpoint refused (fail-closed), and CONVERGENCE. Plus a sealed synthetic bench (0 violations, non-rubberstamp). No egress. */
const P = require("./prolonged-autonomy-integrity.js");
const WL = [{ id: "A", cost: 1 }, { id: "B", cost: 2 }, { id: "C", cost: 3 }, { id: "D", cost: 4 }, { id: "E", cost: 5 }]; // sum 15
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- bench ----
  const r = P.runBench();
  check("bench: ZERO integrity violations across sealed synthetic scenarios", r.integrityViolations === 0 && r.safe === r.total && r.total === P.SCENARIOS.length);
  check("bench: digest stable sha256 + deterministic + frozen", /^[0-9a-f]{64}$/.test(r.digest) && r.digest === P.benchDigest() && JSON.stringify(P.runBench()) === JSON.stringify(P.runBench()) && Object.isFrozen(r) && Object.isFrozen(r.results[0]));
  check("bench: every behaviour all-safe", Object.values(r.byBehaviour).every((b: any) => b.safe === b.total) && Object.keys(r.byBehaviour).length >= 6);

  // ---- model: the invariants directly ----
  // 1. multi-cycle convergence
  const mc = P.runProlonged({ missions: WL, missionsPerCycle: 2 });
  check("multi-cycle: COMPLETE across >=3 cycles, 0 dup, spend consistent, 5 executed", mc.verdict === "COMPLETE" && mc.cycles >= 3 && mc.duplicatedExecutions === 0 && mc.spendConsistent && mc.executedThisRun === 5);
  // 2. no duplicated work — each mission executed exactly once across restarts
  check("no duplicated work: executionLog has each mission exactly once", new Set(mc.executionLog).size === 5 && mc.executionLog.length === 5);
  // 3. resume from checkpoint — seeded A,B are NOT re-executed; spend stays consistent
  const rs = P.runProlonged({ missions: WL, missionsPerCycle: 2, seedCompleted: ["A", "B"], seedSpent: 3 });
  check("resume: seeded A,B not re-executed, only C/D/E run, spend consistent (==15)", rs.verdict === "COMPLETE" && rs.executedThisRun === 3 && !rs.executionLog.includes("A") && !rs.executionLog.includes("B") && rs.spent === 15 && rs.spendConsistent);
  // 4. idempotent resume — already-complete checkpoint executes nothing, no drift, no leak
  const idem = P.runProlonged({ missions: WL, seedCompleted: ["A", "B", "C", "D", "E"], seedSpent: 15 });
  check("idempotent: already-complete ⇒ 0 executed, 0 dup, spend consistent, COMPLETE", idem.executedThisRun === 0 && idem.duplicatedExecutions === 0 && idem.spendConsistent && idem.verdict === "COMPLETE");
  // 5. stale/corrupted checkpoint refused (fail-closed)
  check("stale checkpoint (unknown mission) ⇒ CORRUPTED (fail-closed)", P.runProlonged({ missions: WL, seedCompleted: ["A", "ZZZ"] }).verdict === "CORRUPTED");
  // 6. spend exactly once (no resource leak)
  check("no resource leak: spent == sum(costs) == 15 exactly once", P.runProlonged({ missions: WL, missionsPerCycle: 1 }).spent === 15);

  // ---- adversarial ----
  // 7. a corrupted seedSpend is DETECTED (spendConsistent false) — the integrity check is real
  const badSpend = P.runProlonged({ missions: WL, missionsPerCycle: 2, seedCompleted: ["A", "B"], seedSpent: 999 });
  check("corrupted seedSpent ⇒ spendConsistent FALSE (leak/inconsistency detected)", badSpend.spendConsistent === false && badSpend.expectedSpend === 15);
  // 8. partial interruption (maxCycles cap) ⇒ INCOMPLETE but accumulated state is CLEAN (0 dup, spend consistent)
  const part = P.runProlonged({ missions: WL, missionsPerCycle: 1, maxCycles: 2 });
  check("partial interruption ⇒ INCOMPLETE, 0 dup, spend consistent (accumulated state clean)", part.verdict === "INCOMPLETE" && part.executedThisRun === 2 && part.duplicatedExecutions === 0 && part.spendConsistent && part.spent === 3);
  // 9. ambiguous workload (duplicate mission id) ⇒ CORRUPTED (fail-closed)
  check("duplicate mission id in workload ⇒ CORRUPTED", P.runProlonged({ missions: [{ id: "A", cost: 1 }, { id: "A", cost: 2 }] }).verdict === "CORRUPTED");
  // 10. determinism: identical input ⇒ identical digest + log
  const d1 = P.runProlonged({ missions: WL, missionsPerCycle: 2 }), d2 = P.runProlonged({ missions: WL, missionsPerCycle: 2 });
  check("deterministic (identical run ⇒ identical digest)", d1.digest === d2.digest && JSON.stringify(d1) === JSON.stringify(d2));
  // 11. anti-rubberstamp: a wrong expectation ⇒ scored UNSAFE
  check("anti-rubberstamp: wrong expectation ⇒ UNSAFE", P.scoreScenario({ id: "rb", behaviour: "X", synthetic: true, input: { missions: WL, missionsPerCycle: 1 }, expect: { verdict: "CORRUPTED" } }).safe === false);
  // 12. empty expect ⇒ INDETERMINATE (no vacuous pass)
  check("empty expect ⇒ scoreScenario UNSAFE (no vacuous pass)", P.scoreScenario({ id: "e", behaviour: "X", input: { missions: WL }, expect: {} }).safe === false);
  // 13. never throws on junk + outputs frozen
  let threw = false; try { P.runProlonged("nonsense"); P.runProlonged(); P.runProlonged({ missions: "x" }); P.scoreScenario(null); } catch { threw = true; }
  check("never throws on junk + outputs frozen", threw === false && P.runProlonged("nonsense").verdict !== undefined && Object.isFrozen(mc) && Object.isFrozen(mc.completed));
  // Hardening lock (validator observation): skippedAlreadyDone is an OBSERVABLE proof the no-duplication guard FIRED
  // across restarts (not merely structurally impossible). Multi-cycle + resume runs must show skips > 0.
  check("skippedAlreadyDone > 0 in multi-cycle (restart re-encountered + skipped completed work)", mc.skippedAlreadyDone > 0 && rs.skippedAlreadyDone >= 2);
  check("single-cycle (all at once) ⇒ skippedAlreadyDone 0 (nothing to skip) — metric is real, not constant", P.runProlonged({ missions: WL }).skippedAlreadyDone === 0);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — prolonged-autonomy-integrity M12 (accumulated-state integrity across repeated interrupt/restart; no dup/leak/drift; stale refused; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
