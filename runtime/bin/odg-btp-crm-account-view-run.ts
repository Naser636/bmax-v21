#!/usr/bin/env node
"use strict";
/*
 * V330 M2 BTP — CRM CONSOLIDATED ACCOUNT VIEW RUN (runtime entry, D14 "CRM et relation client"). Makes the consolidated
 * CRM account view REACHABLE on demand: it composes the CRM triad on a SYNTHETIC BTP client book —
 *   odg-crm-segmentation (value tiers) + odg-crm-followup (relance cadence) → odg-crm-account-view (one per-account view) —
 * and surfaces the factual cross-reference the directive's D14 asks for: which HIGH-VALUE clients are DUE/OVERDUE for a
 * follow-up ("valuable clients I am about to lose touch with"). Pure composition of EXISTING engines; builds nothing new.
 *
 * HONESTY: SYNTHETIC client book (not real accounts). The priority value-segment is CALLER-declared (no invented ranking);
 * a follow-up is a SUGGESTION to contact — this bin sends NOTHING (any outreach stays OWNER_GATED via the existing send path).
 *
 * Usage: npx tsx runtime/bin/odg-btp-crm-account-view-run.ts
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const AV = require(path.join(ROOT, "runtime", "core", "odg-crm-account-view.js"));

// SYNTHETIC BTP client book (minor units = cents). Value tiers A/B/C are the caller-declared segmentation policy.
const clients = [
  { id: "btp-grand-chantier", totalValueMinor: 25000000 }, // A (high value)
  { id: "btp-renovation-sarl", totalValueMinor: 5000000 },  // B
  { id: "btp-artisan-plombier", totalValueMinor: 500 },     // C
  { id: "btp-nouveau-prospect" },                           // value UNSEGMENTED (no history)
];
const interactions = [
  { clientId: "btp-grand-chantier", kind: "CALL", day: 2 },     // last contact day 2 ⇒ due day 9 ⇒ asOf 100 = OVERDUE (valuable + lost touch)
  { clientId: "btp-renovation-sarl", kind: "EMAIL", day: 98 },   // recent ⇒ OK
  { clientId: "btp-artisan-plombier", kind: "MEETING", day: 50 },
  // btp-nouveau-prospect ⇒ NEVER_CONTACTED
];
const POLICY = { valueTiers: [{ label: "A", minMinor: 10000000 }, { label: "B", minMinor: 1000000 }, { label: "C", minMinor: 1 }] };

const v = AV.accountView(clients, { interactions, segmentationPolicy: POLICY, asOfDay: 100, cadenceDays: 7, prioritySegments: ["A"] });
if (v.ok !== true) { process.stdout.write("CRM VIEW FAILED: " + v.code + "\n"); process.exit(1); }
process.stdout.write(JSON.stringify({
  ran: "M2-BTP-crm-account-view", SYNTHETIC: true, asOfDay: v.asOfDay, cadenceDays: v.cadenceDays,
  accounts: v.accounts.map((a: any) => ({ id: a.id, valueSegment: a.segments.value, followUp: a.followUp.status })),
  rollups: v.rollups,
  attention_priorityFollowUps: (v.attention.priorityFollowUps || []).map((id: any) => { const a = v.accounts.find((x: any) => x.id === id) || {}; return { id, followUp: a.followUp ? a.followUp.status : null, daysOverdue: a.followUp ? a.followUp.daysOverdue : null }; }),
}, null, 2) + "\n");
const atRisk = v.attention.priorityFollowUps || [];
process.stdout.write("\nOK — CRM consolidated account view ran (SYNTHETIC). " +
  (atRisk.length ? atRisk.length + " high-value account(s) DUE/OVERDUE for follow-up (suggestion only — outreach stays OWNER_GATED)." : "no high-value account overdue.") + "\n");
process.exit(0);
export {};
