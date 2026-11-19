#!/usr/bin/env node
"use strict";
/*
 * CRM CONSOLIDATED ACCOUNT VIEW (D14 "not consolidated") — composes the CRM triad into ONE per-account view.
 * PURE, deterministic, fail-closed. MODIFIES NOTHING it composes.
 *
 *  - odg-crm-segmentation.segmentClients : descriptive segments per client (value/categorical/recency)
 *  - odg-crm-followup.followUpStatus      : follow-up status per client (OK/DUE/OVERDUE/NEVER_CONTACTED)
 *
 * Neither alone answers the account-management question "which of my VALUABLE clients am I about to lose touch with?".
 * This joins segment + follow-up + interaction count per account and adds that factual cross-reference. Like the
 * segmentation engine, the only "judgment" (which segments count as priority) is CALLER-supplied — the view invents
 * none: `priorityFollowUps` = accounts whose value segment ∈ the caller's prioritySegments AND whose follow-up is DUE or
 * OVERDUE. No prioritySegments ⇒ no priority list is fabricated.
 *
 * Honesty: it invents nothing — segments come from the segmentation engine, follow-up from the follow-up engine, both
 * on caller-supplied observables; a client with no interactions is NEVER_CONTACTED (not overdue). It performs NO send
 * (outreach stays OWNER_GATED via the existing send path). No clock (asOfDay is a caller day-index ⇒ deterministic).
 */

const SEG = require("./odg-crm-segmentation.js");
const FU = require("./odg-crm-followup.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isPosInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * accountView(clients, opts) -> frozen consolidated per-account view.
 * opts = { interactions, segmentationPolicy, asOfDay, cadenceDays, prioritySegments? }.
 * Fail-closed: no clients ⇒ NO_CLIENTS; bad asOfDay/cadenceDays ⇒ typed error; a sub-engine refusal (bad policy) is
 * surfaced verbatim. Each account joins its segments + follow-up + interaction count (all by client id).
 */
function accountView(clients: any, opts: any): any {
  const list = Array.isArray(clients) ? clients.filter(isObj) : [];
  if (!list.length) return freeze({ ok: false, code: "NO_CLIENTS" });
  const o = isObj(opts) ? opts : {};
  if (!isNonNegInt(o.asOfDay)) return freeze({ ok: false, code: "BAD_ASOF_DAY", detail: "asOfDay must be a non-negative integer day-index" });
  if (!isPosInt(o.cadenceDays)) return freeze({ ok: false, code: "BAD_CADENCE", detail: "cadenceDays must be a positive integer" });
  const ids = list.map((c: any) => (isStr(c.id) ? c.id : null));
  if (ids.some((id: any) => id === null)) return freeze({ ok: false, code: "BAD_CLIENT_ID", detail: "every client needs a string id" });

  // segmentation (descriptive) — surface its refusal verbatim
  const seg = SEG.segmentClients(list, o.segmentationPolicy, { asOfDay: o.asOfDay });
  if (seg.ok !== true) return freeze({ ok: false, code: "SEGMENTATION_REFUSED", segmentation: seg });
  const segById = new Map<string, any>(); for (const s of seg.clients) segById.set(s.id, s.segments);

  // follow-up status — include every client (so no-interaction clients appear as NEVER_CONTACTED, not omitted)
  const interactions = Array.isArray(o.interactions) ? o.interactions : (isObj(o.interactions) && Array.isArray(o.interactions.interactions) ? o.interactions.interactions : []);
  const fu = FU.followUpStatus(interactions, { asOfDay: o.asOfDay, cadenceDays: o.cadenceDays, clientIds: ids });
  if (fu.ok !== true) return freeze({ ok: false, code: "FOLLOWUP_REFUSED", followUp: fu });
  const fuById = new Map<string, any>(); for (const r of fu.clients) fuById.set(r.clientId, r);
  const interCount = new Map<string, number>(); for (const it of interactions) if (isObj(it) && isStr(it.clientId)) interCount.set(it.clientId, (interCount.get(it.clientId) || 0) + 1);

  const accounts = list.map((c: any) => { const id = c.id; const f = fuById.get(id) || {};
    return freeze({ id, segments: segById.get(id) || freeze({}),
      followUp: freeze({ status: f.status || "NEVER_CONTACTED", lastContactDay: f.lastContactDay ?? null, dueDay: f.dueDay ?? null, daysOverdue: f.daysOverdue ?? null }),
      interactionCount: interCount.get(id) || 0 });
  });

  // factual cross-reference — priority segments are CALLER-supplied (no invented judgment)
  const prioritySegments = Array.isArray(o.prioritySegments) ? o.prioritySegments.filter(isStr) : null;
  let priorityFollowUps: any = null;
  if (prioritySegments && prioritySegments.length) {
    const prio = new Set<string>(prioritySegments);
    priorityFollowUps = accounts
      .filter((a: any) => prio.has(a.segments.value) && (a.followUp.status === "OVERDUE" || a.followUp.status === "DUE"))
      .slice().sort((a: any, b: any) => (b.followUp.daysOverdue || 0) - (a.followUp.daysOverdue || 0) || (a.id < b.id ? -1 : 1))
      .map((a: any) => a.id);
  }

  return freeze({ ok: true, asOfDay: o.asOfDay, cadenceDays: o.cadenceDays, accounts: freeze(accounts),
    attention: freeze({ prioritySegments: prioritySegments ? freeze(prioritySegments) : null,
      priorityFollowUps: priorityFollowUps ? freeze(priorityFollowUps) : null,
      note: prioritySegments ? "accounts in a CALLER-declared priority value-segment that are DUE/OVERDUE — a factual intersection, not an invented ranking" : "no prioritySegments supplied ⇒ no priority list fabricated" }),
    rollups: freeze({ segments: seg.rollups, followUp: freeze(fu.clients.reduce((m: any, r: any) => { m[r.status] = (m[r.status] || 0) + 1; return m; }, {})) }),
    note: "consolidated account view: segmentation (descriptive) + follow-up (status) + interaction count, joined by id; composes both engines and modifies neither; invents nothing; performs NO send (outreach OWNER_GATED); no clock.",
  });
}

const CRM_ACCOUNT_VIEW_CONTRACT = Object.freeze({
  id: "CRM-ACCOUNT-VIEW",
  purpose: "D14 consolidation: join odg-crm-segmentation + odg-crm-followup + interaction count into one per-account view, adding the caller-gated priority×overdue cross-reference",
  reuses: Object.freeze(["odg-crm-segmentation.segmentClients", "odg-crm-followup.followUpStatus"]),
  invariants: Object.freeze([
    "composes BOTH CRM engines and MODIFIES NEITHER (no duplication, no new segmentation/cadence logic)",
    "invents nothing: segments and follow-up come from the engines on caller-supplied observables; a no-interaction client is NEVER_CONTACTED (not overdue)",
    "priorityFollowUps uses CALLER-supplied prioritySegments — a factual intersection, never an invented ranking; absent ⇒ no priority list",
    "performs NO send — outreach stays OWNER_GATED via the existing send path",
    "fail-closed: no clients / bad asOfDay|cadence / bad client id ⇒ typed error; a sub-engine refusal is surfaced verbatim",
    "no clock (asOfDay is a caller day-index ⇒ deterministic); PURE/frozen; no network/randomness",
  ]),
});

module.exports = { accountView, CRM_ACCOUNT_VIEW_CONTRACT };
export {};
