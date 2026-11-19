#!/usr/bin/env node
"use strict";
/* V319 Addendum §6.4 — tests for odg-brand-profile (approved allowlist / forbidden denylist / disclaimers over claimAudit). PURE. */
const B = require("./odg-brand-profile.js");
let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const DISC = "Devis non contractuel";
function prof(extra?: any): any {
  return B.defineProfile(Object.assign({ brandId: "acme", locale: "fr-FR", approvedClaims: ["best"], forbiddenClaims: ["guarantee"], requiredDisclaimers: [DISC] }, extra || {})).profile;
}

function main(): void {
  check("defineProfile ok", !!prof() && prof().brandId === "acme" && prof().forbiddenClaims.includes("guarantee"));
  check("defineProfile fail-closed: no brandId", B.defineProfile({ locale: "fr-FR" }).code === "NO_BRAND_ID");
  check("defineProfile fail-closed: no locale", B.defineProfile({ brandId: "x" }).code === "NO_LOCALE");

  // 1) pre-approved claim ("best") + disclaimer present + no forbidden ⇒ ADMISSIBLE
  const okApproved = B.validateContent(prof(), { text: `We are the best. ${DISC}` });
  check("pre-approved claim survives ⇒ publishable ADMISSIBLE_FOR_OWNER_REVIEW", okApproved.publishable === true && okApproved.verdict === "ADMISSIBLE_FOR_OWNER_REVIEW" && okApproved.unapprovedUnproven.length === 0);

  // 2) forbidden claim ("guarantee") ⇒ HARD BLOCK regardless
  const forb = B.validateContent(prof(), { text: `We guarantee results. ${DISC}` });
  check("forbidden claim ⇒ BLOCKED (hard, regardless of evidence)", forb.publishable === false && forb.forbiddenHits.includes("guarantee") && forb.verdict === "BLOCKED");
  const forbEvi = B.validateContent(prof(), { text: `We guarantee results. ${DISC}`, evidenceRefs: { guarantee: "ref" } });
  check("forbidden claim stays BLOCKED even if 'evidenced'", forbEvi.publishable === false && forbEvi.forbiddenHits.includes("guarantee"));

  // 3) flagged + NOT approved + NOT evidenced ⇒ BLOCKED
  const unapproved = B.validateContent(prof(), { text: `We are the fastest. ${DISC}` });
  check("unproven+unapproved claim ('fastest') ⇒ BLOCKED", unapproved.publishable === false && unapproved.unapprovedUnproven.includes("fastest"));

  // 4) same flagged claim but EVIDENCED ⇒ passes
  const evidenced = B.validateContent(prof(), { text: `We are the fastest. ${DISC}`, evidenceRefs: { fastest: "benchmark-2026" } });
  check("evidenced claim ('fastest') ⇒ publishable", evidenced.publishable === true && evidenced.unapprovedUnproven.length === 0);

  // 5) missing required disclaimer ⇒ BLOCKED (even with clean claims)
  const noDisc = B.validateContent(prof(), { text: "A reliable service for your project." });
  check("missing disclaimer ⇒ BLOCKED", noDisc.publishable === false && noDisc.missingDisclaimers.includes(DISC));

  // 6) clean text + disclaimer ⇒ ADMISSIBLE, but still requires owner approval
  const clean = B.validateContent(prof(), { text: `A reliable service for your project. ${DISC}` });
  check("clean content ⇒ ADMISSIBLE + requiresOwnerApproval true (never auto-publish)", clean.publishable === true && clean.requiresOwnerApproval === true);
  check("requiresOwnerApproval ALWAYS true (even when BLOCKED)", forb.requiresOwnerApproval === true && clean.requiresOwnerApproval === true);

  // 7) composes claimAudit (not reimplemented): the engine's audit object is attached
  check("claimAudit composed (engine audit attached)", !!clean.claimAudit && typeof clean.claimAudit.clean === "boolean");

  // 8) fail-closed inputs
  check("empty text ⇒ NO_TEXT", B.validateContent(prof(), { text: "" }).code === "NO_TEXT");
  check("bad profile ⇒ BAD_PROFILE", B.validateContent({}, { text: "x" }).code === "BAD_PROFILE");

  // 9) multiple blockers accumulate
  const multi = B.validateContent(prof(), { text: "We guarantee the fastest results." });
  check("multiple blockers accumulate (forbidden + unapproved + missing disclaimer)", multi.publishable === false && multi.blockers.length >= 3);

  // 10) determinism + frozen
  const again = B.validateContent(prof(), { text: `We are the best. ${DISC}` });
  check("deterministic", again.publishable === okApproved.publishable && again.verdict === okApproved.verdict);
  check("frozen outputs", Object.isFrozen(okApproved) && Object.isFrozen(okApproved.blockers));

  check("contract: composes claimAudit, forbidden hard-block, owner-gated publish", B.BRAND_PROFILE_CONTRACT.invariants.some((s: string) => /COMPOSES claimAudit/.test(s)) && B.BRAND_PROFILE_CONTRACT.invariants.some((s: string) => /owner-gated/.test(s)));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — odg-brand-profile (§6.4: approved-allowlist + forbidden-denylist + required-disclaimers over claimAudit; forbidden hard-blocks; unproven survives only if evidenced OR pre-approved; publish ALWAYS owner-gated; deterministic, composes the engine)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
