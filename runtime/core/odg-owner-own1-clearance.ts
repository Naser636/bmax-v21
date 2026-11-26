#!/usr/bin/env node
"use strict";
/*
 * OWN-1 OWNER CLEARANCE (OWN-1-CLR-1) — the official, traceable mechanism by which the OWNER authorizes GO to act on ONE
 * register item that OWN-1 flags owner-gated (requiresOwnerAuthorization). OWN-1 itself is untouched: the flag stays
 * true in the register, the ownerReason stays visible, and every other OWN-1 item stays never-auto-selected.
 *
 * A clearance applies to an item iff a COMMITTED record listed in CLEARANCE_RECORDS (fixed, reviewed list) has
 *   schema odg-owner-own1-clearance/1, kind OWNER_OWN1_CLEARANCE, issuer OWNER (…), a date, a non-empty verbatim quote,
 *   and an items[] entry { id, contractSha256, ownerReason, steps } such that
 *     - id === the item id                                   (scope limited to that element — no wildcard)
 *     - contractSha256 === the item's CURRENT contract sha   (any contract change voids the clearance)
 *     - ownerReason === the item's CURRENT OWN-1 ownerReason  (a new, unreviewed OWN-1 trigger voids it)
 *     - steps includes the item's CURRENT scoped step         (only the operations the owner named)
 * A clearance NEVER authorizes by itself: the item still needs its scoped step authorized (owner record + independent
 * inspection bound to the current contract sha). It only lifts the "never auto-selected" exclusion, and is reported.
 * PURE: records are loaded by the caller (GO readState / resume point); no fs, clock or network here.
 */
const SCHEMA = "odg-owner-own1-clearance/1";
const RULE = "OWN-1-CLR-1: an OWN-1-flagged item is GO-actionable only when a committed OWNER_OWN1_CLEARANCE record (fixed list) names its id, its CURRENT contract sha, its CURRENT ownerReason and its CURRENT step, with a verbatim owner quote; the OWN-1 flag is preserved and the scoped step must still be authorized";
const CLEARANCE_RECORDS = Object.freeze(["docs/odg/V19_OWNER_OWN1_CLEARANCE_EXP_B.json"]);

const isObj = (v: any) => v !== null && typeof v === "object" && !Array.isArray(v);
const arr = (v: any) => (Array.isArray(v) ? v : []);

function validRecord(r: any): string | null {
  if (!isObj(r)) return "record unreadable";
  if (r.schema !== SCHEMA) return `schema ${r.schema} ≠ ${SCHEMA}`;
  if (r.kind !== "OWNER_OWN1_CLEARANCE") return "kind ≠ OWNER_OWN1_CLEARANCE";
  if (typeof r.issuer !== "string" || !/^OWNER\b/.test(r.issuer)) return "issuer is not the OWNER";
  if (typeof r.date !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(r.date)) return "date missing";
  if (!arr(r.quote).some((q: any) => typeof q === "string" && q.trim().length > 0)) return "no verbatim owner quote";
  if (!arr(r.items).length) return "no items";
  return null;
}

/* clearanceFor(records, item, current) — current = { contractSha256, step }. Returns { cleared, record?, reason }. */
function clearanceFor(records: any[], item: any, current: any): any {
  if (!isObj(item) || item.requiresOwnerAuthorization !== true) return { cleared: false, applicable: false, reason: "item not OWN-1-flagged (no clearance needed)" };
  const misses: string[] = [];
  for (const r of arr(records)) {
    const bad = validRecord(r);
    if (bad) { misses.push(`${(r && r.recordPath) || "?"}: ${bad}`); continue; }
    const e = arr(r.items).find((x: any) => isObj(x) && x.id === item.id);
    if (!e) continue;
    if (!current || !current.contractSha256 || e.contractSha256 !== current.contractSha256) { misses.push(`${r.recordPath}: contract sha ${String(e.contractSha256).slice(0, 12)} ≠ current ${String(current && current.contractSha256).slice(0, 12)}`); continue; }
    if (e.ownerReason !== item.ownerReason) { misses.push(`${r.recordPath}: ownerReason differs from the current OWN-1 reason`); continue; }
    if (!current.step || !arr(e.steps).includes(current.step)) { misses.push(`${r.recordPath}: step ${current.step} not cleared`); continue; }
    return { cleared: true, applicable: true, rule: RULE, record: r.recordPath || null, date: r.date, quote: arr(r.quote)[0], step: current.step, contractSha256: e.contractSha256,
      reason: `OWN-1 owner clearance ${r.recordPath} (${r.date}) for ${item.id} at contract ${String(e.contractSha256).slice(0, 12)}, step ${current.step}; OWN-1 flag preserved (${item.ownerReason})` };
  }
  return { cleared: false, applicable: true, rule: RULE, reason: misses.length ? `no valid clearance: ${misses.join("; ")}` : `no committed OWN-1 clearance names ${item.id}` };
}

module.exports = { SCHEMA, RULE, CLEARANCE_RECORDS, validRecord, clearanceFor };
export {};
