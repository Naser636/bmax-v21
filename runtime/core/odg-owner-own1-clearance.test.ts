#!/usr/bin/env node
// @ts-nocheck — runtime/core test convention: runs under tsx.
"use strict";
/* OWN-1-CLR-1 — owner clearance of ONE OWN-1-flagged item: exact id + current contract sha + current ownerReason + current
 * step, verbatim quote, OWNER issuer; OWN-1 flag preserved; any drift voids it; non-flagged items untouched. */
const assert = require("assert");
const fs = require("fs"), path = require("path");
const CLR = require("./odg-owner-own1-clearance.js");
let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }
console.log("odg-owner-own1-clearance — OWN-1-CLR-1");
const item = { id: "X", requiresOwnerAuthorization: true, ownerReason: "OWN-1 matched [governance] in objective/acceptance_criteria/missingForPass" };
const rec = { recordPath: "docs/odg/R.json", schema: CLR.SCHEMA, kind: "OWNER_OWN1_CLEARANCE", issuer: "OWNER (CTO)", date: "2026-11-26", quote: ["V19-EXP-B est autorisé"], items: [{ id: "X", contractSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ownerReason: item.ownerReason, steps: ["RUN_CONTROLLED_EXPERIMENTS"] }] };
const cur = { contractSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", step: "RUN_CONTROLLED_EXPERIMENTS" };
ok("exact match ⇒ cleared, record + rule reported", (() => { const r = CLR.clearanceFor([rec], item, cur); return r.cleared === true && r.record === "docs/odg/R.json" && /OWN-1 flag preserved/.test(r.reason); })());
ok("contract changed ⇒ NOT cleared", CLR.clearanceFor([rec], item, { ...cur, contractSha256: "bb" }).cleared === false);
ok("new OWN-1 reason ⇒ NOT cleared", CLR.clearanceFor([rec], { ...item, ownerReason: "OWN-1 matched [deploy] in objective" }, cur).cleared === false);
ok("step not named ⇒ NOT cleared", CLR.clearanceFor([rec], item, { ...cur, step: "REVISE_CONTRACT" }).cleared === false);
ok("other item id ⇒ NOT cleared (no wildcard)", CLR.clearanceFor([rec], { ...item, id: "Y" }, cur).cleared === false);
ok("non-OWNER issuer ⇒ NOT cleared", CLR.clearanceFor([{ ...rec, issuer: "PROVIDER (Claude Code)" }], item, cur).cleared === false);
ok("empty quote ⇒ NOT cleared", CLR.clearanceFor([{ ...rec, quote: [""] }], item, cur).cleared === false);
ok("wrong schema / kind ⇒ NOT cleared", CLR.clearanceFor([{ ...rec, schema: "x" }], item, cur).cleared === false && CLR.clearanceFor([{ ...rec, kind: "OWNER_ORDER_DECISION" }], item, cur).cleared === false);
ok("entry without ownerReason never clears an item without one (inspector hardening)", CLR.clearanceFor([{ ...rec, items: [{ ...rec.items[0], ownerReason: undefined }] }], { ...item, ownerReason: undefined }, cur).cleared === false);
ok("no records ⇒ NOT cleared", CLR.clearanceFor([], item, cur).cleared === false);
ok("non-flagged item ⇒ not applicable (nothing to clear)", CLR.clearanceFor([rec], { id: "X", requiresOwnerAuthorization: false }, cur).applicable === false);
// committed record (real): names exactly V19-EXP-B and its current contract sha
{
  const ROOT = path.resolve(__dirname, "..", "..");
  const AS = require("./odg-authorization-scope.js");
  const real = CLR.CLEARANCE_RECORDS.map((rel) => ({ ...JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")), recordPath: rel }));
  const C = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V160_AP_WORK_ITEM_CONTRACTS.json"), "utf8")).contracts;
  const R = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/odg/evidence/V164_STRATEGIC_REGISTER.json"), "utf8")).register;
  ok("committed records valid and scoped to V19-EXP-B only", real.every((r) => CLR.validRecord(r) === null) && real.flatMap((r) => r.items.map((x) => x.id)).join() === "V19-EXP-B");
  const it = R.items.find((x) => x.id === "V19-EXP-B");
  ok("register keeps the OWN-1 flag on V19-EXP-B (preserved)", it.requiresOwnerAuthorization === true);
  const sha = AS.contractSha256(C.find((c) => c.scenario === "V19-EXP-B"));
  ok("committed clearance is bound to the CURRENT V19-EXP-B contract sha (or its result is already recorded)", real[0].items[0].contractSha256 === sha);
  ok("every other OWN-1 item stays uncleared", R.items.filter((x) => x.requiresOwnerAuthorization === true && x.id !== "V19-EXP-B").every((x) => !CLR.clearanceFor(real, x, { contractSha256: "any", step: "RUN_CONTROLLED_EXPERIMENTS" }).cleared));
}
console.log(`\nodg-owner-own1-clearance — ${passed} assertions passed.`);
