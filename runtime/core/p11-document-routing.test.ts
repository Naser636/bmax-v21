#!/usr/bin/env node
"use strict";
const assert = require("assert");
const R = require("./p11-document-routing");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 22 — P11 DOCUMENT CONFIDENCE ROUTING");

// clean document ⇒ STRAIGHT_THROUGH.
check(R.routeDocument({ extraction: { status: "TEXT_EXTRACTED" }, parser: { ok: true }, validation: { valid: true, findings: [] } }).tier === "STRAIGHT_THROUGH", "clean (ok+valid+full+0 findings) ⇒ STRAIGHT_THROUGH");

// HIGH finding ⇒ REJECT.
check(R.routeDocument({ extraction: { status: "TEXT_EXTRACTED" }, parser: { ok: true }, validation: { valid: false, findings: [{ severity: "HIGH" }] } }).tier === "REJECT", "a HIGH finding ⇒ REJECT");

// parser failed ⇒ REJECT.
check(R.routeDocument({ extraction: { status: "TEXT_EXTRACTED" }, parser: { ok: false, code: "UNSUPPORTED_PROFILE" }, validation: { valid: false, findings: [] } }).tier === "REJECT", "parser failure ⇒ REJECT");

// encrypted/corrupt extraction ⇒ REJECT.
check(R.routeDocument({ extraction: { status: "ENCRYPTED" }, parser: { ok: true }, validation: { valid: true, findings: [] } }).tier === "REJECT", "unrecoverable extraction (ENCRYPTED) ⇒ REJECT");

// MEDIUM finding (no HIGH) ⇒ HUMAN_REVIEW.
check(R.routeDocument({ extraction: { status: "TEXT_EXTRACTED" }, parser: { ok: true }, validation: { valid: true, findings: [{ severity: "MEDIUM" }] } }).tier === "HUMAN_REVIEW", "a MEDIUM finding ⇒ HUMAN_REVIEW");

// partial extraction ⇒ HUMAN_REVIEW (not auto-STP).
check(R.routeDocument({ extraction: { status: "PARTIAL" }, parser: { ok: true }, validation: { valid: true, findings: [] } }).tier === "HUMAN_REVIEW", "partial extraction ⇒ HUMAN_REVIEW");

// capped extraction ⇒ HUMAN_REVIEW.
check(R.routeDocument({ extraction: { status: "TEXT_EXTRACTED", capped: true }, parser: { ok: true }, validation: { valid: true, findings: [] } }).tier === "HUMAN_REVIEW", "capped extraction ⇒ HUMAN_REVIEW");

// ADVERSARIAL: empty/missing input ⇒ fail-closed, NEVER STRAIGHT_THROUGH.
check(R.routeDocument({}).tier !== "STRAIGHT_THROUGH", "empty input ⇒ not STRAIGHT_THROUGH (fail-closed)");
check(R.routeDocument(null).tier !== "STRAIGHT_THROUGH", "null input ⇒ not STRAIGHT_THROUGH (fail-closed)");
// ADVERSARIAL: a document missing validation confirmation must not auto-STP even if parser ok.
check(R.routeDocument({ extraction: { status: "TEXT_EXTRACTED" }, parser: { ok: true }, validation: {} }).tier === "HUMAN_REVIEW", "unconfirmed validation ⇒ HUMAN_REVIEW (never auto-STP on uncertainty)");

check(R.P11_DOCUMENT_ROUTING_CONTRACT.invariants.some((i: any) => /NEVER auto-STP/.test(i)), "contract: fail-closed never auto-STP on ambiguity");

console.log(failures === 0 ? "ALL PASS — SÉRIE 22 P11 DOCUMENT ROUTING" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
