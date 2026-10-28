#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the fail-closed exposure gate: deny-by-default (all controls must be positively
// true), strict boolean (no truthy coercion), owner-confirmation never inferred, injected-probe READY path, and that
// a LIVE probe of this repo is NOT_READY (token + owner-confirmation absent) even though the artifacts now exist.
"use strict";
const assert = require("assert");
const path = require("path");
const R = require("./dashboard-exposure-readiness.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const allTrue = () => Object.fromEntries(R.REQUIRED_CONTROLS.map((c) => [c, true]));

// (1) deny-by-default: empty facts ⇒ NOT_READY, every control missing.
const empty = R.assessExposureReadiness({});
ok("empty facts ⇒ NOT_READY with ALL controls missing (deny-by-default)", empty.verdict === "NOT_READY" && empty.missing.length === R.REQUIRED_CONTROLS.length);

// (2) all controls positively true ⇒ READY.
ok("all controls true ⇒ READY", R.assessExposureReadiness(allTrue()).verdict === "READY");

// (3) any single missing control ⇒ NOT_READY naming exactly that control.
for (const c of R.REQUIRED_CONTROLS) {
  const facts = allTrue(); delete facts[c];
  const v = R.assessExposureReadiness(facts);
  ok(`missing '${c}' ⇒ NOT_READY (named)`, v.verdict === "NOT_READY" && v.missing.includes(c) && v.missing.length === 1);
}

// (4) STRICT boolean: truthy-but-not-true values do NOT satisfy a control (no coercion ⇒ fail-closed).
const coerced = Object.fromEntries(R.REQUIRED_CONTROLS.map((c) => [c, "true"]));
ok("string 'true' / non-boolean ⇒ NOT satisfied (strict, fail-closed)", R.assessExposureReadiness(coerced).verdict === "NOT_READY" && R.assessExposureReadiness(coerced).missing.length === R.REQUIRED_CONTROLS.length);

// (5) owner confirmation is a REQUIRED control (exposure never inferred without it).
const noOwner = allTrue(); delete noOwner.ownerExposureConfirmed;
ok("without explicit owner confirmation ⇒ NOT_READY", R.assessExposureReadiness(noOwner).verdict === "NOT_READY" && R.assessExposureReadiness(noOwner).missing.includes("ownerExposureConfirmed"));

// (6) injected probe: env + fs. All present + confirmed ⇒ READY; token unset ⇒ NOT_READY; confirm absent ⇒ NOT_READY.
const fsAllPresent = { existsSync: () => true };
const readyEnv = { ODG_DASHBOARD_TOKEN: "x".repeat(20), ODG_DASHBOARD_EXPOSURE_CONFIRMED: "1" };
ok("probe: token+artifacts+confirm ⇒ READY", R.probeExposureReadiness({ env: readyEnv, repoRoot: "/x", fsImpl: fsAllPresent }).verdict === "READY");
ok("probe: token UNSET ⇒ NOT_READY (authTokenConfigured)", R.probeExposureReadiness({ env: { ODG_DASHBOARD_EXPOSURE_CONFIRMED: "1" }, repoRoot: "/x", fsImpl: fsAllPresent }).missing.includes("authTokenConfigured"));
ok("probe: owner-confirm env absent ⇒ NOT_READY (ownerExposureConfirmed)", R.probeExposureReadiness({ env: { ODG_DASHBOARD_TOKEN: "x".repeat(20) }, repoRoot: "/x", fsImpl: fsAllPresent }).missing.includes("ownerExposureConfirmed"));

// (7) LIVE probe of this repo: the deploy artifacts now exist (tls/proxy/access-control/rollback become true) BUT the
// live environment has neither a token nor owner confirmation ⇒ NOT_READY. Exposure stays closed, honestly.
const live = R.probeExposureReadiness({ env: {}, repoRoot: path.join(__dirname, "..", "..") });
ok("live repo probe ⇒ NOT_READY (artifacts present; token + owner-confirm absent)", live.verdict === "NOT_READY" && live.facts.rollbackProcedure === true && live.facts.reverseProxyConfigured === true && live.missing.includes("authTokenConfigured") && live.missing.includes("ownerExposureConfirmed"));

console.log(`\nDASHBOARD-EXPOSURE-READINESS suite — ${pass} assertions passed. (deny-by-default; strict boolean; owner-confirm required; injected + live probe; exposure stays CLOSED)`);
