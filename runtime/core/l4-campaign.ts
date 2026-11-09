#!/usr/bin/env node
"use strict";

/*
 * V12.4 / ODG LOCAL INTELLIGENCE ENGINE — L4 AUTONOMOUS MULTI-MISSION CAMPAIGN (§3-§6/§9). PURE, deterministic. The
 * ORCHESTRATION + independent-assurance core for running MULTIPLE governed native-repair missions as one campaign. It
 * does NOT call the model or write files (the live governed loop — l3-governed-repair + ollama — runs out of the gate):
 * it is the campaign STATE MACHINE + duplicate-prevention + failure classification + interruption/resumption + the
 * INDEPENDENT campaign assurance that accepts the campaign ONLY on per-mission independent evidence (never on the
 * orchestrator's own success claim). Fail-closed throughout. Composes l3-governed-repair.scoreL3 (reuse). Dual export.
 */

const L3 = require("./l3-governed-repair");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const FAILURE_KINDS = Object.freeze(["MODEL_GEN_FAILURE", "WRITE_SET_VIOLATION", "TEST_FAILURE", "INTERRUPTION", "RECOVERY_FAILURE"]);
const RETRY_LIMIT = 2;   // no infinite retries (§4)

/** newCampaign(missions) -> campaign. missions: [{ id, fixture, writeSet }]. */
function newCampaign(missions: any): any {
  const list = arr(missions).filter((m) => isObj(m) && typeof m.id === "string");
  const records: Record<string, any> = {};
  for (const m of list) records[m.id] = { id: m.id, fixture: m.fixture, writeSet: arr(m.writeSet), status: "PENDING", attempts: 0, outcome: null, provenance: null };
  return { missions: list.map((m) => m.id), records, interruptedAfter: null };
}

/** classifyFailure(kind) -> a known failure kind or UNKNOWN (fail-closed — unknown is never a success). */
function classifyFailure(kind: any): string { return FAILURE_KINDS.includes(String(kind)) ? String(kind) : "UNKNOWN_FAILURE"; }

/**
 * recordOutcome(campaign, missionId, outcome) -> campaign. outcome: { verdict, evidence }.
 * An ACCEPTED mission is IMMUTABLE (duplicate-prevention): re-recording an already-ACCEPTED mission is refused.
 * A mission is ACCEPTED only if its evidence independently passes scoreL3 (model-generated + FAIL→PASS + confined + rollback).
 */
function recordOutcome(campaign: any, missionId: any, outcome: any): any {
  const c = isObj(campaign) ? campaign : newCampaign([]);
  const rec = c.records[missionId];
  if (!rec) return c;
  if (rec.status === "ACCEPTED") return c;   // immutable — never re-accept / overwrite an accepted repair
  const o = isObj(outcome) ? outcome : {};
  rec.attempts += 1;
  if (o.verdict === "REPAIRED") {
    const ev = isObj(o.evidence) ? o.evidence : {};
    const score = L3.scoreL3({ ...ev, writeSet: rec.writeSet, changedPaths: ev.changedPaths || [rec.fixture] });
    if (score.l3Proven) { rec.status = "ACCEPTED"; rec.outcome = "REPAIRED"; rec.provenance = { at: o.at || null, attempts: rec.attempts }; }
    else { rec.status = rec.attempts >= RETRY_LIMIT ? "ESCALATED" : "FAILED"; rec.outcome = "ASSURANCE_REJECTED"; rec.failure = "TEST_FAILURE"; }
  } else {
    rec.failure = classifyFailure(o.failure);
    rec.status = rec.attempts >= RETRY_LIMIT ? "ESCALATED" : "FAILED";   // no infinite retries
    rec.outcome = rec.failure;
  }
  return c;
}

/** resumeCampaign(campaign) -> { next, acceptedSoFar }. Returns the next NON-accepted mission; never re-runs an ACCEPTED one. */
function resumeCampaign(campaign: any): any {
  const c = isObj(campaign) ? campaign : newCampaign([]);
  const accepted = c.missions.filter((id: string) => c.records[id].status === "ACCEPTED");
  const next = c.missions.find((id: string) => c.records[id].status === "PENDING" || c.records[id].status === "FAILED");
  return Object.freeze({ next: next || null, acceptedSoFar: Object.freeze(accepted), note: next ? `resume at '${next}' (skipping ${accepted.length} already-accepted)` : "no remaining mission" });
}

/**
 * assureCampaign(campaign) -> { accepted, reasons, summary }. INDEPENDENT assurance: the campaign is ACCEPTED only if
 * EVERY mission reached a terminal honest state AND every ACCEPTED mission has independent-verification provenance AND at
 * least one controlled failure was detected (not silently passed). The orchestrator's own claim is never sufficient.
 */
function assureCampaign(campaign: any): any {
  const c = isObj(campaign) ? campaign : newCampaign([]);
  const recs = c.missions.map((id: string) => c.records[id]);
  const accepted = recs.filter((r: any) => r.status === "ACCEPTED");
  const escalated = recs.filter((r: any) => r.status === "ESCALATED");
  const pending = recs.filter((r: any) => r.status === "PENDING" || r.status === "FAILED");
  const reasons: string[] = [];

  if (accepted.some((r: any) => !isObj(r.provenance))) reasons.push("an ACCEPTED mission lacks independent-verification provenance ⇒ reject");
  if (pending.length > 0) reasons.push(`${pending.length} mission(s) still PENDING/FAILED (not terminal) ⇒ campaign incomplete`);
  if (accepted.length < 3) reasons.push(`only ${accepted.length} missions accepted (<3 required) ⇒ not an L4 campaign`);
  const failuresDetected = recs.filter((r: any) => r.failure && r.failure !== "TEST_FAILURE").length + escalated.length;
  if (failuresDetected === 0) reasons.push("no controlled failure was detected/escalated ⇒ failure-handling not demonstrated");

  const campaignAccepted = reasons.length === 0;
  return Object.freeze({
    accepted: campaignAccepted,
    summary: Object.freeze({ total: recs.length, accepted: accepted.length, escalated: escalated.length, pending: pending.length }),
    reasons: Object.freeze(campaignAccepted ? ["every mission terminal, all accepted missions independently verified, failures detected ⇒ campaign assurance ACCEPTS"] : reasons),
  });
}

const L4_CAMPAIGN_CONTRACT = Object.freeze({
  id: "V124-L4-CAMPAIGN",
  source: "ODG Local Intelligence Engine L4 (§3-§6/§9) — autonomous multi-mission governed engineering campaign",
  failureKinds: FAILURE_KINDS,
  reuses: Object.freeze(["l3-governed-repair.scoreL3 (per-mission governed verdict)", "the live governed loop (ollama + patch-executor) runs out of the gate", "memory/learning-loop for provenance (composed, not reimplemented)"]),
  notAuthority: "the campaign state machine + independent assurance; it runs no model, writes no file, and grants no authority",
  invariants: Object.freeze([
    "a mission is ACCEPTED only if its evidence independently passes scoreL3 (model-generated repair, FAIL→PASS, write-set confined, Truth Lock, rollback)",
    "an ACCEPTED mission is IMMUTABLE — a repair is never re-accepted or overwritten (duplicate-prevention across interruption/resumption)",
    "resumption returns the next NON-accepted mission; already-accepted missions are never re-run",
    "no infinite retries (RETRY_LIMIT); an unrecoverable failure is ESCALATED, never silently passed; no silent cloud fallback",
    "independent campaign assurance ACCEPTS only on per-mission evidence + detected failures — never on the orchestrator's own success claim (fail-closed)",
    "pure/deterministic orchestration: mission outcomes in → campaign verdict out; calls no model, writes no file here",
  ]),
});

module.exports = { FAILURE_KINDS, RETRY_LIMIT, newCampaign, classifyFailure, recordOutcome, resumeCampaign, assureCampaign, L4_CAMPAIGN_CONTRACT };

if (require.main === module) {
  let c = newCampaign([{ id: "m1", fixture: "a.ts", writeSet: ["dir/"] }, { id: "m2", fixture: "b.ts", writeSet: ["dir/"] }, { id: "m3", fixture: "c.ts", writeSet: ["dir/"] }]);
  const good = { modelGenerated: true, testBefore: "FAIL", testAfter: "PASS", diffMinimal: true, truthLockHeld: true, rolledBack: true };
  c = recordOutcome(c, "m1", { verdict: "REPAIRED", evidence: { ...good, changedPaths: ["dir/a.ts"] }, at: "t1" });
  c = recordOutcome(c, "m2", { verdict: "FAILED", failure: "WRITE_SET_VIOLATION" });
  c = recordOutcome(c, "m2", { verdict: "REPAIRED", evidence: { ...good, changedPaths: ["dir/b.ts"] }, at: "t2" });
  c = recordOutcome(c, "m3", { verdict: "REPAIRED", evidence: { ...good, changedPaths: ["dir/c.ts"] }, at: "t3" });
  process.stdout.write(JSON.stringify({ ...L4_CAMPAIGN_CONTRACT, demo: assureCampaign(c).summary }, null, 2) + "\n");
}

export {};
