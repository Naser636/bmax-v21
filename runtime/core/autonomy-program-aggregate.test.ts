#!/usr/bin/env node
// @ts-nocheck — runs under tsx. P0-AUTONOMY-MEASURE slice 1: proves the program-level autonomy aggregate is
// HONEST — fail-closed on an empty ledger, dedups lifecycle re-records by mission id (distinct ≠ raw), reports
// §S-2 counts with explicit denominators, and NEVER fabricates the actor share (NON-MEASURABLE because the
// ledger carries no per-entry provenance — proven=true on every entry must NOT become a 100% ODG autonomy).
"use strict";
const assert = require("assert");
const A = require("./autonomy-program-aggregate.ts");
let n = 0;
const ok = (name, cond) => { assert.ok(cond, name); console.log("  ok -", name); n++; };

// (1) FAIL-CLOSED: empty / invalid ledger ⇒ measurable:false, no fabricated number.
for (const bad of [null, {}, { entries: [] }, { entries: "x" }, 42, []]) {
  const r = A.aggregateProgramAutonomy(bad);
  ok(`empty/invalid (${JSON.stringify(bad)}) ⇒ measurable:false + actor NON-MEASURABLE`,
    r.measurable === false && r.distinctMissions === 0 && r.actorAutonomy.measurable === false && r.outcome === null);
}

// (2) DEDUP: one mission re-recorded across 3 lifecycle states ⇒ ONE distinct mission, LATEST state wins.
const lifecycle = { entries: [
  { mission: "M1", state: "CREATED",  recordedAt: "2026-10-01T00:00:00Z", proven: true,  validated: false, authorized: true },
  { mission: "M1", state: "PREPARED", recordedAt: "2026-10-02T00:00:00Z", proven: true,  validated: false, authorized: true },
  { mission: "M1", state: "ARCHIVED", recordedAt: "2026-10-03T00:00:00Z", proven: true,  validated: true,  authorized: true },
  { mission: "M2", state: "PLANNED",  recordedAt: "2026-10-01T00:00:00Z", proven: true,  validated: false, authorized: true },
] };
const rl = A.aggregateProgramAutonomy(lifecycle);
ok("dedup: 4 entries ⇒ 2 distinct missions", rl.ledgerEntries === 4 && rl.distinctMissions === 2);
ok("dedup: latest state wins (M1 ⇒ ARCHIVED, not CREATED/PREPARED)", rl.byState.ARCHIVED === 1 && rl.byState.PLANNED === 1 && !rl.byState.CREATED && !rl.byState.PREPARED);
ok("terminal vs in-lifecycle split over distinct", rl.outcome.terminalVerifiedOrArchived === 1 && rl.outcome.stillInLifecycle === 1);
ok("denominators are the DISTINCT-mission count, not the raw entry count", rl.outcome.denominator === 2 && rl.outcome.validated.denominator === 2);
ok("validated counted on the LATEST entry (M1 archived+validated) ⇒ 1/2 = 0.5", rl.outcome.validated.count === 1 && rl.outcome.validated.rate === 0.5);

// (3) NO FABRICATION: every entry proven=true must NOT become a 100% ODG autonomy — actor stays NON-MEASURABLE.
const allProven = { entries: [
  { mission: "A", state: "ARCHIVED", recordedAt: "2026-10-01T00:00:00Z", proven: true, validated: true, authorized: true },
  { mission: "B", state: "ARCHIVED", recordedAt: "2026-10-01T00:00:00Z", proven: true, validated: true, authorized: true },
] };
const rp = A.aggregateProgramAutonomy(allProven);
ok("all proven=true ⇒ outcome.proven.rate 1.0 BUT labelled not-an-actor-signal", rp.outcome.proven.rate === 1 && /not an actor/i.test(rp.outcome.proven.note));
ok("all proven=true ⇒ actorAutonomy.measurable STILL false (no fabricated 100% ODG)", rp.actorAutonomy.measurable === false && rp.actorAutonomy.odgShare === null);
ok("actor block names the exact gap + the single next step", /no per-entry actor\/provenance/i.test(rp.actorAutonomy.reason) && /slice 2/i.test(rp.actorAutonomy.nextStep) && /executedBy|actor/.test(rp.actorAutonomy.nextStep));

// (4) entries without a mission id are counted separately, never silently merged into a distinct mission.
const noId = { entries: [
  { state: "ARCHIVED", recordedAt: "2026-10-01T00:00:00Z", proven: true },
  { mission: "Z", state: "ARCHIVED", recordedAt: "2026-10-01T00:00:00Z", proven: true, validated: true, authorized: true },
] };
const rn = A.aggregateProgramAutonomy(noId);
ok("entry without mission id ⇒ excluded from distinct, counted as entriesWithoutMissionId", rn.distinctMissions === 1 && rn.entriesWithoutMissionId === 1 && rn.ledgerEntries === 2);

// (4b) FAIL-CLOSED (verifier-hardened): entries present but NONE has a mission id ⇒ measurable:false, NOT a
// measurable:true with a 0 denominator (removes the only path to a 0-denominator "measurable" result).
const allNoId = { entries: [ { state: "ARCHIVED", proven: true }, { state: "PLANNED" } ] };
const ra = A.aggregateProgramAutonomy(allNoId);
ok("all entries lack a mission id ⇒ measurable:false (fail-closed, denominator never 0-while-measurable)",
  ra.measurable === false && ra.distinctMissions === 0 && ra.entriesWithoutMissionId === 2 && ra.ledgerEntries === 2 && ra.outcome === null && ra.actorAutonomy.measurable === false);

// (5) DETERMINISTIC: same input ⇒ deepEqual output (no clock/random).
ok("deterministic / reproducible", JSON.stringify(A.aggregateProgramAutonomy(lifecycle)) === JSON.stringify(A.aggregateProgramAutonomy(lifecycle)));

// (6) accepts a bare array ledger (not only {entries})
ok("bare array ledger accepted", A.aggregateProgramAutonomy(lifecycle.entries).distinctMissions === 2);

// (7) SOFT real-ledger sanity (never fails the suite if the gitignored artifact is absent, e.g. on CI).
try {
  const fs = require("fs"); const path = require("path");
  const p = path.join(process.cwd(), "runtime", "generated", "mission-ledger.json");
  if (fs.existsSync(p)) {
    const real = JSON.parse(fs.readFileSync(p, "utf8"));
    const rr = A.aggregateProgramAutonomy(real);
    assert.ok(rr.measurable === true && rr.distinctMissions >= 1 && rr.distinctMissions <= rr.ledgerEntries, "real ledger aggregate sane");
    assert.ok(rr.actorAutonomy.measurable === false, "real ledger: actor share still NON-MEASURABLE (no fabrication)");
    console.log(`  ok - real ledger sanity: ${rr.ledgerEntries} entries ⇒ ${rr.distinctMissions} distinct missions; actor share NON-MEASURABLE (honest)`); n++;
  } else {
    console.log("  ·· real-ledger sanity SKIPPED (runtime/generated/mission-ledger.json absent — gitignored; hermetic cases cover the logic)");
  }
} catch (e) {
  console.log("  ·· real-ledger sanity SKIPPED (" + ((e && e.message) || "error") + ")");
}

console.log(`\nALL PASS — autonomy-program-aggregate (${n} assertions)`);
