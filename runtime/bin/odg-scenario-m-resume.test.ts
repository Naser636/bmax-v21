#!/usr/bin/env node
"use strict";
// V15.0 §45 scenario M — runs the REAL scenario (child processes, real SIGKILL) in a throw-away temp dir and asserts every
// resume invariant from the durable trail. No network, no runtime/generated write.
// MR-1: a TTL with margin over CPU starvation on shared CI runners (live ops are ~120 ms; a 1.5 s TTL could be overrun by
// a starved LIVE holder ⇒ a legitimate-by-TTL but unintended takeover). Same assertions; only the wait scale changes.
if (!process.env.ODG_SCENARIO_M_TTL_MS) process.env.ODG_SCENARIO_M_TTL_MS = "4000";
const S = require("./odg-scenario-m-resume");
let failures = 0;
function check(c: any, l: string): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } else process.stdout.write("  ok - " + l + "\n"); }

(async () => {
  // MR-2 ROOT FIX regression (pure, no processes): the CI false double-hold — prior holder SIGKILLed holding the lease, the
  // successor's CLAIM event logged exactly TTL ms after the prior CLAIM event, but the lease's own age (claimedAt → takeover) > TTL.
  {
    const T = 4000;
    const boundary = [{ e: "CLAIM", t: 1000, op: "M3.o2", mission: "M3", pid: 1 }, { e: "CLAIM", t: 1000 + T, op: "M3.o2", mission: "M3", pid: 2, takeover: { fromPid: 1, fromGen: 2, ageFromClaimedAtMs: T + 1 } }];
    check(S.leaseDoubleHeld(boundary, T).length === 0, "MR-2: a takeover whose LEASE age (claimedAt) > TTL is legitimate even when the CLAIM-event gap is exactly TTL (no false double-hold)");
    const early = [{ e: "CLAIM", t: 1000, op: "M3.o2", mission: "M3", pid: 1 }, { e: "CLAIM", t: 1000 + T, op: "M3.o2", mission: "M3", pid: 2, takeover: { fromPid: 1, fromGen: 2, ageFromClaimedAtMs: T } }];
    check(S.leaseDoubleHeld(early, T).length === 1, "MR-2: a takeover at lease age = TTL (not strictly beyond) is still a double-hold (threshold unchanged)");
    const live = [{ e: "CLAIM", t: 1000, op: "M1.o1", mission: "M1", pid: 1 }, { e: "CLAIM", t: 1500, op: "M1.o1", mission: "M1", pid: 2 }];
    check(S.leaseDoubleHeld(live, T).length === 1, "MR-2: a second claim while the first is unreleased and unexpired is a double-hold");
    const rel = [{ e: "CLAIM", t: 1000, op: "M1.o1", mission: "M1", pid: 1 }, { e: "RELEASE", t: 1200, op: "M1.o1", pid: 1 }, { e: "CLAIM", t: 1300, op: "M1.o2", mission: "M1", pid: 2 }];
    check(S.leaseDoubleHeld(rel, T).length === 0, "MR-2: a claim after the previous RELEASE is legitimate");
    const otherPid = [{ e: "CLAIM", t: 1000, op: "M3.o2", mission: "M3", pid: 1 }, { e: "CLAIM", t: 1100, op: "M3.o2", mission: "M3", pid: 3, takeover: { fromPid: 9, ageFromClaimedAtMs: 99999 } }];
    check(S.leaseDoubleHeld(otherPid, T).length === 1, "MR-2: a takeover record about ANOTHER holder never excuses a claim on a live lease");
  }
  const out = await S.runScenario({ atomicKills: 4 });
  const v = out.verdicts, m = out.measurements, a = out.analysis;
  check(out.setup.missions >= 3, "N >= 3 independent missions");
  check(out.phases.filter((p: any) => p.signal === "SIGKILL").length >= 2, "the child was really SIGKILLed at least twice");
  check(v.killedTwiceAtDifferentPoints, "the two kills landed at different points (mid-op vs after-commit-before-persist)");
  check(v.onlyMissingOpsReRun, "a resume never re-STARTs an op that was already committed (only missing ops re-run)");
  check(v.noOpExecutedTwice && m.opsRepeatedCompleted === 0, "no op committed twice (idempotency by op id)");
  check(a.reconciledDuplicates >= 1, "the committed-but-not-persisted op was reconciled by idempotency-guard (DUPLICATE), not re-applied");
  check(v.noLostValidatedResult && m.opsLost === 0, "no validated result lost; every value equals the pure expected chain; all ops ACCEPTED");
  check(v.noCorruptRecordAtAnyRestart, "no torn register / op record at any restart (temp leftovers are never read)");
  check(v.atomicWriteSurvivesSigkill, "canonical saveRegister stays intact under repeated SIGKILL mid-write");
  check(v.leasesOfKilledRunTakenOverNotDoubleHeld, "killed run's leases refused while unexpired, taken over only after TTL, never double-held");
  check(v.failedResumeRetriedSafely, "an injected failing resume (exit 70) is retried safely to completion");
  check(v.concurrentResumersNoDoubleEffect, "two CONCURRENT resumers (multi-claimant) finish with no op executed twice and no lease double-held");
  check(out.analysis.leases.takeovers.every((t: any) => t.ageFromClaimedAtMs > out.setup.leaseTtlMs), "every takeover happened after the TTL, measured from the claimedAt the dead holder wrote");
  check(v.idempotentRerunExecutesNothing, "a re-run on the completed state executes nothing");
  for (const k of Object.keys(a.perMission)) check(a.perMission[k].repeatedCompletedOps === 0, `mission ${k}: 0 completed ops repeated`);
  check(out.allProven === true, "allProven");
  // MR-2: on failure, dump the lease analysis so a CI-only flake carries its own root-cause data (no behaviour change)
  if (failures) process.stderr.write("MR-2 lease diagnostics: " + JSON.stringify({ ttlMs: out.setup.leaseTtlMs, leases: out.analysis.leases, concurrent: out.measurements && out.measurements.concurrentResumers, phases: (out.phases || []).map((p: any) => ({ name: p.name, exit: p.exitCode, signal: p.signal, wallMs: p.wallMs })) }).slice(0, 6000) + "\n");
  if (failures === 0) process.stdout.write(`ALL PASS — V150 SCENARIO M (resume ${JSON.stringify(m.resumeWallMs)})\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
