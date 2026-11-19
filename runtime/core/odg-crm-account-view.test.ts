#!/usr/bin/env node
"use strict";
/* Tests for odg-crm-account-view (consolidated CRM account view, D14). PURE. Composes REAL segmentation + follow-up (no mocks). */
const AV = require("./odg-crm-account-view.js");
const SEG = require("./odg-crm-segmentation.js");
const FU = require("./odg-crm-followup.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
function acc(v: any, id: string): any { return v.accounts.find((a: any) => a.id === id); }

const POLICY = { valueTiers: [{ label: "A", minMinor: 10000000 }, { label: "B", minMinor: 1000000 }, { label: "C", minMinor: 1 }] };
function clients(): any[] { return [
  { id: "c1", totalValueMinor: 25000000 }, // A
  { id: "c2", totalValueMinor: 5000000 },  // B
  { id: "c3", totalValueMinor: 500 },      // C
  { id: "c4" },                            // value UNSEGMENTED
]; }
function interactions(): any[] { return [
  { clientId: "c1", kind: "CALL", day: 2 },   // last 2 ⇒ due 9 ⇒ asOf100 OVERDUE
  { clientId: "c2", kind: "EMAIL", day: 98 },  // last 98 ⇒ due 105 ⇒ asOf100 OK
  { clientId: "c3", kind: "MEETING", day: 50 },
  // c4 has NO interactions ⇒ NEVER_CONTACTED
]; }

function main(): void {
  const v = AV.accountView(clients(), { interactions: interactions(), segmentationPolicy: POLICY, asOfDay: 100, cadenceDays: 7, prioritySegments: ["A"] });
  check("ok, 4 accounts", v.ok === true && v.accounts.length === 4);

  // join fidelity vs standalone engines (composition, not re-impl)
  const segStandalone = SEG.segmentClients(clients(), POLICY, { asOfDay: 100 });
  const fuStandalone = FU.followUpStatus(interactions(), { asOfDay: 100, cadenceDays: 7, clientIds: ["c1", "c2", "c3", "c4"] });
  check("segments joined identical to standalone segmentation", acc(v, "c1").segments.value === "A" && acc(v, "c1").segments.value === segStandalone.clients.find((s: any) => s.id === "c1").segments.value);
  check("follow-up joined identical to standalone", acc(v, "c1").followUp.status === fuStandalone.clients.find((f: any) => f.clientId === "c1").status);

  // per-account consolidated facts
  check("c1: segment A, OVERDUE (due 9, asOf 100), 1 interaction", acc(v, "c1").segments.value === "A" && acc(v, "c1").followUp.status === "OVERDUE" && acc(v, "c1").followUp.dueDay === 9 && acc(v, "c1").interactionCount === 1);
  check("c2: segment B, OK (due 105)", acc(v, "c2").segments.value === "B" && acc(v, "c2").followUp.status === "OK");
  check("c4: value UNSEGMENTED + NEVER_CONTACTED (no interactions), 0 interactions", acc(v, "c4").segments.value === SEG.UNSEGMENTED && acc(v, "c4").followUp.status === "NEVER_CONTACTED" && acc(v, "c4").followUp.dueDay === null && acc(v, "c4").interactionCount === 0);

  // THE cross-reference: priority value-segment (A) ∩ DUE/OVERDUE = [c1]; c3 is overdue but NOT segment A ⇒ excluded
  check("priorityFollowUps = [c1] (A ∩ overdue)", JSON.stringify(v.attention.priorityFollowUps) === JSON.stringify(["c1"]));
  check("c3 overdue but NOT priority-segment ⇒ excluded from priorityFollowUps", acc(v, "c3").followUp.status === "OVERDUE" && v.attention.priorityFollowUps.indexOf("c3") < 0);

  // no prioritySegments ⇒ NO fabricated priority list
  const noPrio = AV.accountView(clients(), { interactions: interactions(), segmentationPolicy: POLICY, asOfDay: 100, cadenceDays: 7 });
  check("no prioritySegments ⇒ priorityFollowUps null (not fabricated)", noPrio.attention.priorityFollowUps === null);

  // rollups present (segments + follow-up status counts)
  check("rollups: segment A count 1, followUp OVERDUE count ≥1", v.rollups.segments.value.A === 1 && v.rollups.followUp.OVERDUE >= 1);

  // composes + modifies neither (no send anywhere)
  check("note: composes, modifies neither, NO send, no clock", /modifies neither/.test(v.note) && /performs NO send/.test(v.note));

  // fail-closed + refusal passthrough
  check("no clients ⇒ NO_CLIENTS", AV.accountView([], { asOfDay: 1, cadenceDays: 7 }).code === "NO_CLIENTS");
  check("bad asOfDay ⇒ BAD_ASOF_DAY", AV.accountView(clients(), { segmentationPolicy: POLICY, asOfDay: -1, cadenceDays: 7 }).code === "BAD_ASOF_DAY");
  check("bad cadence ⇒ BAD_CADENCE", AV.accountView(clients(), { segmentationPolicy: POLICY, asOfDay: 1, cadenceDays: 0 }).code === "BAD_CADENCE");
  check("client without id ⇒ BAD_CLIENT_ID", AV.accountView([{ totalValueMinor: 1 }], { segmentationPolicy: POLICY, asOfDay: 1, cadenceDays: 7 }).code === "BAD_CLIENT_ID");
  check("bad segmentation policy ⇒ SEGMENTATION_REFUSED (surfaced)", AV.accountView(clients(), { segmentationPolicy: {}, asOfDay: 1, cadenceDays: 7 }).code === "SEGMENTATION_REFUSED");

  // accepts interactions as either a raw array or a buildLog result
  const asLog = AV.accountView(clients(), { interactions: FU.buildLog(interactions()), segmentationPolicy: POLICY, asOfDay: 100, cadenceDays: 7 });
  check("accepts interactions as a buildLog result too", asLog.ok === true && acc(asLog, "c1").followUp.status === "OVERDUE");

  // determinism + frozen + contract
  check("deterministic", JSON.stringify(AV.accountView(clients(), { interactions: interactions(), segmentationPolicy: POLICY, asOfDay: 100, cadenceDays: 7, prioritySegments: ["A"] })) === JSON.stringify(v));
  check("frozen", Object.isFrozen(v) && Object.isFrozen(v.accounts) && Object.isFrozen(v.attention) && Object.isFrozen(acc(v, "c1")));
  check("contract: composes both, invents nothing, caller priority, no send",
    AV.CRM_ACCOUNT_VIEW_CONTRACT.invariants.some((s: string) => /MODIFIES NEITHER/.test(s)) &&
    AV.CRM_ACCOUNT_VIEW_CONTRACT.invariants.some((s: string) => /invents nothing/.test(s)) &&
    AV.CRM_ACCOUNT_VIEW_CONTRACT.invariants.some((s: string) => /CALLER-supplied prioritySegments/.test(s)) &&
    AV.CRM_ACCOUNT_VIEW_CONTRACT.invariants.some((s: string) => /performs NO send/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-crm-account-view (D14 consolidation: composes REAL segmentation + follow-up, modifies neither; per-account segments+status+interactionCount; priorityFollowUps = caller prioritySegments ∩ DUE/OVERDUE [c1], not fabricated; NEVER_CONTACTED honest; NO send; fail-closed + refusal passthrough; deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
