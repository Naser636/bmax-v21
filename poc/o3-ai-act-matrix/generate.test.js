#!/usr/bin/env node
"use strict";
/* O3 PoC test — deterministic generation, evidence linkage, missing-evidence handling, fail-closed. */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { generate } = require("./generate.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed++; }

const reqDoc = JSON.parse(fs.readFileSync(path.join(__dirname, "requirements.json"), "utf8"));

// 1 — deterministic: two runs byte-identical.
const a = JSON.stringify(generate(reqDoc));
const b = JSON.stringify(generate(reqDoc));
ok("deterministic (two runs byte-identical)", a === b);

const m = generate(reqDoc);
// 2 — every requirement produces a row with a valid status (no fabricated PASS).
const VALID = ["VERIFIED", "PARTIAL", "GAP", "BLOCKED", "NOT_ASSESSED"];
ok("row per requirement", m.rows.length === reqDoc.requirements.length);
ok("all statuses valid vocab", m.rows.every((r) => VALID.includes(r.status)));

// 3 — evidence linkage: PARTIAL rows cite REAL repo files that exist.
const REPO = path.resolve(__dirname, "..", "..");
const partial = m.rows.filter((r) => r.status === "PARTIAL");
ok("PARTIAL rows cite existing repo evidence", partial.length > 0 && partial.every((r) => r.repoEvidence.length > 0 && r.repoEvidence.every((f) => fs.existsSync(path.join(REPO, f)))));

// 4 — missing-evidence handling: R-DATA is GAP, R-CONF is BLOCKED (external body), no repo evidence invented.
ok("R-DATA → GAP (no invented evidence)", m.rows.find((r) => r.id === "R-DATA").status === "GAP");
ok("R-CONF → BLOCKED (certification = external body, not ODG)", m.rows.find((r) => r.id === "R-CONF").status === "BLOCKED");

// 5 — no row claims VERIFIED (honest: ODG tech = readiness, never full compliance from this matrix).
ok("no VERIFIED claimed (readiness ≠ compliance)", !m.rows.some((r) => r.status === "VERIFIED"));

// 6 — every row carries sourceVerification (clause text to be verified against official sources).
ok("every row carries sourceVerification", m.rows.every((r) => typeof r.sourceVerification === "string" && r.sourceVerification.length > 0));

// 7 — fail-closed on malformed input.
let threw = false;
try { generate({ bad: true }); } catch { threw = true; }
ok("malformed requirements ⇒ throws (fail-closed, no partial matrix)", threw);

// 8 — disclaimer present (not legal advice / not certifier).
ok("disclaimer present (readiness-only, not certifier)", /NOT.*certif/i.test(m.disclaimer));

console.log(`\nO3 matrix PoC — ${passed} assertions passed.`);
