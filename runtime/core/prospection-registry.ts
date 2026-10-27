#!/usr/bin/env node
/**
 * prospection-registry — the SINGLE shared record of outreach attempts across both work streams (mandate V12 §1/§5).
 * FAIL-CLOSED and honest-by-construction: an entry is only ever marked SENT when a provider send-PROOF (message-id) AND
 * a human AUTHORIZATION AND a passing compliance result are all present — a merely prepared message can NEVER be
 * recorded as sent. Dedup prevents the two streams from contacting the same prospect+channel twice; opt-outs block all
 * future contact and future follow-ups. No clock (timestamps are DATA). No message is sent here — this only records.
 */
"use strict";

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function keyOf(prospect: string, channel: string): string { return `${String(prospect).toLowerCase().trim()}::${String(channel).toLowerCase().trim()}`; }

/** newRegistry(): empty shared registry. */
function newRegistry(): any { return { entries: [], optOuts: [] }; }

/**
 * recordAttempt(reg, a): a = { prospect, channel, messageVersion, compliance:{ok,violations}, authorization, at }.
 * Status is DERIVED, never caller-asserted: BLOCKED if not compliant / no authorization; else PREPARED. Never SENT here.
 */
function recordAttempt(reg: any, a: any): any {
  const r = reg && typeof reg === "object" ? reg : newRegistry();
  const prospect = String((a && a.prospect) || "?"), channel = String((a && a.channel) || "?");
  const compliant = !!(a && a.compliance && a.compliance.ok === true);
  const authorized = !!(a && a.authorization && a.authorization.by === "human" && isStr(a.authorization.owner));
  const optedOut = r.optOuts.some((o: string) => o === String(prospect).toLowerCase().trim());
  let status: string;
  if (optedOut) status = "BLOCKED_OPTED_OUT";
  else if (!compliant) status = "BLOCKED_NONCOMPLIANT";
  else if (!authorized) status = "PREPARED_PENDING_AUTH";
  else status = "AUTHORIZED_NOT_SENT";          // authorized + compliant, but NOT sent until a provider proof exists
  const entry = {
    id: (a && a.id) || `${prospect}#${r.entries.length + 1}`, prospect, channel,
    messageVersion: (a && a.messageVersion) || null,
    compliance: (a && a.compliance) || { ok: false }, authorization: authorized ? { by: "human", owner: a.authorization.owner } : null,
    sendStatus: status, sendProof: null, response: null, at: String((a && a.at) || ""),
  };
  r.entries.push(entry);
  return { ok: true, entry, registry: r };
}

/**
 * markSent(reg, id, proof, authorization): sets SENT only with a real provider proof (message-id) + human auth + the
 * entry already compliant. No proof ⇒ refused (cannot claim sent). Returns {ok, reason?}.
 */
function markSent(reg: any, id: string, proof: any, authorization: any): any {
  const e = (reg.entries || []).find((x: any) => x.id === id);
  if (!e) return { ok: false, reason: "NOT_FOUND" };
  if (!e.compliance || e.compliance.ok !== true) return { ok: false, reason: "NOT_COMPLIANT" };
  if (!(authorization && authorization.by === "human" && isStr(authorization.owner))) return { ok: false, reason: "NO_AUTHORIZATION" };
  if (!(proof && isStr(proof.messageId))) return { ok: false, reason: "NO_PROVIDER_PROOF — cannot record as sent without a provider message-id" };
  e.sendStatus = "SENT"; e.sendProof = { messageId: String(proof.messageId) }; e.authorization = { by: "human", owner: authorization.owner };
  return { ok: true, entry: e };
}

/** isDuplicate(reg, prospect, channel): true if a non-blocked attempt already exists for this prospect+channel. */
function isDuplicate(reg: any, prospect: string, channel: string): boolean {
  const k = keyOf(prospect, channel);
  return (reg.entries || []).some((e: any) => keyOf(e.prospect, e.channel) === k && !String(e.sendStatus).startsWith("BLOCKED"));
}

/** optOut(reg, prospect): records an opt-out; blocks all future contact + follow-ups for that prospect. */
function optOut(reg: any, prospect: string): any { const p = String(prospect).toLowerCase().trim(); if (!reg.optOuts.includes(p)) reg.optOuts.push(p); return reg; }

/** canContact(reg, prospect, channel): false if opted out or already sent on that channel. */
function canContact(reg: any, prospect: string, channel: string): boolean {
  const p = String(prospect).toLowerCase().trim();
  if ((reg.optOuts || []).includes(p)) return false;
  return !(reg.entries || []).some((e: any) => keyOf(e.prospect, e.channel) === keyOf(prospect, channel) && e.sendStatus === "SENT");
}

/** summary(reg): honest counts (nothing marked sent without proof). */
function summary(reg: any): any {
  const c: Record<string, number> = {};
  for (const e of reg.entries || []) c[e.sendStatus] = (c[e.sendStatus] || 0) + 1;
  return { total: (reg.entries || []).length, byStatus: c, optOuts: (reg.optOuts || []).length, sent: c.SENT || 0 };
}

export { newRegistry, recordAttempt, markSent, isDuplicate, optOut, canContact, summary };
module.exports = { newRegistry, recordAttempt, markSent, isDuplicate, optOut, canContact, summary };
