#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves structural levers change the net factor: SASU (IS on profit) + productization
// (low delivery) beat micro-direct; stacking commission+subcontract lowers net; levies shown per mode; requiredGross
// inverts; ranking by net factor; rates are explicit per-profile (not the blind micro factor); reproducible. TARGET only.
"use strict";
const assert = require("assert");
const E = require("./economic-profiles.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const cmp = E.compareProfiles(500000);
const by = (id) => cmp.rows.find(r => r.id === id);

// (1) five profiles compared + ranked by net factor.
ok("profiles compared + ranked by net factor", cmp.rows.length === 5 && cmp.rankedByNetFactor.length === 5 && cmp.best);
// (2) productized (low marginal delivery, SASU) has the HIGHEST net factor.
ok("productized (E) best net factor", cmp.best.id === "E-productized" && by("E-productized").netFactor > by("A-micro-direct").netFactor);
// (3) SASU direct beats micro direct (no 25.6% social on turnover).
ok("SASU direct (C) net factor > micro direct (A)", by("C-sasu-direct").netFactor > by("A-micro-direct").netFactor);
// (4) partner (25% commission) worse than SASU direct (stacked channel cost).
ok("partner (D) net factor < SASU direct (C)", by("D-partner").netFactor < by("C-sasu-direct").netFactor);
// (5) better factor ⇒ LOWER required gross for €500k net.
ok("higher net factor ⇒ lower required gross", by("E-productized").requiredGrossForTarget < by("A-micro-direct").requiredGrossForTarget);
// (6) micro levies on turnover; SASU IS on profit (mode distinct).
const micro = E.netForProfile(1000000, E.PROFILES.find(p => p.id === "A-micro-direct"));
const sasu = E.netForProfile(1000000, E.PROFILES.find(p => p.id === "C-sasu-direct"));
ok("micro ⇒ social>0, IS 0; SASU ⇒ IS>0, social 0", micro.levies.social > 0 && micro.levies.corporateTax === 0 && sasu.levies.corporateTax > 0 && sasu.levies.social === 0);
// (7) requiredGrossForNet inverts.
const req = E.requiredGrossForNet(500000, E.PROFILES.find(p => p.id === "C-sasu-direct"));
ok("requiredGrossForNet inverts to ~€500k net", req.achievable && Math.abs(E.netForProfile(req.requiredGrossCashed, E.PROFILES.find(p => p.id === "C-sasu-direct")).netAvailable - 500000) < 1500);
// (8) honest notes + reproducible.
ok("notes: per-structure recompute + TARGET + expert-comptable; reproducible", cmp.notes.some(n => /NOT applied blindly/.test(n)) && cmp.notes.some(n => /expert-comptable/.test(n)) && JSON.stringify(E.compareProfiles(500000)) === JSON.stringify(cmp));

console.log(`\nECONOMIC-PROFILES suite — ${pass} assertions passed. (structural levers; net factor per structure; TARGET)`);
