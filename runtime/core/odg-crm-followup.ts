#!/usr/bin/env node
"use strict";
/*
 * CRM CONTACT-INTERACTION HISTORY + FOLLOW-UP CADENCE (D14: "full CRM — history, follow-up — not consolidated").
 * PURE, deterministic, append-only, fail-closed.
 *
 * THE GAP (reconciled): commercial-pipeline/client-intake carry STAGE/STATUS-transition histories; odg-prospect-
 * qualification scores prospects; commercial-portfolio projects. NONE records dated CONTACT INTERACTIONS (calls, emails,
 * meetings, site visits) per client, and nothing computes follow-up/relance due-status from them. This adds exactly that
 * — and NOTHING it does sends anything: a follow-up is a SUGGESTION to contact; any actual outreach stays OWNER_GATED
 * via the existing send path (prospection-send-gate / client-intake.sendEmail). This engine performs NO send.
 *
 * Honesty:
 *  - history is APPEND-ONLY: it never rewrites, deletes, or reorders a recorded interaction;
 *  - an interaction needs clientId + kind + day — never fabricated; a bad one is REJECTED (not coerced);
 *  - a client with NO interactions is NEVER_CONTACTED, not "overdue" (no invented last-contact date);
 *  - no clock: asOfDay / day are caller-supplied integer day-indices ⇒ deterministic. No network/randomness.
 */

const KINDS = Object.freeze(["CALL", "EMAIL", "MEETING", "SITE_VISIT", "QUOTE_SENT", "MESSAGE", "NOTE"]);
const DIRECTIONS = Object.freeze(["INBOUND", "OUTBOUND"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function isPosInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v > 0; }
function freeze(o: any): any { return Object.freeze(o); }

function normalise(raw: any, seq: number): any {
  const e = isObj(raw) ? raw : {};
  if (!isStr(e.clientId)) return { ok: false, reason: "clientId missing" };
  if (!KINDS.includes(e.kind)) return { ok: false, reason: `kind must be one of ${KINDS.join("|")}` };
  if (!isNonNegInt(e.day)) return { ok: false, reason: "day missing/not a non-negative integer" };
  if (e.direction !== undefined && !DIRECTIONS.includes(e.direction)) return { ok: false, reason: "direction must be INBOUND|OUTBOUND" };
  return { ok: true, value: freeze({ id: isStr(e.id) ? e.id : "i" + seq, clientId: e.clientId, kind: e.kind, day: e.day,
    direction: DIRECTIONS.includes(e.direction) ? e.direction : null, note: isStr(e.note) ? e.note : null }) };
}

/** buildLog(interactions) -> { ok, interactions[], rejected[] }. Validates+freezes; a malformed entry is REJECTED (with a reason), never coerced. Empty is a valid (empty) log. */
function buildLog(interactions: any): any {
  const list = Array.isArray(interactions) ? interactions : [];
  const accepted: any[] = []; const rejected: any[] = [];
  list.forEach((raw: any, idx: number) => { const n = normalise(raw, idx); if (n.ok) accepted.push(n.value); else rejected.push(freeze({ index: idx, reason: n.reason })); });
  return freeze({ ok: true, interactions: freeze(accepted), rejected: freeze(rejected) });
}

/** appendInteraction(log, interaction) -> { ok, interactions[] } (new frozen array, append-only) | { ok:false, code }. */
function appendInteraction(log: any, interaction: any): any {
  const base = Array.isArray(log) ? log : (isObj(log) && Array.isArray(log.interactions) ? log.interactions : []);
  const n = normalise(interaction, base.length);
  if (!n.ok) return freeze({ ok: false, code: "INVALID_INTERACTION", detail: n.reason });
  return freeze({ ok: true, interactions: freeze([...base, n.value]) }); // append-only: base is never mutated
}

function entries(log: any): any[] { return Array.isArray(log) ? log : (isObj(log) && Array.isArray(log.interactions) ? log.interactions : []); }

/** history(log, clientId) -> that client's interactions, chronological (day then id). Read-only. */
function history(log: any, clientId: any): any {
  if (!isStr(clientId)) return freeze({ ok: false, code: "NO_CLIENT_ID" });
  const hits = entries(log).filter((e: any) => e.clientId === clientId).slice().sort((a: any, b: any) => a.day - b.day || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return freeze({ ok: true, clientId, interactions: freeze(hits), count: hits.length });
}

/**
 * followUpStatus(log, opts) -> per-client follow-up status. opts = { asOfDay, cadenceDays, clientIds? }.
 * lastContactDay = latest interaction day (any kind); dueDay = lastContactDay + cadenceDays.
 * status: OVERDUE (asOfDay>dueDay) | DUE (asOfDay===dueDay) | OK (asOfDay<dueDay) | NEVER_CONTACTED (no interactions).
 * clientIds (optional) expands the universe so a listed client with no interactions is reported NEVER_CONTACTED (not invented overdue).
 */
function followUpStatus(log: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  if (!isNonNegInt(o.asOfDay)) return freeze({ ok: false, code: "BAD_ASOF_DAY", detail: "asOfDay must be a non-negative integer day-index" });
  if (!isPosInt(o.cadenceDays)) return freeze({ ok: false, code: "BAD_CADENCE", detail: "cadenceDays must be a positive integer" });
  const all = entries(log);
  const lastByClient = new Map<string, number>();
  for (const e of all) { const cur = lastByClient.get(e.clientId); if (cur === undefined || e.day > cur) lastByClient.set(e.clientId, e.day); }
  const universe = new Set<string>([...lastByClient.keys()]);
  if (Array.isArray(o.clientIds)) for (const c of o.clientIds.filter(isStr)) universe.add(c);
  const rows = [...universe].sort().map((clientId: string) => {
    const last = lastByClient.get(clientId);
    if (last === undefined) return freeze({ clientId, lastContactDay: null, dueDay: null, status: "NEVER_CONTACTED", daysOverdue: null, daysUntilDue: null });
    const dueDay = last + o.cadenceDays;
    const status = o.asOfDay > dueDay ? "OVERDUE" : o.asOfDay === dueDay ? "DUE" : "OK";
    return freeze({ clientId, lastContactDay: last, dueDay, status,
      daysOverdue: status === "OVERDUE" ? o.asOfDay - dueDay : 0, daysUntilDue: status === "OK" ? dueDay - o.asOfDay : 0 });
  });
  return freeze({ ok: true, asOfDay: o.asOfDay, cadenceDays: o.cadenceDays, clients: freeze(rows),
    note: "lastContactDay = latest interaction (any kind); a follow-up is a SUGGESTION to contact — this engine performs NO send (outreach stays OWNER_GATED via the existing send path). NEVER_CONTACTED ≠ overdue (no invented date)." });
}

/** dueList(log, opts) -> only clients needing action (DUE or OVERDUE), most-overdue first. NEVER_CONTACTED is listed separately (needs a first contact, not a relance). */
function dueList(log: any, opts: any): any {
  const s = followUpStatus(log, opts);
  if (s.ok !== true) return s;
  const due = s.clients.filter((c: any) => c.status === "DUE" || c.status === "OVERDUE").slice().sort((a: any, b: any) => b.daysOverdue - a.daysOverdue || (a.clientId < b.clientId ? -1 : 1));
  const neverContacted = s.clients.filter((c: any) => c.status === "NEVER_CONTACTED").map((c: any) => c.clientId);
  return freeze({ ok: true, asOfDay: s.asOfDay, cadenceDays: s.cadenceDays, due: freeze(due), neverContacted: freeze(neverContacted),
    note: "DUE/OVERDUE = relance suggestions (no auto-send); NEVER_CONTACTED listed separately (needs a first contact, not a follow-up)" });
}

const CRM_FOLLOWUP_CONTRACT = Object.freeze({
  id: "CRM-FOLLOWUP",
  purpose: "D14 CRM history+follow-up: append-only contact-interaction log + follow-up/relance cadence (who is due) — NOT in pipeline/intake/qualification",
  reuses: Object.freeze(["prospection-send-gate / client-intake.sendEmail are the owner-gated OUTREACH path — this engine only computes who is due; it performs NO send", "integer day-index convention (no clock)"]),
  invariants: Object.freeze([
    "history is APPEND-ONLY — never rewrites/deletes/reorders a recorded interaction",
    "an interaction needs clientId + kind + day — never fabricated; a malformed one is REJECTED, not coerced",
    "a client with NO interactions is NEVER_CONTACTED, not 'overdue' — no invented last-contact date",
    "a follow-up is a SUGGESTION to contact; this engine performs NO send — outreach stays OWNER_GATED via the existing send path",
    "no clock: asOfDay/day are caller-supplied integer day-indices ⇒ deterministic; PURE; no network/randomness",
  ]),
});

module.exports = { KINDS, DIRECTIONS, buildLog, appendInteraction, history, followUpStatus, dueList, CRM_FOLLOWUP_CONTRACT };
export {};
