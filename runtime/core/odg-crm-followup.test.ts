#!/usr/bin/env node
"use strict";
/* Tests for odg-crm-followup (CRM interaction history + follow-up cadence, D14). PURE. */
const F = require("./odg-crm-followup.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function seed(): any[] { return [
  { clientId: "cli-A", kind: "CALL", day: 2, direction: "OUTBOUND" },
  { clientId: "cli-A", kind: "EMAIL", day: 10, direction: "OUTBOUND", note: "devis envoyé" },
  { clientId: "cli-B", kind: "MEETING", day: 5 },
  { clientId: "cli-C", kind: "SITE_VISIT", day: 30 },
]; }

function main(): void {
  // buildLog: valid accepted, malformed rejected (never coerced)
  const log = F.buildLog(seed());
  check("buildLog: 4 accepted, 0 rejected", log.ok === true && log.interactions.length === 4 && log.rejected.length === 0);
  const bad = F.buildLog([...seed(), { clientId: "x", kind: "TELEPATHY", day: 1 }, { clientId: "y", kind: "CALL" /* no day */ }, { kind: "CALL", day: 1 /* no client */ }]);
  check("malformed interactions REJECTED (bad kind / no day / no clientId)", bad.interactions.length === 4 && bad.rejected.length === 3 && /kind must be/.test(bad.rejected[0].reason));

  // append-only: original array not mutated
  const appended = F.appendInteraction(log.interactions, { clientId: "cli-A", kind: "NOTE", day: 12, note: "relancé" });
  check("appendInteraction returns new log with +1, original unchanged (append-only)", appended.ok === true && appended.interactions.length === 5 && log.interactions.length === 4);
  check("append rejects malformed", F.appendInteraction(log.interactions, { clientId: "z", kind: "BAD", day: 1 }).code === "INVALID_INTERACTION");

  // history: chronological per client
  const hA = F.history(log.interactions, "cli-A");
  check("history cli-A: 2 interactions, chronological (day 2 then 10)", hA.count === 2 && hA.interactions[0].day === 2 && hA.interactions[1].day === 10);
  check("history unknown client ⇒ empty", F.history(log.interactions, "nobody").count === 0);
  check("history no clientId ⇒ NO_CLIENT_ID", F.history(log.interactions, "").code === "NO_CLIENT_ID");

  // followUpStatus: cadence 7, asOfDay 15.
  // cli-A last=10 due=17 ⇒ asOf15<17 ⇒ OK (daysUntilDue 2); cli-B last=5 due=12 ⇒ 15>12 OVERDUE (3); cli-C last=30 due=37 ⇒ OK (22)
  const st = F.followUpStatus(log.interactions, { asOfDay: 15, cadenceDays: 7 });
  const cl = (id: string) => st.clients.find((c: any) => c.clientId === id);
  check("cli-A OK, due 17, 2 days until due", cl("cli-A").status === "OK" && cl("cli-A").dueDay === 17 && cl("cli-A").daysUntilDue === 2);
  check("cli-B OVERDUE by 3 (due 12, asOf 15)", cl("cli-B").status === "OVERDUE" && cl("cli-B").dueDay === 12 && cl("cli-B").daysOverdue === 3);
  check("cli-C OK (due 37)", cl("cli-C").status === "OK" && cl("cli-C").dueDay === 37);

  // DUE boundary: asOfDay exactly == dueDay ⇒ DUE
  check("asOfDay == dueDay ⇒ DUE", F.followUpStatus(log.interactions, { asOfDay: 12, cadenceDays: 7 }).clients.find((c: any) => c.clientId === "cli-B").status === "DUE");

  // NEVER_CONTACTED: a listed client with no interactions is NEVER_CONTACTED, not overdue (no invented date)
  const withNew = F.followUpStatus(log.interactions, { asOfDay: 100, cadenceDays: 7, clientIds: ["cli-NEW"] });
  check("listed client with no interactions ⇒ NEVER_CONTACTED (not overdue, null dates)", withNew.clients.find((c: any) => c.clientId === "cli-NEW").status === "NEVER_CONTACTED" && withNew.clients.find((c: any) => c.clientId === "cli-NEW").dueDay === null);

  // dueList: only DUE/OVERDUE, most overdue first; NEVER_CONTACTED separate
  const dl = F.dueList(log.interactions, { asOfDay: 40, cadenceDays: 7, clientIds: ["cli-NEW"] });
  // asOf40: A due17 overdue23; B due12 overdue28; C due37 overdue3 ⇒ order B,A,C
  check("dueList ordered most-overdue-first [cli-B,cli-A,cli-C]", JSON.stringify(dl.due.map((c: any) => c.clientId)) === JSON.stringify(["cli-B", "cli-A", "cli-C"]));
  check("dueList separates NEVER_CONTACTED (first contact, not relance)", JSON.stringify(dl.neverContacted) === JSON.stringify(["cli-NEW"]));

  // fail-closed cadence/asOf
  check("bad asOfDay ⇒ BAD_ASOF_DAY", F.followUpStatus(log.interactions, { asOfDay: -1, cadenceDays: 7 }).code === "BAD_ASOF_DAY");
  check("bad cadence (0) ⇒ BAD_CADENCE", F.followUpStatus(log.interactions, { asOfDay: 1, cadenceDays: 0 }).code === "BAD_CADENCE");

  // governance: no send performed anywhere; outreach owner-gated (asserted via contract + note)
  check("followUpStatus note: suggestion, NO send, owner-gated", /performs NO send/.test(st.note) && /OWNER_GATED/.test(st.note));

  // determinism + frozen
  check("deterministic", JSON.stringify(F.followUpStatus(log.interactions, { asOfDay: 15, cadenceDays: 7 })) === JSON.stringify(st));
  check("frozen", Object.isFrozen(log) && Object.isFrozen(log.interactions) && Object.isFrozen(st) && Object.isFrozen(st.clients));

  check("contract: append-only, never fabricate, never-contacted≠overdue, no send, no clock",
    F.CRM_FOLLOWUP_CONTRACT.invariants.some((s: string) => /APPEND-ONLY/.test(s)) &&
    F.CRM_FOLLOWUP_CONTRACT.invariants.some((s: string) => /never fabricated/.test(s)) &&
    F.CRM_FOLLOWUP_CONTRACT.invariants.some((s: string) => /NEVER_CONTACTED, not 'overdue'/.test(s)) &&
    F.CRM_FOLLOWUP_CONTRACT.invariants.some((s: string) => /performs NO send/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-crm-followup (D14 history+follow-up: append-only interaction log, malformed REJECTED; cadence due-status OK/DUE/OVERDUE/NEVER_CONTACTED; dueList most-overdue-first; NEVER_CONTACTED≠overdue; performs NO send [outreach OWNER_GATED]; no clock; PURE/deterministic/frozen)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
