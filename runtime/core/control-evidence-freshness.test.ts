#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves operational-evidence freshness is deny-by-default: within-TTL ⇒ FRESH,
// past-TTL ⇒ STALE (with overdue), missing/unparseable/future-dated ⇒ never fresh, and FRESH≠SATISFIED. Clock
// is caller-supplied so results are deterministic.
"use strict";
const assert = require("assert");
const CF = require("./control-evidence-freshness.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };
const NOW = "2026-10-27T00:00:00Z";

// (1) isFresh pure helper.
ok("isFresh: within TTL ⇒ true", CF.isFresh("2026-06-01T00:00:00Z", NOW, 365) === true);
ok("isFresh: past TTL ⇒ false", CF.isFresh("2024-01-01T00:00:00Z", NOW, 365) === false);
ok("isFresh: future-dated ⇒ false (deny-by-default)", CF.isFresh("2027-01-01T00:00:00Z", NOW, 365) === false);
ok("isFresh: unparseable ⇒ false", CF.isFresh("not-a-date", NOW, 365) === false);

// (2) assessFreshness classifies a mixed set.
const controls = [
  { ref: "A.8.9", operationalEvidenceAt: "2026-09-01T00:00:00Z" },   // ~56d ago ⇒ FRESH
  { ref: "A.5.1", operationalEvidenceAt: "2024-01-01T00:00:00Z" },   // >365d ⇒ STALE
  { ref: "A.8.16" },                                                 // no evidence ⇒ NO_EVIDENCE
  { ref: "A.5.7", operationalEvidenceAt: "bogus" },                  // INVALID_DATE
  { ref: "A.8.2", operationalEvidenceAt: "2027-05-01T00:00:00Z" },   // future ⇒ FUTURE_DATED (invalid)
];
const r = CF.assessFreshness(controls, { now: NOW, ttlDays: 365 });
ok("assess ok + summary counts", r.ok && r.summary.total === 5 && r.summary.fresh === 1 && r.summary.stale === 1 && r.summary.noEvidence === 1 && r.summary.invalid === 2);

// (3) STALE row carries overdueDays.
const staleRow = r.rows.find(x => x.ref === "A.5.1");
ok("STALE row has ageDays + overdueDays", staleRow.status === "STALE" && staleRow.ageDays > 365 && staleRow.overdueDays > 0);

// (4) FRESH row within TTL.
const freshRow = r.rows.find(x => x.ref === "A.8.9");
ok("FRESH row within TTL", freshRow.status === "FRESH" && freshRow.ageDays >= 0 && freshRow.ageDays <= 365);

// (5) object-map input form.
const rMap = CF.assessFreshness({ "A.8.9": { operationalEvidenceAt: "2026-10-01T00:00:00Z" } }, { now: NOW });
ok("object-map input supported", rMap.ok && rMap.summary.fresh === 1 && rMap.rows[0].ref === "A.8.9");

// (6) TTL boundary: exactly TTL days old ⇒ still FRESH; one day past ⇒ STALE.
ok("boundary: exactly TTL ⇒ FRESH", CF.assessFreshness([{ ref: "x", operationalEvidenceAt: "2025-10-27T00:00:00Z" }], { now: NOW, ttlDays: 365 }).summary.fresh === 1);
ok("boundary: TTL+1 ⇒ STALE", CF.assessFreshness([{ ref: "x", operationalEvidenceAt: "2025-10-26T00:00:00Z" }], { now: NOW, ttlDays: 365 }).summary.stale === 1);

// (7) honesty note: FRESH ≠ SATISFIED.
ok("note: FRESH ≠ SATISFIED", /FRESH.*NOT.*SATISFIED|mechanism.?satisfied/i.test(r.note));

// (8) fail-closed input.
ok("fail-closed: missing/invalid now ⇒ INVALID_INPUT", CF.assessFreshness([], {}).code === "INVALID_INPUT" && CF.assessFreshness([], { now: "nope" }).code === "INVALID_INPUT");
ok("fail-closed: non-array/non-object controls ⇒ INVALID_INPUT", CF.assessFreshness(42, { now: NOW }).code === "INVALID_INPUT");

// (9) deterministic.
ok("reproducible", JSON.stringify(CF.assessFreshness(controls, { now: NOW })) === JSON.stringify(CF.assessFreshness(controls, { now: NOW })));

console.log(`\nCONTROL-EVIDENCE-FRESHNESS suite — ${pass} assertions passed. (TTL freshness: FRESH/STALE/NO_EVIDENCE/invalid, deny-by-default, FRESH≠SATISFIED)`);
