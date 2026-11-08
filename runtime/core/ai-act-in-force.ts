#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 21 (P10 regulatory — world-research gap) — EU AI-ACT OBLIGATION IN-FORCE TRACKER. PURE, deterministic. World
 * reference: the EU AI Act (Reg (EU) 2024/1689) staged application, as amended by the Digital Omnibus — Reg (EU)
 * 2026/1744 (in force 27 Jul 2026): GPAI obligations applied 2 Aug 2025 (pre-existing GPAI models have until 2 Aug
 * 2027), Art.50 transparency + general application 2 Aug 2026, stand-alone high-risk (Annex III) DEFERRED to 2 Dec
 * 2027, embedded high-risk (Annex I) to 2 Aug 2028. ODG's `ai-act-role-classifier` deliberately carries NO dates and
 * defers them to a "STANDARDS_OBLIGATIONS_REGISTER" that was referenced but never implemented. This is that consumer:
 * it REUSES classifyRole to get the roles/obligations, then maps each against a CALLER-SUPPLIED register of staged
 * dates (dates are DATA, never hardcoded — so a contested/amended date like the Omnibus 2 Dec 2027 shift stays data)
 * and an injected `asOf` (ISO date string, no live clock). Fail-closed: a register-silent obligation is UNKNOWN_DATE,
 * NEVER asserted in-force. No new engine, no network, no clock. Dual export.
 */

const AIACT = require("./ai-act-role-classifier");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isIso(v: any): boolean { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v); }

const STATUS = Object.freeze(["IN_FORCE", "NOT_YET_IN_FORCE", "UNKNOWN_DATE"]);

/** assessInForce({activities, asOf, register}) -> { roles, obligations:[{family,status,applicableFrom,source}], summary }.
 * register: { <family-or-obligation>: { applicableFrom: ISO, amendingRegulation?, access? } }. Dates are DATA. */
function assessInForce(input: any): any {
  const o = isObj(input) ? input : {};
  const asOf = o.asOf;
  const register = isObj(o.register) ? o.register : {};
  const cls = AIACT.classifyRole(isObj(o.activities) ? o.activities : {});

  // collect obligation keys from the classifier: obligation families + Art.50 obligations.
  const keys: string[] = [];
  for (const ob of (Array.isArray(cls.obligations) ? cls.obligations : [])) if (ob && typeof ob.family === "string") keys.push(ob.family);
  for (const a of (Array.isArray(cls.art50) ? cls.art50 : [])) if (typeof a === "string") keys.push(a);
  const uniqueKeys = Array.from(new Set(keys));

  const rows: any[] = [];
  const asOfOk = isIso(asOf);
  for (const k of uniqueKeys) {
    const entry = isObj(register[k]) ? register[k] : null;
    const from = entry && isIso(entry.applicableFrom) ? entry.applicableFrom : null;
    let status: string;
    if (from === null || !asOfOk) status = "UNKNOWN_DATE";              // register silent / bad asOf ⇒ fail-closed, never "in force"
    else status = asOf >= from ? "IN_FORCE" : "NOT_YET_IN_FORCE";       // ISO YYYY-MM-DD compares chronologically
    rows.push(Object.freeze({ obligation: k, status, applicableFrom: from, amendingRegulation: entry && entry.amendingRegulation || null, access: entry && entry.access || null }));
  }

  const summary = { total: rows.length, inForce: rows.filter((r) => r.status === "IN_FORCE").length, notYet: rows.filter((r) => r.status === "NOT_YET_IN_FORCE").length, unknownDate: rows.filter((r) => r.status === "UNKNOWN_DATE").length };
  return Object.freeze({
    roles: cls.roles, declaredNotVerified: true, asOf: asOfOk ? asOf : null,
    obligations: Object.freeze(rows), summary: Object.freeze(summary),
    note: "obligations classified by role (declared-not-verified); in-force status from the INJECTED register dates vs asOf; a register-silent obligation is UNKNOWN_DATE, never asserted in-force (fail-closed). NOT legal advice; NOT a certification.",
  });
}

const AI_ACT_IN_FORCE_CONTRACT = Object.freeze({
  id: "V124-AI-ACT-IN-FORCE",
  source: "SÉRIE 21 P10 — EU AI-Act obligation in-force tracker (Reg 2024/1689 as amended by Digital Omnibus Reg 2026/1744)",
  statuses: STATUS,
  reuses: Object.freeze(["ai-act-role-classifier.classifyRole (roles + obligation families + Art.50)"]),
  notAuthority: "a date-vs-register in-force mapper; NOT legal advice, NOT a certification; dates are caller-supplied data",
  invariants: Object.freeze([
    "obligations come from classifyRole (deny-by-default); dates come from a CALLER-SUPPLIED register — never hardcoded",
    "asOf is an injected ISO date string (no live clock); ISO YYYY-MM-DD compares chronologically",
    "fail-closed: a register-silent obligation or a bad asOf ⇒ UNKNOWN_DATE, NEVER asserted IN_FORCE",
    "reuses the role classifier; no second classifier; no network/clock; declared-not-verified + not-legal-advice honesty preserved",
  ]),
});

module.exports = { assessInForce, AI_ACT_IN_FORCE_CONTRACT };

if (require.main === module) {
  const demo = assessInForce({
    activities: { developsOrPlacesAiSystemUnderOwnName: true, systemInteractsWithHumans: true },
    asOf: "2026-11-08",
    register: { "Art.50(1): inform persons they are interacting with an AI system": { applicableFrom: "2026-08-02", amendingRegulation: "Reg (EU) 2026/1744" } },
  });
  process.stdout.write(JSON.stringify({ ...AI_ACT_IN_FORCE_CONTRACT, demo }, null, 2) + "\n");
}

export {};
