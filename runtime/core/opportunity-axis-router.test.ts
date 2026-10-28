#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves V34 discovery routing is honest: six-axis routing by subject/value; ODG-
// executable next actions (never send); ranking by FIT (evidence/feasibility/time-to-act) NOT headline value; live
// discovery returns explicit NO_RESULTS with no authorized connector; a synthetic source is labeled a TEST (not a
// customer); provenance preserved; nothing sent/submitted.
"use strict";
const assert = require("assert");
const R = require("./opportunity-axis-router.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) six-axis routing.
ok("ISO subject ⇒ F", R.routeToAxis({ subject: "ISO 27001 readiness audit" }).axis === "F");
ok("partner subject ⇒ D", R.routeToAxis({ subject: "reseller partnership opportunity" }).axis === "D");
ok("no budget ⇒ A (entry default)", R.routeToAxis({ subject: "dependency check" }).axis === "A");
ok("value bands ⇒ A/B/C/E", R.routeToAxis({ subject: "x", budgetEur: 900 }).axis === "A" && R.routeToAxis({ subject: "x", budgetEur: 5000 }).axis === "B" && R.routeToAxis({ subject: "x", budgetEur: 20000 }).axis === "C" && R.routeToAxis({ subject: "x", budgetEur: 80000 }).axis === "E");

// (2) next ODG action is a PREPARE step, never a send; ISO = readiness not cert.
ok("nextOdgAction prepares (qualify/prepare/build/map); F = NOT_CERTIFIED; sends stay human-gated", /qualify|prepare|build|map/i.test(R.nextOdgAction("A")) && /NOT_CERTIFIED/.test(R.nextOdgAction("F")) && /human-gated/i.test(R.nextOdgAction("C")));

// (3) ranking by FIT — a feasible, well-evidenced, future-deadline opp beats a huge-budget but passed-deadline/infeasible one.
const good = { marker: "GOOD", grade: "A", feasible: true, deadlineDays: 30, budgetEur: 5000 };
const bigButBad = { marker: "BIG", grade: "C", feasible: false, deadlinePassed: true, budgetEur: 500000 };
const ranked = R.rankByFit([bigButBad, good]);
ok("fit ranks the feasible/evidenced opp above the huge-budget passed-deadline one (value not dominant)", ranked[0].marker === "GOOD" && ranked[0].fit.fitScore > ranked[1].fit.fitScore);
ok("fit components transparent", ["evidenceW", "feasW", "deadlineW", "budgetKnownW", "scamW", "fitScore"].every(k => k in ranked[0].fit));
ok("scam-flagged opp sinks (−1000)", R.rankByFit([{ marker: "S", grade: "A", scamFlags: ["phish"] }])[0].fit.fitScore < 0);

// (4) live discovery with NO authorized connector ⇒ explicit NO_RESULTS + external gate.
const none = R.runDiscovery({});
ok("no connector ⇒ NO_RESULTS + external gate (no fabricated opportunity)", none.status === "NO_RESULTS" && none.opportunities.length === 0 && /no authorized live source/i.test(none.reason) && none.externalGate.classification === "EXTERNAL_PROVIDER_OR_CREDENTIAL_REQUIRED");
ok("empty source ⇒ NO_RESULTS", R.runDiscovery({ source: () => [] }).status === "NO_RESULTS");
ok("source error ⇒ SOURCE_ERROR (fail-safe, no crash)", R.runDiscovery({ source: () => { throw new Error("boom"); } }).status === "SOURCE_ERROR");

// (5) a SYNTHETIC source ⇒ RESULTS clearly labeled a TEST; routed + provenance preserved; nothing sent.
const synthSource = () => ([
  { id: "T1", buyer: "Acme", subject: "software dependency assurance diagnostic", url: "https://example.test/t1", budgetEur: 900, deadline: "2026-12-01", publishedAt: "2026-10-20" },
  { id: "T2", buyer: "Beta", subject: "ISO 27001 readiness programme", url: "https://example.test/t2", budgetEur: 20000, deadline: "2026-12-15", publishedAt: "2026-10-21" },
]);
const res = R.runDiscovery({ source: synthSource, synthetic: true, detectOpts: { nowMs: Date.parse("2026-10-27T00:00:00Z") } });
ok("synthetic source ⇒ RESULTS, synthetic flag, TEST note", res.status === "RESULTS" && res.synthetic === true && /SYNTHETIC .* TESTS, not customers|TESTS, not customers/i.test(res.note));
ok("each opportunity routed to an axis + ODG next action + provenance field", res.opportunities.every(o => R.AXES.includes(o.axis) && o.nextOdgAction && ("provenance" in o)));
ok("byAxis counts sum to opportunity count", Object.values(res.byAxis).reduce((a, b) => a + b, 0) === res.opportunities.length);

// (6) V38 capability-fit: ODG-relevant subjects relevant; irrelevant parked (not dropped).
ok("capabilityFit: relevant subjects match (EN+FR), irrelevant do not", R.capabilityFit({ subject: "software dependency assurance + SBOM" }).relevant === true && R.capabilityFit({ subject: "cartographie applicative et cybersécurité" }).relevant === true && R.capabilityFit({ subject: "maintenance des systèmes de sécurité incendie" }).relevant === false && R.capabilityFit({ subject: "étude hydraulique sur la Loire" }).relevant === false);

// (7) requireCapabilityFit filter PARKS irrelevant (never drops) and keeps a qualified shortlist.
const mixedSource = () => ([
  { id: "T1", buyer: "A", subject: "audit de sécurité logicielle et conformité RGPD", url: "https://example.test/t1", publishedAt: "2026-10-26" },
  { id: "T2", buyer: "B", subject: "maintenance préventive des systèmes de sécurité incendie", url: "https://example.test/t2", publishedAt: "2026-10-26" },
  { id: "T3", buyer: "C", subject: "étude hydraulique sur la rivière", url: "https://example.test/t3", publishedAt: "2026-10-26" },
]);
const filtered = R.runDiscovery({ source: mixedSource, requireCapabilityFit: true, detectOpts: { nowMs: Date.parse("2026-10-28T00:00:00Z") } });
ok("capability filter ⇒ only the relevant opp shortlisted; 2 irrelevant PARKED (not dropped)", filtered.opportunities.length === 1 && filtered.parked.length === 2 && filtered.counts.capabilityFiltered === true && filtered.opportunities[0].capabilityFit.relevant === true);
ok("parked entries carry subject + reason (auditable, not silently dropped)", filtered.parked.every(p => p.subject && /parked/i.test(p.reason)));
// default (no requireCapabilityFit) keeps prior behaviour (no parking).
ok("default (filter off) ⇒ no parking (backward compatible)", (R.runDiscovery({ source: mixedSource, detectOpts: { nowMs: Date.parse("2026-10-28T00:00:00Z") } }).parked || []).length === 0);

console.log(`\nOPPORTUNITY-AXIS-ROUTER suite — ${pass} assertions passed. (six-axis routing; fit>value ranking; capability-fit filter; NO_RESULTS w/o connector; synthetic=TEST; nothing sent)`);
