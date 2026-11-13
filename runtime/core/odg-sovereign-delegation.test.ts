#!/usr/bin/env node
"use strict";
/* V188 — sovereign delegation chain. Proves: full ODG→provider→independent→ODG chain; authority separation (provider
 * cannot authorize/expand-scope/accept/close); protected paths never writable; independent review distinct; incomplete
 * contract/deliverable refused; enforcement audit honest (ENFORCED vs NON_ENFORCED). */
const D = require("./odg-sovereign-delegation.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

const CONTRACT = { objective: "o", scope: "s", writeSet: ["runtime/core/x.ts"], protectedPaths: [], permissions: ["read", "write:x"], requiredTests: ["x.test.ts"], acceptanceCriteria: ["green"], stopConditions: ["budget"] };
const DELIV = { summary: "s", files: ["runtime/core/x.ts"], diff: "d", testsRun: ["x"], testOutputs: "ok", risks: [], limits: [], commit: "abc", reproEvidence: "r" };

function main() {
  // happy path through the whole chain with correct actors
  let st = D.createMission({ id: "m1", objective: "o", reason: "r" });
  check("createMission ⇒ CREATED (ODG authority)", st.state === "CREATED" && st.authority === "ODG");
  st = D.authorize(st, "ODG"); check("ODG authorizes ⇒ AUTHORIZED", st.state === "AUTHORIZED");
  st = D.issueContract(st, "ODG", CONTRACT); check("ODG issues contract ⇒ CONTRACT_ISSUED; ROADMAP+register auto-protected", st.state === "CONTRACT_ISSUED" && st.contract.protectedPaths.includes("runtime/governance/ROADMAP.json") && st.contract.protectedPaths.includes("docs/odg/closure-register.json"));
  st = D.providerAccept(st, "PROVIDER"); check("provider accepts ⇒ PROVIDER_ACCEPTED", st.state === "PROVIDER_ACCEPTED");
  st = D.execute(st, "PROVIDER", [{ file: "runtime/core/x.ts", kind: "modify" }]); check("provider executes within write_set ⇒ EXECUTION", st.state === "EXECUTION");
  st = D.returnResult(st, "PROVIDER", DELIV); check("provider returns complete deliverable ⇒ RESULT_RETURNED", st.state === "RESULT_RETURNED");
  st = D.odgVerify(st, "ODG", true); check("ODG verifies ⇒ ODG_VERIFIED", st.state === "ODG_VERIFIED");
  const stNoRev = D.independentReview(st, "INDEPENDENT", { available: false }); check("independent review unavailable ⇒ NOT_AVAILABLE recorded (not a self-check)", stNoRev.state === "INDEPENDENT_REVIEWED" && stNoRev.independentReview.status === "NOT_AVAILABLE");
  st = D.independentReview(st, "INDEPENDENT", { available: true, verdict: "PASS" }); check("independent review (distinct actor) ⇒ INDEPENDENT_REVIEWED", st.state === "INDEPENDENT_REVIEWED");
  st = D.accept(st, "ODG"); check("ODG accepts ⇒ ODG_ACCEPTED", st.state === "ODG_ACCEPTED");
  st = D.canonicalClose(st, "ODG"); check("ODG closes ⇒ CANONICAL_CLOSED", st.state === "CANONICAL_CLOSED");

  // authority separation — provider cannot do ODG-only steps
  check("provider CANNOT authorize", D.authorize(D.createMission({ id: "m", objective: "o", reason: "r" }), "PROVIDER").state === "REFUSED");
  const issued = D.issueContract(D.authorize(D.createMission({ id: "m", objective: "o", reason: "r" }), "ODG"), "ODG", CONTRACT);
  const accepted = D.providerAccept(issued, "PROVIDER");
  const returned = D.returnResult(D.execute(accepted, "PROVIDER", [{ file: "runtime/core/x.ts" }]), "PROVIDER", DELIV);
  const verified = D.odgVerify(returned, "ODG", true);
  const reviewed = D.independentReview(verified, "INDEPENDENT", { available: true, verdict: "PASS" });
  check("provider CANNOT self-accept", D.accept(reviewed, "PROVIDER").state === "REFUSED" && /ONLY_ODG_ACCEPTS/.test(D.accept(reviewed, "PROVIDER").reason));
  check("provider CANNOT self-close", D.canonicalClose(D.accept(reviewed, "ODG"), "PROVIDER").state === "REFUSED");
  check("review by PROVIDER refused (must be independent)", D.independentReview(verified, "PROVIDER", { available: true }).state === "REFUSED");

  // scope + protected-path enforcement
  check("execute OUT of write_set ⇒ REFUSED (no scope expansion)", D.execute(accepted, "PROVIDER", [{ file: "runtime/core/other.ts" }]).state === "REFUSED");
  check("execute write to ROADMAP.json ⇒ REFUSED (ALWAYS_PROTECTED)", (() => { const cw = { ...CONTRACT, writeSet: ["runtime/governance/ROADMAP.json"] }; const iss = D.issueContract(D.authorize(D.createMission({ id: "m", objective: "o", reason: "r" }), "ODG"), "ODG", cw); const acc = D.providerAccept(iss, "PROVIDER"); return D.execute(acc, "PROVIDER", [{ file: "runtime/governance/ROADMAP.json" }]).state === "REFUSED"; })());

  // incomplete contract / deliverable
  check("incomplete contract ⇒ REFUSED", D.issueContract(D.authorize(D.createMission({ id: "m", objective: "o", reason: "r" }), "ODG"), "ODG", { objective: "o" }).state === "REFUSED");
  check("incomplete deliverable ⇒ REFUSED (cannot be verified)", D.returnResult(D.execute(accepted, "PROVIDER", [{ file: "runtime/core/x.ts" }]), "PROVIDER", { summary: "s" }).state === "REFUSED");

  // §3.1 enforcement audit honesty
  const ea = D.enforcementAudit();
  check("enforcement audit: write_set + protected-path + no-self-accept are ENFORCED", ea.filter((r: any) => r.status === "ENFORCED").length >= 4 && ea.some((r: any) => /write_set/.test(r.rule) && r.status === "ENFORCED"));
  check("enforcement audit: radar-bypass + real-deploy are NON_ENFORCED with compensating controls", ea.some((r: any) => /bypassing the radar/.test(r.rule) && r.status === "NON_ENFORCED" && r.compensating) && ea.some((r: any) => /deploy\/systemd/.test(r.rule) && r.compensating));

  // provider contract terms + determinism
  check("PROVIDER_CONTRACT_TERMS = TECHNICAL_PROVIDER_ONLY, not authority for CTO/registers/self-independence", D.PROVIDER_CONTRACT_TERMS.role === "TECHNICAL_PROVIDER_ONLY" && D.PROVIDER_CONTRACT_TERMS.notAuthorityFor.includes("CTO") && D.PROVIDER_CONTRACT_TERMS.notAuthorityFor.includes("self_independence"));
  check("contract invariants: authority separation + no 2nd orchestrator + NON_ENFORCED declared", D.SOVEREIGN_DELEGATION_CONTRACT.invariants.some((i: string) => /cannot self-authorize/.test(i)) && D.SOVEREIGN_DELEGATION_CONTRACT.invariants.some((i: string) => /no 2nd orchestrator/.test(i)));
  check("deterministic + frozen", D.createMission({ id: "m", objective: "o", reason: "r" }).state === "CREATED" && Object.isFrozen(st) && Object.isFrozen(D.enforcementAudit()));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — sovereign-delegation (V188: full ODG→provider→independent→ODG chain; authority separation [provider cannot authorize/expand-scope/accept/close]; ROADMAP+register ALWAYS_PROTECTED; independent review distinct or NOT_AVAILABLE; incomplete contract/deliverable refused; enforcement audit ENFORCED-vs-NON_ENFORCED honest; no 2nd orchestrator)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
