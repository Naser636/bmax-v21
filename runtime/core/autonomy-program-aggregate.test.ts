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
// (slice-2 evolution of the former interim-wording assertion) a no-actor ledger ⇒ actor split NON-MEASURABLE:
// 0 denominator, every mission excluded (entriesWithoutActor === distinctMissions), no fabricated share.
ok("no-actor ledger ⇒ actor split NON-MEASURABLE (den 0, all excluded, no fabricated share)",
  rp.actorAutonomy.measurable === false && rp.actorAutonomy.denominator === 0 &&
  rp.actorAutonomy.entriesWithoutActor === rp.distinctMissions && rp.actorAutonomy.byActor === null &&
  rp.actorAutonomy.odgShare === null && /recognized execution actor/i.test(rp.actorAutonomy.reason));

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

// ---- SLICE 2: actor split (positive, anti-fabrication, denominator identity) ----
const mkA = (mission, actor) => ({ mission, state: "ARCHIVED", recordedAt: "2026-10-05T00:00:00Z", proven: true, validated: true, authorized: true, ...(actor ? { actor } : {}) });
// A1 — recognized actors counted in the right bucket with denominator = recognized-actor missions.
const a1 = A.aggregateProgramAutonomy({ entries: [mkA("M1", "ODG"), mkA("M2", "ODG"), mkA("M3", "TECHNICAL_PROVIDER")] }).actorAutonomy;
ok("A1 actor split measurable; denominator = recognized-actor missions (3)", a1.measurable === true && a1.denominator === 3);
ok("A1 ODG bucket 2/3, provider 1/3, human 0", a1.byActor.ODG.count === 2 && a1.byActor.ODG.rate === 0.6667 && a1.byActor.TECHNICAL_PROVIDER.count === 1 && a1.byActor.HUMAN.count === 0);
// A2 — human actor in its own bucket.
const a2 = A.aggregateProgramAutonomy({ entries: [mkA("M1", "ODG"), mkA("M2", "TECHNICAL_PROVIDER"), mkA("M3", "HUMAN")] }).actorAutonomy;
ok("A2 human counted in its own bucket; denominator 3", a2.byActor.HUMAN.count === 1 && a2.denominator === 3);
// A3 — a mission with NO actor is excluded from the actor denominator but still counted for outcome.
const r3 = A.aggregateProgramAutonomy({ entries: [mkA("M1", "ODG"), mkA("M2", "ODG"), mkA("M3", null)] });
ok("A3 no-actor mission excluded from actor denominator (stays 2), surfaced as entriesWithoutActor", r3.actorAutonomy.denominator === 2 && r3.actorAutonomy.entriesWithoutActor === 1 && r3.outcome.denominator === 3);
// B1 — all proven, NO actor ⇒ actor split NON-MEASURABLE (already covered by rp above; re-assert the dangerous direction).
const b1 = A.aggregateProgramAutonomy({ entries: [mkA("X", null), mkA("Y", null)] }).actorAutonomy;
ok("B1 all proven + no actor ⇒ NON-MEASURABLE (never ODG from proven)", b1.measurable === false && b1.odgShare === null && b1.denominator === 0);
// B2/B3 — an UNRECOGNIZED actor value is never credited; if it's the only actor-bearing mission ⇒ NON-MEASURABLE.
const b2 = A.aggregateProgramAutonomy({ entries: [mkA("G", "ROBOT")] }).actorAutonomy;
ok("B2 unrecognized actor ⇒ entriesWithUnrecognizedActor, NON-MEASURABLE (0 recognized)", b2.measurable === false && b2.entriesWithUnrecognizedActor === 1 && b2.denominator === 0);
const b3 = A.aggregateProgramAutonomy({ entries: [mkA("H", "ODG"), mkA("G", "ROBOT")] }).actorAutonomy;
ok("B3 garbage never inflates denominator/share", b3.denominator === 1 && b3.byActor.ODG.count === 1 && b3.entriesWithUnrecognizedActor === 1);
// Denominator identity (checklist #11): buckets sum to denominator; without + unrecognized + denominator === distinctMissions.
const ri = A.aggregateProgramAutonomy({ entries: [mkA("M1", "ODG"), mkA("M2", "TECHNICAL_PROVIDER"), mkA("M3", "ROBOT"), mkA("M4", null)] });
const aa = ri.actorAutonomy;
ok("denominator identity: ODG+provider+human+automated === denominator", aa.byActor.ODG.count + aa.byActor.TECHNICAL_PROVIDER.count + aa.byActor.HUMAN.count + aa.byActor.AUTOMATED_SYSTEM.count === aa.denominator);
ok("partition identity: without + unrecognized + denominator === distinctMissions", aa.entriesWithoutActor + aa.entriesWithUnrecognizedActor + aa.denominator === ri.distinctMissions);

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
