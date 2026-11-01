#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Reproducible benchmark for license-policy: POSITIVE / NEGATIVE / AMBIGUOUS
// cases + the deny-by-default (fail-closed) invariant + a regression that the capability reproduces ODG's
// earlier AD-HOC flux-schnell/flux-dev license finding (now systematic). Pure, deterministic, €0, no network.
"use strict";
const assert = require("assert");
const { classifyLicense, adoptionVerdict } = require("./license-policy.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// --- POSITIVE: permissive ⇒ commercial + proprietary redistribution OK ---
for (const id of ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC"]) {
  const v = classifyLicense(id);
  ok(`permissive ${id} ⇒ commercialUseOk + proprietaryRedistribution`, v.family === "permissive" && v.commercialUseOk === true && v.proprietaryRedistribution === true);
}
ok("public-domain CC0 ⇒ no obligations", classifyLicense("CC0-1.0").family === "public-domain" && classifyLicense("CC0-1.0").proprietaryRedistribution === true);

// --- NEGATIVE: copyleft constrains proprietary redistribution; NC blocks commercial ---
const gpl = classifyLicense("GPL-3.0-only");
ok("GPL-3.0 ⇒ strong copyleft: commercial use OK but NOT proprietary redistribution", gpl.family === "strong-copyleft" && gpl.commercialUseOk === true && gpl.proprietaryRedistribution === false);
const agpl = classifyLicense("AGPL-3.0-only");
ok("AGPL ⇒ network copyleft (SaaS disclosure)", agpl.family === "network-copyleft" && agpl.proprietaryRedistribution === false);
const nc = classifyLicense("CC-BY-NC-4.0");
ok("CC-BY-NC ⇒ non-commercial: commercialUseOk false", nc.family === "non-commercial" && nc.commercialUseOk === false);

// --- WEAK copyleft ⇒ conditional (needs human review, not an auto-yes) ---
const lgpl = classifyLicense("LGPL-3.0-only");
ok("LGPL ⇒ weak copyleft, proprietaryRedistribution conditional", lgpl.family === "weak-copyleft" && lgpl.proprietaryRedistribution === "conditional");

// --- AMBIGUOUS / UNKNOWN ⇒ FAIL-CLOSED (never assume commercial safety) ---
const unk = classifyLicense("Foobar-9.9");
ok("unknown SPDX id ⇒ known=false, commercialUseOk=null (fail-closed)", unk.known === false && unk.commercialUseOk === null && unk.proprietaryRedistribution === null);
ok("empty/missing ⇒ fail-closed null", classifyLicense("").commercialUseOk === null && classifyLicense(null).commercialUseOk === null);
const rar = classifyLicense("All Rights Reserved");
ok("free-text 'All Rights Reserved' ⇒ proprietary/NC, not commercial-safe", rar.commercialUseOk === false || rar.commercialUseOk === null);

// --- adoptionVerdict: target-aware qualification (deny-by-default on unknown) ---
ok("adopt MIT for commercial-closed ⇒ true", adoptionVerdict("MIT", { target: "commercial-closed" }).adoptable === true);
ok("adopt GPL-3.0 for commercial-closed ⇒ false", adoptionVerdict("GPL-3.0-only", { target: "commercial-closed" }).adoptable === false);
ok("adopt AGPL for commercial-saas ⇒ false", adoptionVerdict("AGPL-3.0-only", { target: "commercial-saas" }).adoptable === false);
ok("adopt LGPL for commercial-closed ⇒ null (conditional, needs review)", adoptionVerdict("LGPL-3.0-only", { target: "commercial-closed" }).adoptable === null);
ok("adopt unknown ⇒ null (fail-closed, do not adopt)", adoptionVerdict("Foobar-9.9").adoptable === null);
ok("adopt non-commercial for commercial ⇒ false", adoptionVerdict("CC-BY-NC-4.0", { target: "commercial-closed" }).adoptable === false);

// --- REGRESSION (V3 independent-validation finding): BARE/DEPRECATED SPDX copyleft forms must NOT
//     under-classify to UNKNOWN. bare GPL/LGPL/AGPL ⇒ their copyleft family (fail-closed, the safe direction). ---
for (const id of ["GPL-2.0", "GPL-3.0"]) {
  const c = classifyLicense(id);
  ok(`bare ${id} ⇒ strong-copyleft (not UNKNOWN)`, c.family === "strong-copyleft" && c.known === true && c.proprietaryRedistribution === false);
  ok(`adopt bare ${id} for commercial-closed ⇒ false (blocks CI gate)`, adoptionVerdict(id, { target: "commercial-closed" }).adoptable === false);
}
const agplBare = classifyLicense("AGPL-3.0");
ok("bare AGPL-3.0 ⇒ network-copyleft (not UNKNOWN)", agplBare.family === "network-copyleft" && agplBare.known === true);
ok("adopt bare AGPL-3.0 for commercial-saas ⇒ false", adoptionVerdict("AGPL-3.0", { target: "commercial-saas" }).adoptable === false);
const lgplBare = classifyLicense("LGPL-3.0");
ok("bare LGPL-3.0 ⇒ weak-copyleft conditional (not UNKNOWN)", lgplBare.family === "weak-copyleft" && lgplBare.proprietaryRedistribution === "conditional");
// SSPL-1.0 — source-available restrictive, NOT OSI-approved; must not under-classify to UNKNOWN.
const sspl = classifyLicense("SSPL-1.0");
ok("SSPL-1.0 ⇒ source-available restrictive: osiApproved false, not proprietary-redistributable", sspl.known === true && sspl.osiApproved === false && sspl.proprietaryRedistribution === false);
ok("adopt SSPL-1.0 for commercial-closed ⇒ false", adoptionVerdict("SSPL-1.0", { target: "commercial-closed" }).adoptable === false);
ok("adopt SSPL-1.0 for commercial-saas ⇒ false (service disclosure)", adoptionVerdict("SSPL-1.0", { target: "commercial-saas" }).adoptable === false);

// --- REGRESSION: reproduces ODG's earlier ad-hoc flux finding, now systematic ---
ok("flux-schnell Apache-2.0 ⇒ commercial-shippable (matches prior manual rule)", adoptionVerdict("Apache-2.0", { target: "commercial-closed" }).adoptable === true);
ok("flux-dev FLUX.1-dev (non-commercial) ⇒ NOT commercial-shippable (matches prior manual rule)", classifyLicense("FLUX.1-dev").commercialUseOk === false && adoptionVerdict("FLUX.1-dev", { target: "commercial-closed" }).adoptable === false);

console.log(`\nLICENSE-POLICY benchmark — ${pass} assertions passed.`);
