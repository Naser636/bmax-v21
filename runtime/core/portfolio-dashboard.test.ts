#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the consolidated dashboard COMPOSES existing modules without inventing data:
// forecast is kept separate from actual collected cash (default €0), readiness ≠ certification, missing sections are
// NO_DATA, and the €500k gap is measured against actual collected net only.
"use strict";
const assert = require("assert");
const D = require("./portfolio-dashboard.js");
const PM = require("./patch-memory.js");
const RL = require("./reuse-ledger.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

const memStore = () => { const m = {}; return { read: (n, f) => (n in m ? m[n] : (f === undefined ? null : f)), write: (n, o) => { m[n] = o; return o; } }; };

// (1) empty call ⇒ all input-driven sections NO_DATA; learning aggregate present; target preserved.
const empty = D.buildDashboard({ reuseLedgerOpts: { store: memStore() } });
ok("no inputs ⇒ sections NO_DATA (unknown stays unknown)", empty.ok && empty.axes.status === "NO_DATA" && empty.forecast.status === "NO_DATA" && empty.enterprise.status === "NO_DATA" && empty.certification.status === "NO_DATA");
ok("€500k target preserved; actual collected defaults €0; gap = full target", empty.cashVsForecast.netTarget === 500000 && empty.cashVsForecast.actualNetCollected === 0 && empty.cashVsForecast.gapToTarget === 500000);

// (2) forecast is kept SEPARATE from actual cash.
const full = D.buildDashboard({
  workstreams: ["A", "B", "C", "D", "E", "F"].map(id => ({ axis: id, status: "ACTIVE", nextAction: `do ${id}`, blockers: [] })),
  opportunities: [{ id: "o1", stage: "CASHED", amount: 2000 }, { id: "o2", stage: "SIGNED", amount: 10000 }],
  collectedNet: 0,
  reuseLedgerOpts: { store: memStore() },
});
ok("six-axis composed ⇒ ok, no violations", full.axes.ok === true && full.axes.violations.length === 0);
ok("forecast weighted pipeline present but NOT counted as cash", typeof full.cashVsForecast.forecastWeightedPipeline === "number" && full.cashVsForecast.forecastWeightedPipeline > 0 && full.cashVsForecast.actualNetCollected === 0 && full.cashVsForecast.gapToTarget === 500000);
ok("note states forecast ≠ cash", /forecast.*NOT cash|actualNetCollected counts ONLY/i.test(full.cashVsForecast.note));

// (3) actual evidenced collection reduces the gap (and only that).
const withCash = D.buildDashboard({ collectedNet: 120000, reuseLedgerOpts: { store: memStore() } });
ok("evidenced collection reduces gap by exactly that amount", withCash.cashVsForecast.actualNetCollected === 120000 && withCash.cashVsForecast.gapToTarget === 380000);

// (4) enterprise mission sizing composed (priced scope, not sold) + certification readiness NOT_CERTIFIED.
const ent = D.buildDashboard({
  missions: [{ ref: "E1", scope: "s", deliverables: ["d"], milestones: [{ hours: 100, qaHours: 10 }], acceptanceCriteria: ["a"], exclusions: ["e"], assumptions: ["x"], paymentSchedule: [{ pct: 100 }], supportBoundary: "b", changeControl: "c", proposedPrice: 12000, hourlyRate: 95, soloCapacityHours: 2000 }],
  certification: { gatedSuites: ["audit-log", "evidence-provenance"], evidence: { "7": { state: "APPROVED", responsible: "CTO", artifact: "p.md" } }, evidenceDates: { "7": "2026-09-01T00:00:00Z" }, now: "2026-10-27T00:00:00Z" },
  reuseLedgerOpts: { store: memStore() },
});
ok("enterprise sizing composed (justifiedPrice computed, not sold)", Array.isArray(ent.enterprise) && typeof ent.enterprise[0].justifiedPrice === "number");
ok("certification readiness composed ⇒ NOT_CERTIFIED", ent.certification.certificationStatus === "NOT_CERTIFIED" && typeof ent.certification.summary.total === "number");

// (5) learning aggregate reflects the reuse-ledger.
const st = memStore();
const sig = PM.signature({ goal: "g", objectiveId: "o" });
RL.recordReuseOutcome(sig, { before: { signals: { t: 2 } }, after: { signals: { t: 5 } }, senseMap: { t: "lower" }, at: "t1" }, { store: st }); // regression ⇒ failed
RL.recordReuseOutcome(sig, { before: { signals: { t: 2 } }, after: { signals: { t: 5 } }, senseMap: { t: "lower" }, at: "t2" }, { store: st });
const learn = D.buildDashboard({ reuseLedgerOpts: { store: st } }).learning;
ok("learning aggregate counts assets + failed + suppressed", learn.assets === 1 && learn.failed === 2 && learn.suppressed === 1 && learn.suppressedSignatures.includes(sig));

// (6) six-axis violation surfaces in the dashboard (missing axis).
const broken = D.buildDashboard({ workstreams: [{ axis: "A", nextAction: "x", blockers: [] }], reuseLedgerOpts: { store: memStore() } });
ok("missing axes ⇒ axes.ok false + MISSING_AXIS violations surfaced", broken.axes.ok === false && broken.axes.violations.some(v => v.code === "MISSING_AXIS"));

// (7) target never lowered to fit; honesty notes present.
ok("€500k binding + readiness≠certification notes", D.NET_TARGET_DEFAULT === 500000 && empty.notes.some(n => /never lowered/i.test(n)) && empty.notes.some(n => /readiness ≠ certification/i.test(n)));

// (8) deterministic.
ok("reproducible", JSON.stringify(D.buildDashboard({ collectedNet: 50000, reuseLedgerOpts: { store: memStore() } }).cashVsForecast) === JSON.stringify(D.buildDashboard({ collectedNet: 50000, reuseLedgerOpts: { store: memStore() } }).cashVsForecast));

console.log(`\nPORTFOLIO-DASHBOARD suite — ${pass} assertions passed. (compose A–F + forecast≠cash + readiness≠certification + NO_DATA + €500k gap on actual only)`);
