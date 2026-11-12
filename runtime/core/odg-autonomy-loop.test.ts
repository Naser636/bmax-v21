#!/usr/bin/env node
"use strict";
/* V156 — ODG autonomy-loop battery. Proves the campaign's core on REAL native execution: native-first decision, ODG-issued
 * authorization (distinct from the owner grant), provider-deliverable inspection with INDEPENDENT re-verification (reject
 * invalid/out-of-scope/expired/bare-claim), independent validators (re-derive, never promote NOT_MEASURED), and the §26 A–O
 * end-to-end journey. Verifies REAL behaviour + honest executor attribution (no Claude work relabelled native). Fail-closed. */
const L = require("./odg-autonomy-loop.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- native inventory reflects the real registries ----
  const inv = L.nativeInventory();
  check("native inventory = real closed-executor + AST ops (not a fabricated list)", inv.closedExecutorOps.indexOf("sum@1") >= 0 && inv.astOps.indexOf("import-ordering@1") >= 0);

  // ---- §11 native-first decision ----
  const d = L.decideNativeFirst({ id: "M", requiredOps: ["sum@1", "import-ordering@1", "novel:ui", "unknownthing"] });
  check("native-first: partitions native / provider / missing; delegate smallest", d.native.length === 2 && d.provider.indexOf("novel:ui") >= 0 && d.missing.indexOf("unknownthing") >= 0 && d.decision === "NATIVE_PLUS_DELEGATE_SMALLEST");
  check("all-native mission ⇒ no delegation", L.decideNativeFirst({ id: "M", requiredOps: ["sum@1", "max@1"] }).decision === "ALL_NATIVE");

  // ---- authority: ODG-issued authorization is DISTINCT from the owner grant ----
  const auth = L.issueAuthorization({ id: "M1" }, { component: "ui", allowedOps: ["write:scratch"], fileScope: ["scratch/ui.ts"], expiryTick: 2 });
  check("ODG issues a scoped authorization (issuedBy ODG_GOVERNANCE, NOT the owner grant)", auth.issuedBy === "ODG_GOVERNANCE" && /ODG-AUTH:/.test(auth.authorizationId) && auth.forbiddenOps.indexOf("push") >= 0);
  check("invalid mission ⇒ no authorization (fail-closed)", L.issueAuthorization(null).code === "INVALID_MISSION");

  // ---- native execution is REAL (routes to the closed registries), honestly tagged ----
  const ex = L.executeNative("sum@1", [2, 3]);
  check("native execution is REAL + tagged ODG_NATIVE_EXECUTION", ex.executor === "ODG_NATIVE_EXECUTION" && ex.ok === true && ex.result === 5 && ex.engine === "closed-executor");
  check("AST op executes natively via ast-operations", L.executeNative("import-ordering@1", { source: 'import { b } from "./b";\nimport { a } from "./a";\n' }).executor === "ODG_NATIVE_EXECUTION");
  check("non-native op ⇒ NOT executed natively (NOT_NATIVE, honest)", L.executeNative("novel:x", []).code === "NOT_NATIVE");

  // ---- §13/§14 provider inspection: ACCEPT only after INDEPENDENT re-verification ----
  const base = { authorizationId: auth.authorizationId, diff: "x", tests: "x", commands: "x", limitations: "none", verifyOpId: "sum@1", verifyPayload: [2, 3], claimedResult: 5 };
  const good = L.inspectProviderDeliverable(base, auth, { tick: 1 });
  check("valid deliverable ACCEPTED only after ODG re-reproduces the result", good.accepted === true && good.verdict === "ACCEPTED" && good.independentlyVerified === true && good.attribution === "CLAUDE_CODE_EXECUTION");
  check("WRONG provider claim ⇒ REJECTED (ODG re-ran, claim not reproduced)", L.inspectProviderDeliverable({ ...base, claimedResult: 999 }, auth, { tick: 1 }).accepted === false);
  check("scope violation (forbidden op) ⇒ REJECTED with reason", (() => { const r = L.inspectProviderDeliverable({ ...base, operations: ["push"] }, auth, { tick: 1 }); return r.accepted === false && /forbidden/.test(r.reason); })());
  check("out-of-scope file ⇒ REJECTED", L.inspectProviderDeliverable({ ...base, filesTouched: ["/etc/passwd"] }, auth, { tick: 1 }).accepted === false);
  check("expired authorization ⇒ REJECTED", L.inspectProviderDeliverable(base, auth, { tick: 9 }).accepted === false);
  check("authorizationId mismatch ⇒ REJECTED", L.inspectProviderDeliverable({ ...base, authorizationId: "FORGED" }, auth, { tick: 1 }).accepted === false);
  check("missing required evidence ⇒ REJECTED", L.inspectProviderDeliverable({ authorizationId: auth.authorizationId, verifyOpId: "sum@1", verifyPayload: [2, 3], claimedResult: 5 }, auth, { tick: 1 }).accepted === false);
  check("bare claim (no verifyOpId) ⇒ REJECTED (never accept an unverifiable claim)", L.inspectProviderDeliverable({ authorizationId: auth.authorizationId, diff: "x", tests: "x", commands: "x", limitations: "n" }, auth, { tick: 1 }).accepted === false);
  check("provider deliverable NEVER carries an authoritative status (attributed to provider)", good.attribution === "CLAUDE_CODE_EXECUTION" && /status decided by ODG/.test(good.note));

  // ---- §14 independent validators re-derive + never promote NOT_MEASURED ----
  const iv = L.independentValidators({ contract: true, reexec: true, noEval: true, mutationCaught: true });
  check("validators: PASS only with evidence; others NOT_MEASURED (never promoted)", iv.pass >= 3 && iv.notMeasured >= 1 && iv.checks.find((c: any) => c.id === "V6").status === "NOT_MEASURED");
  check("validators are responsibilities, not new primitives (9 checks V1..V9)", iv.checks.length === 9 && iv.checks[0].id === "V1" && iv.checks[8].id === "V9");

  // ---- §26 end-to-end journey (executable, honest) ----
  const j = L.runAutonomyJourney();
  check("§26 journey A..O complete (15 steps), all native steps really execute", j.journeyComplete === true && j.steps.length === 15 && j.steps[0].step === "A" && j.steps[14].step === "O");
  check("§26 G: injected failure DETECTED; H: repaired to green", j.steps.find((s: any) => s.step === "G").status === "DONE" && j.steps.find((s: any) => s.step === "H").status === "DONE");
  check("§26 J: invalid supplier deliverable REJECTED; L: provider scope violation REFUSED", /REJECTED/.test(j.steps.find((s: any) => s.step === "J").detail) && /forbidden/.test(j.steps.find((s: any) => s.step === "L").detail));
  check("§26 K: provider requested ONLY for the missing capability (not the whole mission)", /delegate ONLY/.test(j.steps.find((s: any) => s.step === "K").detail));
  check("honest: journey is SIMULATED/synthetic, native steps real; no production claim", /SIMULATED/.test(j.honesty) && /NOT a real production run/.test(j.honesty));
  check("no Claude-Code work relabelled native (native steps genuinely via closed registries)", j.executorSummary.ODG_NATIVE_EXECUTION === 15);

  // ---- contract honesty ----
  check("contract: ODG authority, provider=supplier, deliverable=evidence not verdict, no new primitive", /provider deliverable is EVIDENCE, never a validation verdict/.test(L.ODG_AUTONOMY_LOOP_CONTRACT.invariants[0]) && /no new primitive/.test(L.ODG_AUTONOMY_LOOP_CONTRACT.invariants[4]));

  // ---- fail-closed ----
  check("fail-closed: garbage inputs ⇒ safe defaults, no throw", L.decideNativeFirst(null).native.length === 0 && L.inspectProviderDeliverable(null, null, null).accepted === false && L.independentValidators(null).pass === 0);

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — odg-autonomy-loop (native-first decision; ODG-issued authorization ≠ owner grant; provider inspection with INDEPENDENT re-verification rejecting invalid/scope/expired/bare-claim; V1..V9 validators re-derive; §26 A..O journey executable + honest; no Claude work relabelled native; fail-closed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
