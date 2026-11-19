#!/usr/bin/env node
"use strict";
/*
 * V319 Addendum §6.4 — BRAND PROFILE governance (closes the PARTIAL from the §2 reconciliation). PURE, deterministic,
 * fail-closed. A reusable brand profile that EVERY campaign/content asset is validated against before it is admissible
 * for publishing. COMPOSES odg-marketing-engine.claimAudit (unproven-claim detection) — it does NOT reimplement it —
 * and adds the layer the engine lacked:
 *   - approvedClaims  : an allowlist of claims the brand has PRE-CLEARED (e.g. with legal) — a flagged claim survives
 *                       only if evidenced (claimAudit) OR pre-approved here;
 *   - forbiddenClaims : a denylist that HARD-BLOCKS regardless of evidence (never say it);
 *   - requiredDisclaimers : all must be present in the text, else blocked.
 * Publish is ALWAYS owner-gated: `publishable:true` means "admissible for owner review", never auto-published.
 * No network/clock/randomness; builds no parallel marketing engine.
 */
const ENGINE = require("./odg-marketing-engine.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function strList(v: any): string[] { return Array.isArray(v) ? v.filter(isStr) : []; }
function freeze(o: any): any { return Object.freeze(o); }
function has(haystack: string, needle: string): boolean { return haystack.toLowerCase().includes(needle.toLowerCase()); }

/** defineProfile(input) -> { ok, profile } | { ok:false, code }. */
function defineProfile(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.brandId)) return freeze({ ok: false, code: "NO_BRAND_ID" });
  if (!isStr(i.locale)) return freeze({ ok: false, code: "NO_LOCALE" });
  return freeze({ ok: true, profile: freeze({
    brandId: i.brandId, locale: i.locale,
    approvedClaims: freeze(strList(i.approvedClaims)),
    forbiddenClaims: freeze(strList(i.forbiddenClaims)),
    requiredDisclaimers: freeze(strList(i.requiredDisclaimers)),
    tone: isStr(i.tone) ? i.tone : null,
  }) });
}

/**
 * validateContent(profile, content) -> frozen verdict. content = { text, evidenceRefs? }.
 * publishable ONLY when: no forbidden claim present AND all required disclaimers present AND every flagged claim is
 * either evidenced (claimAudit) or in approvedClaims. Always requiresOwnerApproval (publish is owner-gated).
 */
function validateContent(profile: any, content: any): any {
  const p = isObj(profile) ? profile : {};
  if (!isStr(p.brandId) || !Array.isArray(p.forbiddenClaims)) return freeze({ ok: false, code: "BAD_PROFILE" });
  const c = isObj(content) ? content : {};
  const text = isStr(c.text) ? c.text : "";
  if (!text) return freeze({ ok: false, code: "NO_TEXT" });

  // 1) forbidden claims — hard block regardless of evidence
  const forbiddenHits = p.forbiddenClaims.filter((f: string) => has(text, f));
  // 2) required disclaimers — all must be present
  const missingDisclaimers = (p.requiredDisclaimers || []).filter((d: string) => !has(text, d));
  // 3) unproven claims via the engine; survive only if pre-approved in the allowlist
  const audit = ENGINE.claimAudit(text, c.evidenceRefs);
  const approved = (p.approvedClaims || []);
  const unapprovedUnproven = audit.unproven.filter((u: string) => !approved.some((a: string) => has(a, u) || has(u, a)));

  const blockers: string[] = [];
  if (forbiddenHits.length) blockers.push(`forbidden claim(s): ${forbiddenHits.join(", ")}`);
  if (missingDisclaimers.length) blockers.push(`missing disclaimer(s): ${missingDisclaimers.length}`);
  if (unapprovedUnproven.length) blockers.push(`unproven+unapproved claim(s): ${unapprovedUnproven.join(", ")}`);

  const publishable = blockers.length === 0;
  return freeze({
    ok: true, brandId: p.brandId, locale: p.locale,
    forbiddenHits: freeze(forbiddenHits), missingDisclaimers: freeze(missingDisclaimers),
    unapprovedUnproven: freeze(unapprovedUnproven), claimAudit: audit,
    publishable, blockers: freeze(blockers),
    requiresOwnerApproval: true,
    verdict: publishable ? "ADMISSIBLE_FOR_OWNER_REVIEW" : "BLOCKED",
    note: publishable
      ? "passes brand governance — ADMISSIBLE for owner review; publishing itself remains OWNER_GATED (never auto-published)"
      : "blocked by brand governance — resolve every blocker (remove forbidden claims, add disclaimers, evidence or pre-approve claims)",
  });
}

const BRAND_PROFILE_CONTRACT = Object.freeze({
  id: "V319-ADDENDUM-BRAND-PROFILE",
  purpose: "§6.4 — reusable brand profile every campaign validates against: approved-allowlist + forbidden-denylist + required disclaimers, over the engine's claim audit",
  reuses: Object.freeze(["odg-marketing-engine.claimAudit (unproven-claim detection)"]),
  invariants: Object.freeze([
    "COMPOSES claimAudit — does not reimplement claim detection",
    "forbidden claims HARD-BLOCK regardless of evidence; required disclaimers must all be present",
    "a flagged claim survives only if evidenced (claimAudit) OR in the pre-approved allowlist — never by omission",
    "publish is ALWAYS owner-gated: publishable==ADMISSIBLE_FOR_OWNER_REVIEW, never auto-published",
    "PURE + deterministic; fail-closed on bad profile / empty text; no network/clock/randomness; no parallel engine",
  ]),
});

module.exports = { defineProfile, validateContent, BRAND_PROFILE_CONTRACT };
export {};
