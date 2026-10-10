#!/usr/bin/env node

/* Opportunity Policy (D4) — classification + traceability test. Proves OBSERVED/CALCULATED/INFERRED/
 * UNKNOWN, PROVEN/CANDIDATE/REJECTED, the full chain, and fail-closed on a non-2xx source. No network:
 * observations are supplied as if produced by the extractor over really-acquired sources. */

"use strict";

const assert = require("assert");
const eu = require("./economic-unit");
const { classify, STATUS, VERDICT } = require("./opportunity-policy");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const qty = (minor, scale) => eu.quantity("USD", eu.KIND.COST_UNIT, minor, scale);
const obs = (url, field, minor) => ({ url, field, status: "OBSERVED", raw: String(minor / 100), quantity: qty(minor, 2), content_hash: "a".repeat(64), fetched_at: "2026-10-05T00:00:00.000Z", http_status: 200, evidence_ref: "runtime/generated/external-research-acquisition.json" });

console.log("Opportunity Policy (D4)");

// PROVEN: 2 OBSERVED fields + a CALCULATED margin (sell - cost) over OBSERVED inputs + an INFERRED note.
{
  const observations = [obs("https://s1", "cost", 3000), obs("https://s2", "sell", 5000)];
  const opp = {
    identity: { name: "Resale X", activity: "buy/resell", market: "marketplace" },
    fields: [{ name: "cost", source_url: "https://s1" }, { name: "sell", source_url: "https://s2" }],
    derived: [{ name: "gross_margin", op: "sub", of: ["sell", "cost"] }],
    inferred: [{ name: "monthly_units", assumption: "10 units/mo (unverified)" }],
    risks: ["demand not observed"], unknowns: ["net margin (fees unknown)"],
  };
  const { results, counts } = classify([opp], observations, { evidence_ref: "EV" });
  const r = results[0];
  ok("PROVEN when >=1 OBSERVED field with provenance", r.verification_status === VERDICT.PROVEN);
  ok("OBSERVED fields carry quantity + provenance (url/date/hash/2xx)", r.observations.every((f) => f.status === STATUS.OBSERVED && f.quantity && f.content_hash && f.http_status === 200 && f.fetched_at));
  ok("CALCULATED margin = sell - cost = 20.00 USD (derived, labeled)", r.calculations[0].status === STATUS.CALCULATED && r.calculations[0].value.minor === 2000 && /not a realized/.test(r.calculations[0].note));
  ok("INFERRED never counts as proof (labeled)", r.inferences[0].status === STATUS.INFERRED && /NOT proof/.test(r.inferences[0].note));
  ok("full chain present: evidence_ref + sources + observations + verification_status", r.evidence_ref === "EV" && r.sources.length === 2 && r.sources[0].url && r.sources[0].date && r.sources[0].content_hash && r.verification_status);
  ok("counts: 1 proven, 2 observed fields, 1 calculated", counts.proven === 1 && counts.observedFields === 2 && counts.calculatedFields === 1);
}

// CANDIDATE: declared but no OBSERVED field (observation UNKNOWN) — kept, not deleted, with reason.
{
  const observations = [{ url: "https://s1", field: "cost", status: "UNKNOWN", reason: "regex no match", http_status: 200, content_hash: "b".repeat(64), fetched_at: "2026-10-05T00:00:00.000Z" }];
  const { results, counts } = classify([{ identity: { name: "Y" }, fields: [{ name: "cost", source_url: "https://s1" }] }], observations, {});
  ok("CANDIDATE when zero OBSERVED field (kept with reason)", results[0].verification_status === VERDICT.CANDIDATE && /insufficient proof/.test(results[0].reason));
  ok("counts: 0 proven, 1 candidate", counts.proven === 0 && counts.candidate === 1);
}

// REJECTED: references a source that was acquired but NOT 2xx (fail-closed).
{
  const observations = [{ url: "https://s1", field: "cost", status: "UNKNOWN", reason: "source not 2xx", http_status: 503, content_hash: "c".repeat(64), fetched_at: "2026-10-05T00:00:00.000Z" }];
  const { results, counts } = classify([{ identity: { name: "Z" }, fields: [{ name: "cost", source_url: "https://s1" }] }], observations, {});
  ok("REJECTED when a referenced source is non-2xx (fail-closed, no fake value)", results[0].verification_status === VERDICT.REJECTED && counts.rejected === 1);
}

// CALCULATED requires OBSERVED inputs: a derived over a missing input ⇒ UNKNOWN (no fabrication).
{
  const observations = [obs("https://s1", "cost", 3000)];
  const { results } = classify([{ identity: { name: "W" }, fields: [{ name: "cost", source_url: "https://s1" }], derived: [{ name: "margin", op: "sub", of: ["sell", "cost"] }] }], observations, {});
  ok("derived over a non-OBSERVED input ⇒ UNKNOWN (requires observed)", results[0].calculations[0].status === STATUS.UNKNOWN && /requires OBSERVED/.test(results[0].calculations[0].reason));
}

console.log(`\nOpportunity Policy — ${passed} assertions passed.`);
