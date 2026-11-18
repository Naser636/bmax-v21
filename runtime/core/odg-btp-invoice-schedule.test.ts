#!/usr/bin/env node
"use strict";
/* V319 §7 — tests for odg-btp-invoice-schedule (acompte schedule, exact-sum, owner-gated payments). PURE, deterministic. */
const S = require("./odg-btp-invoice-schedule.js");
const Q = require("./odg-btp-quote-revision.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// a fully-approved quote with revised selling 100000 (+ an approved 25000 avenant ⇒ 125000... keep 100000 here)
function approvedQuote(initial: number): any {
  return Q.openQuote({ chantierId: "C1", currency: "EUR", initialSellingMinor: initial }).quote;
}
function pendingQuote(): any {
  const o = Q.openQuote({ chantierId: "C1", initialSellingMinor: 100000 }).quote;
  return Q.proposeRevision(o, { deltaMinor: 5000, reason: "x", source: "y" }).quote; // has a pending (unapproved) revision
}

function main(): void {
  const q = approvedQuote(100000); // no revisions ⇒ no pending ⇒ schedulable; basis 100000

  // fail-closed: pending revision cannot schedule
  check("pending revision ⇒ cannot schedule", S.buildSchedule(pendingQuote(), { milestones: [{ label: "acompte", percentBps: 10000 }] }).code === "PENDING_REVISIONS");

  // bps must sum to 100%
  check("bps ≠ 10000 ⇒ BPS_NOT_100", S.buildSchedule(q, { milestones: [{ label: "a", percentBps: 3000 }, { label: "b", percentBps: 5000 }] }).code === "BPS_NOT_100");
  check("no milestones ⇒ NO_MILESTONES", S.buildSchedule(q, { milestones: [] }).code === "NO_MILESTONES");
  check("bad milestone (no label) ⇒ BAD_MILESTONE", S.buildSchedule(q, { milestones: [{ percentBps: 10000 }] }).code === "BAD_MILESTONE");

  // valid schedule: 30% acompte / 40% / 30% of 100000 ⇒ 30000 / 40000 / 30000, sum EXACTLY 100000
  const b = S.buildSchedule(q, { milestones: [{ label: "acompte 30%", percentBps: 3000 }, { label: "situation 1", percentBps: 4000 }, { label: "solde", percentBps: 3000 }] });
  check("valid schedule ok, 3 PLANNED lines", b.ok && b.schedule.lines.length === 3 && b.schedule.lines.every((l: any) => l.status === "PLANNED"));
  check("amounts = 30000/40000/30000 and sum EXACTLY to basis 100000", b.schedule.lines[0].amountMinor === 30000 && b.schedule.lines[1].amountMinor === 40000 && b.schedule.lines[2].amountMinor === 30000 && b.schedule.lines.reduce((n: number, l: any) => n + l.amountMinor, 0) === 100000);

  // EXACT-sum with a non-divisible basis: 3×3333bps+1 ... use thirds of 100 (100 minor) ⇒ 33/33/34 (last absorbs remainder)
  const q100 = approvedQuote(100);
  const thirds = S.buildSchedule(q100, { milestones: [{ label: "t1", percentBps: 3333 }, { label: "t2", percentBps: 3333 }, { label: "t3", percentBps: 3334 }] });
  check("non-divisible split sums EXACTLY to basis (no fabricated cent)", thirds.ok && thirds.schedule.lines.reduce((n: number, l: any) => n + l.amountMinor, 0) === 100);

  // payments: OWNER_GATED + evidence + exact amount
  const sched = b.schedule;
  check("markPaid without owner auth ⇒ OWNER_GATED", S.markPaid(sched, "pay1", { amountMinor: 30000, evidenceRef: "r1" }).code === "OWNER_GATED");
  check("markPaid without evidence ⇒ NO_EVIDENCE", S.markPaid(sched, "pay1", { ownerAuthorized: true, owner: "akabi", amountMinor: 30000 }).code === "NO_EVIDENCE");
  check("markPaid wrong amount ⇒ AMOUNT_MISMATCH", S.markPaid(sched, "pay1", { ownerAuthorized: true, owner: "akabi", evidenceRef: "r1", amountMinor: 29999 }).code === "AMOUNT_MISMATCH");
  check("markPaid truthy-but-not-true ownerAuthorized ⇒ OWNER_GATED", S.markPaid(sched, "pay1", { ownerAuthorized: 1, owner: "akabi", evidenceRef: "r1", amountMinor: 30000 }).code === "OWNER_GATED");
  const paid = S.markPaid(sched, "pay1", { ownerAuthorized: true, owner: "akabi", evidenceRef: "virement-2026-11-18", amountMinor: 30000 });
  check("valid owner-authorized exact payment ⇒ line PAID with evidence", paid.ok && paid.schedule.lines[0].status === "PAID" && paid.schedule.lines[0].payment.evidenceRef === "virement-2026-11-18");
  check("double payment ⇒ ALREADY_PAID", S.markPaid(paid.schedule, "pay1", { ownerAuthorized: true, owner: "akabi", evidenceRef: "r2", amountMinor: 30000 }).code === "ALREADY_PAID");
  check("no such line ⇒ NO_SUCH_LINE", S.markPaid(sched, "payX", { ownerAuthorized: true, owner: "akabi", evidenceRef: "r", amountMinor: 1 }).code === "NO_SUCH_LINE");

  // outstanding reflects the unpaid remainder
  check("outstanding after paying pay1 (30000) ⇒ 70000", S.outstandingMinor(paid.schedule) === 70000);
  check("outstanding of fresh schedule ⇒ full basis 100000", S.outstandingMinor(sched) === 100000);

  // determinism + frozen
  const b2 = S.buildSchedule(approvedQuote(100000), { milestones: [{ label: "acompte 30%", percentBps: 3000 }, { label: "situation 1", percentBps: 4000 }, { label: "solde", percentBps: 3000 }] });
  check("deterministic (same inputs ⇒ same amounts)", b2.schedule.lines[1].amountMinor === b.schedule.lines[1].amountMinor);
  check("frozen outputs", Object.isFrozen(b.schedule) && Object.isFrozen(b.schedule.lines) && Object.isFrozen(paid.schedule.lines[0]));

  // contract
  check("contract: exact-sum, owner-gated payments, no-auto-charge, reuses quote-revision", S.BTP_INVOICE_SCHEDULE_CONTRACT.invariants.some((s: string) => /OWNER_GATED/.test(s)) && S.BTP_INVOICE_SCHEDULE_CONTRACT.invariants.some((s: string) => /no fabricated cent/.test(s)) && S.BTP_INVOICE_SCHEDULE_CONTRACT.reuses.length === 2);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-btp-invoice-schedule (§7: acompte schedule from an approved quote; percentBps=100%; amounts sum EXACTLY to basis [remainder on last line, no fabricated cent]; payments OWNER_GATED + evidence + exact amount, never auto-charged; deterministic)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
