#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the quality-gated research register: fail-closed entry validation (weak sources
// rejected), every entry maps to a P1/P2 requirement + carries a decision, all 9 families covered, no duplicate ids,
// and — anti-fabrication — every `reflectedIn` module actually EXISTS on disk (no invented cross-reference).
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const R = require("./engineering-practices-register.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) the real register validates clean (no weak/incomplete entries, no dup ids).
const v = R.validateRegister();
ok("register validates: all entries complete, no dup ids", v.validCount === v.total && v.invalidCount === 0 && v.dupIds.length === 0 && v.total >= 15);

// (2) fail-closed: a weak source (missing url / mapping / decision) is REJECTED.
ok("entry without url ⇒ invalid", R.validateEntry({ id: "x", family: "benchmarks", title: "t", org: "o", consulted: "2026-10-28", practice: "p", limits: "l", reliability: "HIGH", maps: ["P2:x"], odgDecision: "adopt", odgEvidence: "e", reflectedIn: "reality-gate" }).valid === false);
ok("entry without a P1/P2 mapping ⇒ invalid", R.validateEntry({ id: "x", family: "benchmarks", title: "t", org: "o", url: "https://x.y", consulted: "2026-10-28", practice: "p", limits: "l", reliability: "HIGH", maps: [], odgDecision: "adopt", odgEvidence: "e" }).valid === false);
ok("entry with a bad decision ⇒ invalid", R.validateEntry({ id: "x", family: "benchmarks", title: "t", org: "o", url: "https://x.y", consulted: "2026-10-28", practice: "p", limits: "l", reliability: "HIGH", maps: ["P2:x"], odgDecision: "copy-blindly", odgEvidence: "e" }).valid === false);
ok("entry without limits ⇒ invalid (every source has conditions)", R.validateEntry({ id: "x", family: "benchmarks", title: "t", org: "o", url: "https://x.y", consulted: "2026-10-28", practice: "p", reliability: "HIGH", maps: ["P2:x"], odgDecision: "adopt", odgEvidence: "e", reflectedIn: "reality-gate" }).valid === false);

// (3) coverage: all 9 best-practice families represented.
const s = R.summary();
ok("all 9 families covered", s.familiesCovered.length === R.FAMILIES.length && R.FAMILIES.every((f) => s.familiesCovered.includes(f)));
ok("maps to both P1 and P2 requirements", s.requirementsMapped.some((m) => m.startsWith("P1:")) && s.requirementsMapped.some((m) => m.startsWith("P2:")));

// (4) ANTI-FABRICATION: every reflectedIn module named by an adopt/adapt entry EXISTS on disk.
const core = path.join(__dirname);
const reflected = R.PRACTICES.filter((e) => e.reflectedIn).map((e) => e.reflectedIn);
const missing = reflected.filter((m) => !fs.existsSync(path.join(core, m + ".ts")));
ok(`every reflectedIn module exists on disk (${reflected.length} refs, 0 missing)`, missing.length === 0);

// (5) no decision is a blind copy: decisions are from the allowed vocabulary and most carry a reflectedIn or rationale.
ok("every decision ∈ {adopt,adapt,test,defer,reject}", R.PRACTICES.every((e) => R.DECISIONS.includes(e.odgDecision)));
ok("adopt/adapt entries all name a reflectedIn module", R.PRACTICES.filter((e) => e.odgDecision === "adopt" || e.odgDecision === "adapt").every((e) => typeof e.reflectedIn === "string" && e.reflectedIn.length > 0));

// (6) quality over volume: HIGH-reliability sources dominate (official standards / primary papers).
ok("majority of sources are HIGH reliability (official/primary)", (s.byReliability.HIGH || 0) >= Math.ceil(s.total / 2));

console.log(`\nENGINEERING-PRACTICES-REGISTER suite — ${pass} assertions passed. (${v.total} sources, 9 families; fail-closed quality gate; reflectedIn modules all exist; P1+P2 mapped; quality>volume)`);
