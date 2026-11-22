#!/usr/bin/env node
"use strict";
// V15.0 §45 scenario M — runs the REAL scenario (child processes, real SIGKILL) in a throw-away temp dir and asserts every
// resume invariant from the durable trail. No network, no runtime/generated write.
const S = require("./odg-scenario-m-resume");
let failures = 0;
function check(c: any, l: string): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } else process.stdout.write("  ok - " + l + "\n"); }

(async () => {
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
  if (failures === 0) process.stdout.write(`ALL PASS — V150 SCENARIO M (resume ${JSON.stringify(m.resumeWallMs)})\n`);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
