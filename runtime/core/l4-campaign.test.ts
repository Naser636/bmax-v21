#!/usr/bin/env node
"use strict";

const C = require("./l4-campaign");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

const GOOD = (path: string) => ({ modelGenerated: true, testBefore: "FAIL", testAfter: "PASS", diffMinimal: true, truthLockHeld: true, rolledBack: true, changedPaths: [path] });
const missions = [{ id: "m1", fixture: "dir/a.ts", writeSet: ["dir/"] }, { id: "m2", fixture: "dir/b.ts", writeSet: ["dir/"] }, { id: "m3", fixture: "dir/c.ts", writeSet: ["dir/"] }];

// a mission is ACCEPTED only on independent scoreL3 evidence.
{
  let c = C.newCampaign(missions);
  c = C.recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: GOOD("dir/a.ts"), at: "t1" });
  check(c.records.m1.status === "ACCEPTED" && c.records.m1.provenance, "mission accepted on independent evidence, with provenance");
}
// a REPAIRED claim WITHOUT valid evidence is NOT accepted (orchestrator claim ≠ acceptance).
{
  let c = C.newCampaign(missions);
  c = C.recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: { modelGenerated: true, testBefore: "PASS", testAfter: "PASS" } }); // no real defect
  check(c.records.m1.status !== "ACCEPTED", "REPAIRED claim without a real FAIL→PASS ⇒ NOT accepted");
}
// a Claude-written (not model-generated) repair is NOT accepted.
{
  let c = C.newCampaign(missions);
  c = C.recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: { ...GOOD("dir/a.ts"), modelGenerated: false } });
  check(c.records.m1.status !== "ACCEPTED", "Claude-written repair ⇒ NOT accepted (model must generate)");
}
// out-of-write-set change ⇒ NOT accepted (confinement breach).
{
  let c = C.newCampaign(missions);
  c = C.recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: { ...GOOD("dir/a.ts"), changedPaths: ["dir/a.ts", "other/x.ts"] } });
  check(c.records.m1.status !== "ACCEPTED", "change outside the write-set ⇒ NOT accepted (confinement breach)");
}
// duplicate-prevention: an ACCEPTED mission is immutable (cannot be re-recorded/overwritten).
{
  let c = C.newCampaign(missions);
  c = C.recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: GOOD("dir/a.ts"), at: "t1" });
  const attemptsBefore = c.records.m1.attempts;
  c = C.recordOutcome(c, "m1", { verdict: "FAILED", failure: "TEST_FAILURE" });
  check(c.records.m1.status === "ACCEPTED" && c.records.m1.attempts === attemptsBefore, "ACCEPTED mission is immutable (no re-accept/overwrite)");
}
// failure classification + no infinite retries (escalation after RETRY_LIMIT).
{
  let c = C.newCampaign(missions);
  check(C.classifyFailure("WRITE_SET_VIOLATION") === "WRITE_SET_VIOLATION" && C.classifyFailure("bogus") === "UNKNOWN_FAILURE", "failure classified; unknown ⇒ UNKNOWN_FAILURE (fail-closed)");
  c = C.recordOutcome(c, "m2", { verdict: "FAILED", failure: "MODEL_GEN_FAILURE" });
  c = C.recordOutcome(c, "m2", { verdict: "FAILED", failure: "MODEL_GEN_FAILURE" });
  check(c.records.m2.status === "ESCALATED", "failure past RETRY_LIMIT ⇒ ESCALATED (no infinite retries)");
}
// interruption / resumption: resume skips accepted missions, never re-runs them.
{
  let c = C.newCampaign(missions);
  c = C.recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: GOOD("dir/a.ts"), at: "t1" });
  const res = C.resumeCampaign(c); // interrupted after m1
  check(res.acceptedSoFar.includes("m1") && res.next === "m2", "resumption: m1 accepted preserved, resume at m2 (no duplicate)");
}
// independent campaign assurance: accepts only on full per-mission evidence + a detected failure.
{
  let c = C.newCampaign(missions);
  c = C.recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: GOOD("dir/a.ts"), at: "t1" });
  c = C.recordOutcome(c, "m2", { verdict: "FAILED", failure: "WRITE_SET_VIOLATION" }); // a detected failure, then recover
  c = C.recordOutcome(c, "m2", { verdict: "REPAIRED", evidence: GOOD("dir/b.ts"), at: "t2" });
  c = C.recordOutcome(c, "m3", { verdict: "REPAIRED", evidence: GOOD("dir/c.ts"), at: "t3" });
  const a = C.assureCampaign(c);
  check(a.accepted === true && a.summary.accepted === 3, "campaign assurance ACCEPTS: 3 independently-verified missions + a detected failure");
}
// assurance REJECTS if a mission is still pending.
{
  let c = C.newCampaign(missions);
  c = C.recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: GOOD("dir/a.ts"), at: "t1" });
  check(C.assureCampaign(c).accepted === false, "incomplete campaign (missions pending) ⇒ assurance REJECTS");
}

check(/never on the orchestrator's own success claim/i.test(JSON.stringify(C.L4_CAMPAIGN_CONTRACT.invariants)), "contract: assurance never trusts the orchestrator's claim");
check(/ACCEPTED mission is IMMUTABLE/i.test(JSON.stringify(C.L4_CAMPAIGN_CONTRACT.invariants)), "contract: duplicate-prevention");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 L4 CAMPAIGN\n");
process.exit(failures === 0 ? 0 : 1);

export {};
