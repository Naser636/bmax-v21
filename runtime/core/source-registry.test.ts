#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the source-value decision model is honest: ranks by evidence (access/fit/
// qualified-yield/freshness/cost), NOT volume; surfaces a material owner decision when no FREE source yields a
// strictly-QUALIFIED opportunity; and is NOT hardcoded (a source with real qualified yield flips the recommendation).
"use strict";
const assert = require("assert");
const S = require("./source-registry.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) registry well-formed with verified access + honest qualified-yield.
ok("registry has verified sources (access/fit/qualifiedYield/liveStatus)", S.SOURCES.length >= 6 && S.SOURCES.every(s => s.id && s.access && s.odgFit && "qualifiedYield" in s && s.liveStatus));
ok("BOAMP+TED are ANONYMOUS_API with observed qualifiedYield 0 (honest, from eval)", S.SOURCES.find(s => s.id === "BOAMP").qualifiedYield === 0 && S.SOURCES.find(s => s.id === "TED").qualifiedYield === 0);
ok("paid aggregator labelled PAID with a cost; partner/supplier gated", S.SOURCES.find(s => s.id === "PRIVATE_RFP_AGGREGATOR").access === "PAID" && S.SOURCES.find(s => s.id === "IT_SUPPLIER_PORTALS").access === "FORM_ONLY" && S.SOURCES.find(s => s.id === "PARTNER_APIS").access === "AUTH_MEMBERSHIP");

// (2) ranking: anonymous/free rank above paid; components transparent.
const ranked = S.rankSources();
ok("ranked by score desc; free-anonymous outrank PAID; components exposed", ranked[0].score.total >= ranked[ranked.length - 1].score.total && ranked[0].access === "ANONYMOUS_API" && S.SOURCES.find(s => s.id === "PRIVATE_RFP_AGGREGATOR") && ranked.find(s => s.id === "PRIVATE_RFP_AGGREGATOR").score.total < ranked[0].score.total && ["accessW", "fitW", "yieldW", "freshW", "costW"].every(k => k in ranked[0].score));

// (3) volume is NOT a scoring factor (score has no record-count term).
ok("score has no volume/record-count component (value≠volume)", !("volumeW" in ranked[0].score) && !("recordsW" in ranked[0].score));

// (4) recommend surfaces a MATERIAL owner decision because no FREE source yields a QUALIFIED opp.
const r = S.recommend();
ok("no free qualified yield ⇒ material owner decision with real options", r.anyFreeSourceWithQualifiedYield === false && r.ownerDecision && r.ownerDecision.material === true && r.ownerDecision.options.length >= 3);
ok("topFreeQueryable identified; niche-but-gated sources listed", r.topFreeQueryable && r.nicheSourcesRequiringAuthorization.length >= 1);
ok("note: volume ≠ value; absence of feed ≠ absence of demand", /Volume ≠ value|volume ≠ value/i.test(r.note) && /Absence of a free private feed ≠ absence of demand/i.test(r.note));

// (5) NOT hardcoded: inject a source with real qualified yield ⇒ recommendation flips (no owner decision needed).
const withQualified = S.recommend({ sources: [...S.SOURCES, { id: "FUTURE", owner: "x", kind: "public-tender", url: "u", access: "ANONYMOUS_API", costEurPerMonth: 0, coverage: "x", sectors: "x", updateFreq: "daily", freshnessDays: 1, provenance: "official", odgFit: "NICHE", liveStatus: "QUERIED_OK", qualifiedYield: 3 }] });
ok("a source with qualifiedYield>0 flips recommendation (not hardcoded)", withQualified.anyFreeSourceWithQualifiedYield === true && withQualified.ownerDecision === null && withQualified.ranked[0].id === "FUTURE");

// (6) scoreSource: qualifiedYield>0 materially raises score (yield is credited).
ok("qualifiedYield>0 raises the score vs an identical 0-yield source", S.scoreSource({ access: "ANONYMOUS_API", odgFit: "NICHE", qualifiedYield: 3, freshnessDays: 1, costEurPerMonth: 0, liveStatus: "QUERIED_OK" }).total > S.scoreSource({ access: "ANONYMOUS_API", odgFit: "NICHE", qualifiedYield: 0, freshnessDays: 1, costEurPerMonth: 0, liveStatus: "QUERIED_OK" }).total);

console.log(`\nSOURCE-REGISTRY suite — ${pass} assertions passed. (evidence ranking; value≠volume; honest owner decision; not hardcoded)`);
