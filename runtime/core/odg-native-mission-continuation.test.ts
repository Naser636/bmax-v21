#!/usr/bin/env node
"use strict";
/* Tests for odg-native-mission-continuation (V326 §9). Proves the PROVEN continuation engine, driven by REAL native
 * execution + genuine provenance, runs a real multi-mission lifecycle: selection→native-execution→provenance→deps→next→
 * continuation. Also: a novel lot honestly defers without freezing independent natives; acceptance is gated on actor=ODG. */
const M = require("./odg-native-mission-continuation.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function clk(): () => number { let t = 0; return () => (t += 1000); }

function main(): void {
  // ── REAL native continuation over a 4-mission DAG (A → B,C → D), each executed natively ──
  const full = M.runNativeMissionCampaign({ register: M.allNativeRegister(), now: clk() });
  check("all-native DAG drains to COMPLETED in dependency order (real native execution, not a stub)", full.campaignComplete === true && full.stopped === "COMPLETED" && JSON.stringify(full.completed) === JSON.stringify(["A", "B", "C", "D"]));
  check("every completed lot carries actor=ODG via the production resolver (acceptance gated on it)", full.allCompletedAreOdg === true && full.acceptedNativelyCount === 4 && Object.values(full.provenanceByLot).every((p: any) => p.actor === "ODG"));
  check("4 iterations = 4 real native executions (no re-run)", full.iterations === 4);

  // ── a NOVEL (out-of-catalog) lot DEFERS without freezing independent native lots ──
  const defer = M.runNativeMissionCampaign({ register: M.withNovelLotRegister(), now: clk() });
  check("independent native lots (NAT1, NAT2) still execute natively (ODG) despite a deferred novel lot", defer.completed.includes("NAT1") && defer.completed.includes("NAT2") && defer.provenanceByLot.NAT1.actor === "ODG" && defer.provenanceByLot.NAT2.actor === "ODG");
  check("the novel lot defers (ESCALATED, actor null) and its dependent cannot run ⇒ IDLE_BLOCKED (not COMPLETED, honest)", !defer.completed.includes("NOVEL") && !defer.completed.includes("DEPNOVEL") && defer.provenanceByLot.NOVEL.actor === null && defer.stopped === "IDLE_BLOCKED" && defer.campaignComplete === false);

  // ── executeNativeLot verdict mapping (unit) ──
  const okV = M.executeNativeLot({ id: "X", spec: { fnName: "x", kind: "sum", examples: [{ args: [2, 3], expect: 5 }] }, injectFault: true });
  check("executeNativeLot: green native cycle ⇒ ACCEPTED with ODG_NATIVE evidence", okV.status === "ACCEPTED" && /executor=ODG_NATIVE/.test(okV.evidence) && /actor=ODG/.test(okV.evidence));
  const novelV = M.executeNativeLot({ id: "N", spec: { fnName: "n", kind: "not-a-real-kind", examples: [] } });
  check("executeNativeLot: novel kind ⇒ WAITING_FOR_PROVIDER (honest defer, not a native success)", novelV.status === "WAITING_FOR_PROVIDER" && /provider mandate/.test(novelV.reason));
  const failV = M.executeNativeLot({ id: "F", spec: { fnName: "f", kind: "sum", examples: [{ args: [2, 3], expect: 999 }] }, injectFault: true });
  check("executeNativeLot: native cycle that stays red ⇒ FAILED (never falsely ACCEPTED)", failV.status === "FAILED");
  check("executeNativeLot: lot without a spec ⇒ FAILED (fail-closed)", M.executeNativeLot({ id: "Z" }).status === "FAILED");

  // provenance sink captures actor per lot
  const sink: any = {};
  M.executeNativeLot({ id: "S", spec: { fnName: "s", kind: "max", examples: [{ args: [2, 3], expect: 3 }] } }, sink);
  check("executeNativeLot records per-lot provenance into the sink", sink.S && sink.S.actor === "ODG" && sink.S.verdict === "NATIVE_GREEN");

  // ── demonstrate() + fail-closed register ──
  const d = M.demonstrate(clk());
  check("demonstrate: all-native continuation proven + novel-defer-without-freeze proven", d.allNativeContinues.proven === true && d.novelDefersWithoutFreezing.proven === true);
  check("fail-closed: bad register ⇒ BAD_REGISTER (no run)", M.runNativeMissionCampaign({ register: {} }).code === "BAD_REGISTER" && M.runNativeMissionCampaign(null).code === "BAD_REGISTER");

  // ── determinism + frozen + contract ──
  check("deterministic given the same clock (fresh registers)", JSON.stringify(M.runNativeMissionCampaign({ register: M.allNativeRegister(), now: clk() }).completed) === JSON.stringify(M.runNativeMissionCampaign({ register: M.allNativeRegister(), now: clk() }).completed));
  check("frozen result", Object.isFrozen(full) && Object.isFrozen(full.provenanceByLot));
  check("contract: reuses campaign-loop + native exec + provenance; ACCEPTED gated on actor=ODG; no 2nd engine; resident driver OWNER_GATED",
    M.NATIVE_MISSION_CONTINUATION_CONTRACT.reuses.some((s: string) => /campaign-loop/.test(s)) &&
    M.NATIVE_MISSION_CONTINUATION_CONTRACT.invariants.some((s: string) => /ACCEPTED ONLY when the native cycle reached green AND actor-provenance resolves actor=ODG/.test(s)) &&
    M.NATIVE_MISSION_CONTINUATION_CONTRACT.invariants.some((s: string) => /NO second scheduler\/queue\/engine/.test(s)) &&
    M.NATIVE_MISSION_CONTINUATION_CONTRACT.invariants.some((s: string) => /resident DRIVER remains OWNER_GATED/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-native-mission-continuation (V326 §9: the PROVEN continuation engine [campaign-loop] driven by REAL ODG-native execution + genuine provenance; a 4-mission DAG drains to COMPLETED in dep order with every lot actor=ODG; a novel lot honestly DEFERS [WAITING_FOR_PROVIDER ⇒ IDLE_BLOCKED] without freezing independent natives; ACCEPTED gated on green+actor=ODG [never a stub]; fail-closed; no 2nd engine; resident driver OWNER_GATED; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
