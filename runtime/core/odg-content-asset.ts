#!/usr/bin/env node
"use strict";
/*
 * V319 Addendum §6.7 — CONTENT ASSET LIFECYCLE (closes the PARTIAL). PURE, deterministic, fail-closed. A content asset
 * (article/guide/case-study/video/landing/email/social...) carries audience/objective/channel/CTA + its text, and is
 * governed through the §6.4 brand profile BEFORE it can be published. COMPOSES odg-brand-profile.validateContent — no
 * reimplementation of claim governance. Lifecycle: DRAFT → (brand-validated) ADMISSIBLE → (owner) PUBLISHED. Publishing
 * is ALWAYS owner-gated (never auto). Performance is DESCRIPTIVE and caller-supplied — never fabricated. No net/clock/rng.
 */
const BRAND = require("./odg-brand-profile.js");

const KINDS = Object.freeze(["article", "guide", "case-study", "video", "landing-page", "email", "social", "comparison", "sales-deck"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function isNonNegInt(v: any): boolean { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function freeze(o: any): any { return Object.freeze(o); }

/**
 * createAsset(input) -> { ok, asset } | { ok:false, code }.
 * input = { assetId, kind, audience, objective, channel, cta, text, brandProfile, evidenceRefs? }
 * Runs the brand governance; status = BLOCKED (not admissible) | DRAFT_ADMISSIBLE (admissible, awaiting owner publish).
 */
function createAsset(input: any): any {
  const i = isObj(input) ? input : {};
  if (!isStr(i.assetId)) return freeze({ ok: false, code: "NO_ASSET_ID" });
  if (!KINDS.includes(i.kind)) return freeze({ ok: false, code: "BAD_KIND", detail: `kind must be one of ${KINDS.join("|")}` });
  for (const f of ["audience", "objective", "channel", "cta", "text"]) if (!isStr(i[f])) return freeze({ ok: false, code: "MISSING_FIELD", field: f });
  if (!isObj(i.brandProfile) || !isStr(i.brandProfile.brandId)) return freeze({ ok: false, code: "NO_BRAND_PROFILE" });

  const governance = BRAND.validateContent(i.brandProfile, { text: i.text, evidenceRefs: i.evidenceRefs });
  if (!governance.ok) return freeze({ ok: false, code: "GOVERNANCE_ERROR", detail: governance.code });
  const admissible = governance.publishable === true;
  return freeze({ ok: true, asset: freeze({
    assetId: i.assetId, kind: i.kind, audience: i.audience, objective: i.objective, channel: i.channel, cta: i.cta,
    brandId: i.brandProfile.brandId, locale: i.brandProfile.locale || null,
    governance, status: admissible ? "DRAFT_ADMISSIBLE" : "BLOCKED",
    requiresOwnerApproval: true, publication: null, performance: null,
    note: admissible ? "brand-validated DRAFT — admissible for owner review; publishing is OWNER_GATED" : "BLOCKED by brand governance — not publishable until every blocker is resolved",
  }) });
}

/** requestPublish(asset, auth) -> { ok, asset } | { ok:false, code }. OWNER_GATED; only an ADMISSIBLE asset; never auto. */
function requestPublish(asset: any, auth: any): any {
  const a = isObj(asset) ? asset : {};
  if (!isStr(a.assetId) || !isStr(a.status)) return freeze({ ok: false, code: "BAD_ASSET" });
  if (a.status === "PUBLISHED") return freeze({ ok: false, code: "ALREADY_PUBLISHED" });
  if (a.status !== "DRAFT_ADMISSIBLE") return freeze({ ok: false, code: "NOT_ADMISSIBLE", detail: "only a brand-validated admissible draft can be published" });
  const o = isObj(auth) ? auth : {};
  if (o.ownerAuthorized !== true || !isStr(o.owner)) return freeze({ ok: false, code: "OWNER_GATED", detail: "publishing requires explicit owner authorization (ownerAuthorized:true + owner); never auto-published" });
  return freeze({ ok: true, asset: freeze({ ...a, status: "PUBLISHED", publication: freeze({ owner: o.owner, channel: a.channel, note: isStr(o.note) ? o.note : null }) }) });
}

/** recordPerformance(asset, metrics) -> { ok, asset }. DESCRIPTIVE, caller-supplied; only on a PUBLISHED asset; no fabrication. */
function recordPerformance(asset: any, metrics: any): any {
  const a = isObj(asset) ? asset : {};
  if (!isStr(a.assetId)) return freeze({ ok: false, code: "BAD_ASSET" });
  if (a.status !== "PUBLISHED") return freeze({ ok: false, code: "NOT_PUBLISHED", detail: "performance is recorded only after publication" });
  const m = isObj(metrics) ? metrics : {};
  const fields = ["impressions", "clicks", "conversions"];
  const perf: Record<string, number> = {};
  for (const f of fields) { if (m[f] !== undefined) { if (!isNonNegInt(m[f])) return freeze({ ok: false, code: "BAD_METRIC", field: f }); perf[f] = m[f]; } }
  if (!Object.keys(perf).length) return freeze({ ok: false, code: "NO_METRICS" });
  return freeze({ ok: true, asset: freeze({ ...a, performance: freeze({ ...perf, source: isStr(m.source) ? m.source : "caller-supplied", basis: "DESCRIPTIVE_OBSERVED (not a causal/performance guarantee)" }) }) });
}

const CONTENT_ASSET_CONTRACT = Object.freeze({
  id: "V319-ADDENDUM-CONTENT-ASSET",
  purpose: "§6.7 — content asset lifecycle (audience/objective/channel/CTA + brand-validated text) with owner-gated publish and descriptive performance",
  reuses: Object.freeze(["odg-brand-profile.validateContent (§6.4 claim governance)"]),
  invariants: Object.freeze([
    "every asset is brand-validated at creation via odg-brand-profile; a BLOCKED asset is never admissible",
    "lifecycle DRAFT_ADMISSIBLE → PUBLISHED; publishing is ALWAYS owner-gated (ownerAuthorized + owner), never auto",
    "only an ADMISSIBLE draft can be published; no double-publish; a BLOCKED asset cannot be published",
    "performance is DESCRIPTIVE + caller-supplied on a PUBLISHED asset only — never fabricated, never a causal claim",
    "required fields enforced (assetId/kind/audience/objective/channel/cta/text/brandProfile); PURE/deterministic; no net/clock/rng",
  ]),
});

module.exports = { KINDS, createAsset, requestPublish, recordPerformance, CONTENT_ASSET_CONTRACT };
export {};
