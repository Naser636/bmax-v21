#!/usr/bin/env node
"use strict";
/* V319 Addendum §6.7 — tests for odg-content-asset (brand-validated lifecycle, owner-gated publish, descriptive performance). PURE. */
const C = require("./odg-content-asset.js");
const BRAND = require("./odg-brand-profile.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const DISC = "Devis non contractuel";
const profile = BRAND.defineProfile({ brandId: "acme", locale: "fr-FR", approvedClaims: ["best"], forbiddenClaims: ["guarantee"], requiredDisclaimers: [DISC] }).profile;
function base(extra?: any): any {
  return Object.assign({ assetId: "A1", kind: "article", audience: "maçons", objective: "awareness", channel: "seo", cta: "Demandez un devis", brandProfile: profile, text: `Service fiable. ${DISC}` }, extra || {});
}

function main(): void {
  // create — clean content ⇒ DRAFT_ADMISSIBLE
  const ok = C.createAsset(base());
  check("clean brand-validated asset ⇒ DRAFT_ADMISSIBLE", ok.ok && ok.asset.status === "DRAFT_ADMISSIBLE" && ok.asset.requiresOwnerApproval === true);
  // create — forbidden claim ⇒ BLOCKED (not admissible)
  const blocked = C.createAsset(base({ text: `We guarantee results. ${DISC}` }));
  check("asset with forbidden claim ⇒ BLOCKED (governance)", blocked.ok && blocked.asset.status === "BLOCKED" && blocked.asset.governance.publishable === false);
  // create — missing disclaimer ⇒ BLOCKED
  check("missing disclaimer ⇒ BLOCKED", C.createAsset(base({ text: "Service fiable." })).asset.status === "BLOCKED");

  // field + input guards
  check("no assetId ⇒ NO_ASSET_ID", C.createAsset(base({ assetId: "" })).code === "NO_ASSET_ID");
  check("bad kind ⇒ BAD_KIND", C.createAsset(base({ kind: "meme" })).code === "BAD_KIND");
  check("missing field (channel) ⇒ MISSING_FIELD", C.createAsset(base({ channel: "" })).code === "MISSING_FIELD");
  check("no brand profile ⇒ NO_BRAND_PROFILE", C.createAsset(base({ brandProfile: null })).code === "NO_BRAND_PROFILE");

  // publish — owner-gated
  check("publish without owner auth ⇒ OWNER_GATED", C.requestPublish(ok.asset, {}).code === "OWNER_GATED");
  check("publish truthy-not-true owner ⇒ OWNER_GATED", C.requestPublish(ok.asset, { ownerAuthorized: 1, owner: "x" }).code === "OWNER_GATED");
  check("publish a BLOCKED asset ⇒ NOT_ADMISSIBLE", C.requestPublish(blocked.asset, { ownerAuthorized: true, owner: "akabi" }).code === "NOT_ADMISSIBLE");
  const pub = C.requestPublish(ok.asset, { ownerAuthorized: true, owner: "akabi", note: "campagne SEO Q4" });
  check("owner-authorized publish ⇒ PUBLISHED with publication record", pub.ok && pub.asset.status === "PUBLISHED" && pub.asset.publication.owner === "akabi");
  check("double publish ⇒ ALREADY_PUBLISHED", C.requestPublish(pub.asset, { ownerAuthorized: true, owner: "akabi" }).code === "ALREADY_PUBLISHED");

  // defense-in-depth: a FORGED asset (status admissible but governance.publishable false) cannot publish
  const forged = { assetId: "F", status: "DRAFT_ADMISSIBLE", channel: "seo", governance: { publishable: false } };
  check("forged status (governance.publishable false) ⇒ NOT_ADMISSIBLE (status not trusted)", C.requestPublish(forged, { ownerAuthorized: true, owner: "akabi" }).code === "NOT_ADMISSIBLE");

  // performance — descriptive, published-only, no fabrication
  check("performance on unpublished ⇒ NOT_PUBLISHED", C.recordPerformance(ok.asset, { impressions: 10 }).code === "NOT_PUBLISHED");
  check("bad metric (negative) ⇒ BAD_METRIC", C.recordPerformance(pub.asset, { clicks: -5 }).code === "BAD_METRIC");
  check("no metrics ⇒ NO_METRICS", C.recordPerformance(pub.asset, {}).code === "NO_METRICS");
  const perf = C.recordPerformance(pub.asset, { impressions: 1000, clicks: 40, conversions: 3, source: "GA4-export" });
  check("valid performance ⇒ recorded DESCRIPTIVE (not a guarantee)", perf.ok && perf.asset.performance.clicks === 40 && /DESCRIPTIVE/.test(perf.asset.performance.basis));

  // determinism + frozen
  check("deterministic", C.createAsset(base()).asset.status === ok.asset.status);
  check("frozen", Object.isFrozen(ok.asset) && Object.isFrozen(pub.asset.publication));

  check("contract: brand-validated, owner-gated publish, descriptive performance, composes brand-profile", C.CONTENT_ASSET_CONTRACT.invariants.some((s: string) => /owner-gated/.test(s)) && C.CONTENT_ASSET_CONTRACT.invariants.some((s: string) => /DESCRIPTIVE/.test(s)) && C.CONTENT_ASSET_CONTRACT.reuses.length === 1);

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-content-asset (§6.7: brand-validated lifecycle DRAFT_ADMISSIBLE→PUBLISHED; publish ALWAYS owner-gated; BLOCKED assets never publishable; performance DESCRIPTIVE/published-only/no-fabrication; composes brand-profile)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
