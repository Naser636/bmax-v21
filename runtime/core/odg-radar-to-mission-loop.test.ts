#!/usr/bin/env node
"use strict";
/* V184 — radar→mission loop integration tests over SYNTHETIC signals (directive §3). Proves the invariants: hypothesis≠
 * fact, signal≠client, score≠authorization, expired⇒no mission, no owner-gate bypass, dedup, refused≠executed, and that
 * the loop writes nothing canonical and executes nothing. All signals are clearly SYNTHETIC. */
const L = require("./odg-radar-to-mission-loop.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const NOW = 1794000000000; const D = 86400000;
const base = { synthetic: true, provenance: "OBSERVED_EVIDENCE", sources: ["https://example.test/eaa"], consultedEpochMs: NOW - 10 * D, buySignal: "REGULATORY_DEADLINE", segmentFit: 4, budgetEvidence: "OBSERVED", regulatoryUrgency: 4, metier: "M5" };
const sig = (o: any) => Object.assign({}, base, o);

function main() {
  // §3 — twelve scenarios
  const signals = [
    sig({ id: "s1-valid" }),                                                   // 1 valid+documented
    sig({ id: "s2-expired", consultedEpochMs: NOW - 400 * D }),                // 2 expired
    sig({ id: "s3-noprov", provenance: "HYPOTHESIS", sources: [] }),           // 3 no provenance
    sig({ id: "s4-contra", contradictory: true }),                             // 4 contradictory
    sig({ id: "s5-dup" }), sig({ id: "s5-dup" }),                              // 5 already-known (duplicate)
    sig({ id: "s6-multi", metiers: ["M1", "P3"] }),                            // 6 multi-métier
    sig({ id: "s7-nocap", metier: "ZZ" }),                                     // 7 no capability / no métier attachable
    sig({ id: "s8-owner", ownerGatedKind: "payment" }),                        // 8 needs owner authorization
    sig({ id: "s9-lowfit", segmentFit: 1 }),                                   // 9 low economic interest
    sig({ id: "s10-hostile", hostileInjection: true }),                        // 10 hostile injection
    sig({ id: "s11-truthlock", provenance: "HYPOTHESIS", sources: [], claimsFact: true }), // 11 truth-lock refusal (hypothesis-as-fact)
    sig({ id: "s12-admissible" }),                                             // 12 admissible but not authorized
    sig({ id: "s13-computed-contra", counterSources: ["https://other.test/retraction"] }), // 13 V224: contradiction COMPUTED from a counter-source (no caller flag)
  ];
  const r = L.runLoop(signals, { nowEpochMs: NOW });
  const by: any = {}; for (const t of r.traces) by[t.signalId] = t;

  check("valid documented signal ⇒ PROPOSED (admissible, not authorized)", by["s1-valid"].gate.verdict === "PROPOSED" && by["s1-valid"].gate.authorized === false);
  check("expired signal ⇒ REFUSED (no mission)", by["s2-expired"].gate.verdict === "REFUSED" && by["s2-expired"].gate.reasons.includes("EXPIRED_OR_UNDATED_SIGNAL"));
  check("no reliable provenance ⇒ REFUSED", by["s3-noprov"].gate.verdict === "REFUSED" && by["s3-noprov"].gate.reasons.includes("NO_RELIABLE_PROVENANCE"));
  check("contradictory signal ⇒ REFUSED", by["s4-contra"].gate.verdict === "REFUSED" && by["s4-contra"].gate.reasons.includes("CONTRADICTORY_SIGNAL"));
  const dups = r.traces.filter((t: any) => t.signalId === "s5-dup");
  check("duplicate opportunity ⇒ first PROPOSED, second REFUSED DUPLICATE", dups[0].gate.verdict === "PROPOSED" && dups[1].gate.verdict === "REFUSED" && dups[1].gate.reasons.includes("DUPLICATE"));
  check("multi-métier opportunity attaches >1 métier, still gated", by["s6-multi"].attach.multiMetier === true && by["s6-multi"].attach.metiers.length === 2);
  check("no attachable métier/capability ⇒ REFUSED", by["s7-nocap"].gate.verdict === "REFUSED" && by["s7-nocap"].gate.reasons.includes("NO_METIER_ATTACHED") && by["s7-nocap"].attach.unknown.includes("ZZ"));
  check("owner-authorization-required ⇒ OWNER_GATED, not authorized", by["s8-owner"].gate.verdict === "OWNER_GATED" && by["s8-owner"].gate.authorized === false);
  check("low economic fit ⇒ DISQUALIFIED ⇒ REFUSED", by["s9-lowfit"].gate.verdict === "REFUSED" && by["s9-lowfit"].gate.reasons.includes("DISQUALIFIED_LOW_FIT"));
  check("hostile source content ignored ⇒ REFUSED (content is not a governance instruction)", by["s10-hostile"].gate.verdict === "REFUSED" && by["s10-hostile"].gate.reasons.includes("HOSTILE_CONTENT_IN_SOURCE_IGNORED"));
  check("hypothesis-as-fact (truth-lock) ⇒ REFUSED, never treated as validated", by["s11-truthlock"].gate.verdict === "REFUSED" && by["s11-truthlock"].assess.reliabilityTier === "INSUFFICIENTLY_VALIDATED");
  check("admissible proposal ⇒ PROPOSED but executed=false & authorized=false", by["s12-admissible"].gate.verdict === "PROPOSED" && by["s12-admissible"].gate.executed === false && by["s12-admissible"].gate.authorized === false);
  // V224: contradiction is now COMPUTED from a cited counter-source (no caller flag) ⇒ CONTESTED corroboration ⇒ REFUSED.
  check("computed contradiction (counterSources ⇒ CONTESTED) ⇒ contradictory ⇒ REFUSED, without a caller flag", by["s13-computed-contra"].assess.contradictory === true && by["s13-computed-contra"].assess.corroboration.level === "CONTESTED" && by["s13-computed-contra"].gate.verdict === "REFUSED" && by["s13-computed-contra"].gate.reasons.includes("CONTRADICTORY_SIGNAL"));
  check("corroboration is now computed + exposed on every assessment (s1 single-source ⇒ SINGLE_SOURCE, still PROPOSED)", by["s1-valid"].assess.corroboration.level === "SINGLE_SOURCE" && by["s1-valid"].gate.verdict === "PROPOSED");

  // §3 invariant assertions
  check("INVARIANT a hypothesis never becomes a fact (HYPOTHESIS ⇒ not validated)", r.traces.filter((t: any) => t.signalId.startsWith("s3") || t.signalId.startsWith("s11")).every((t: any) => t.assess.reliabilityTier === "INSUFFICIENTLY_VALIDATED"));
  check("INVARIANT a validated signal is NEVER a client", /NOT a signed client/.test(by["s1-valid"].qualify.note));
  check("INVARIANT a score is NEVER an authorization (every PROPOSED stays authorized=false)", r.traces.filter((t: any) => t.gate.verdict === "PROPOSED").every((t: any) => t.gate.authorized === false));
  check("INVARIANT no owner-gate bypass (OWNER_GATED never authorized/executed)", r.traces.filter((t: any) => t.gate.verdict === "OWNER_GATED").every((t: any) => t.gate.authorized === false && t.gate.executed === false));
  check("INVARIANT refused ≠ executed (every REFUSED has executed=false)", r.traces.filter((t: any) => t.gate.verdict === "REFUSED").every((t: any) => t.gate.executed === false));
  check("INVARIANT loop writes nothing canonical and executes nothing", r.canonicalWritesPerformed === 0 && r.executionsPerformed === 0);

  // §2 path map + §6 scheduler reality
  const pm = L.pathMap();
  check("path map covers A..L with module + state; K (canonical mission) is OWNER_GATED", pm.length === 11 && pm.some((s: any) => /K canonical/.test(s.step) && s.state === "OWNER_GATED") && pm.every((s: any) => s.module && s.state));
  const sr = L.schedulerReality();
  check("scheduler reality: resident NOT_AUTHORIZED, real run NOT_MEASURED (not claimed)", /NOT_AUTHORIZED/.test(sr.residentRun) && /NOT_MEASURED|NOT_RUN/.test(sr.realScheduledRun + "") && /NOT claimed/.test(sr.note));

  // contract + determinism
  check("contract: composition-only, hypothesis≠fact, score≠auth, PROPOSED≠AUTHORIZED≠EXECUTED", L.RADAR_TO_MISSION_CONTRACT.invariants.some((i: string) => /NO second radar\/scheduler\/registry/.test(i)) && L.RADAR_TO_MISSION_CONTRACT.invariants.some((i: string) => /PROPOSED ≠ AUTHORIZED ≠ EXECUTED/.test(i)));
  // V17.6 — ODG_INTERNAL scope (odg-radar-build-engine): components instead of métiers, no ICP qualification, owner_decision gate, seenKeys dedup
  const isig = (o: any) => Object.assign({ scope: L.INTERNAL_SCOPE, provenance: "OBSERVED_EVIDENCE", sources: ["docs/odg/evidence/X.json#a"], consultedEpochMs: NOW - D }, o);
  const ir = L.runLoop([isig({ id: "i-ok", targetComponents: ["odg-go-cycle"] }), isig({ id: "i-nocomp", targetComponents: [] }), isig({ id: "i-owner", targetComponents: ["odg-governance-precedence"], ownerGatedKind: "owner_decision" }), isig({ id: "REG-1", targetComponents: ["x"] }), sig({ id: "c-owner-decision", ownerGatedKind: "owner_decision" })], { nowEpochMs: NOW, seenKeys: ["REG-1"] });
  const ib: any = {}; for (const t of ir.traces) ib[t.signalId] = t;
  check("internal signal with a component ⇒ PROPOSED, tier INTERNAL_IMPROVEMENT, never authorized", ib["i-ok"].gate.verdict === "PROPOSED" && ib["i-ok"].qualify.tier === "INTERNAL_IMPROVEMENT" && ib["i-ok"].gate.authorized === false && ib["i-ok"].proposal.components[0] === "odg-go-cycle");
  check("internal signal without a component ⇒ REFUSED NO_COMPONENT_ATTACHED", ib["i-nocomp"].gate.verdict === "REFUSED" && ib["i-nocomp"].gate.reasons.includes("NO_COMPONENT_ATTACHED"));
  check("internal owner_decision ⇒ OWNER_GATED", ib["i-owner"].gate.verdict === "OWNER_GATED");
  check("opts.seenKeys ⇒ already-known key REFUSED DUPLICATE", ib["REG-1"].gate.reasons.includes("DUPLICATE"));
  check("owner_decision kind does NOT change non-internal signals (commercial path unchanged)", ib["c-owner-decision"].gate.verdict === "PROPOSED");
  check("deterministic given injected nowEpochMs", JSON.stringify(L.runLoop(signals, { nowEpochMs: NOW }).byVerdict) === JSON.stringify(r.byVerdict) && Object.isFrozen(r));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — radar-to-mission-loop (V184: 12 synthetic-signal scenarios + 6 invariant assertions; hypothesis≠fact, signal≠client, score≠authorization, expired⇒no mission, no owner-gate bypass, dedup, refused≠executed; composition-only [no 2nd radar/scheduler/registry]; 0 canonical writes / 0 executions; K=OWNER_GATED; scheduler NOT_MEASURED)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
