#!/usr/bin/env node
"use strict";
/* η3-B112 — W6 daily checkpoint review. READ-ONLY: recomputes from the append-only journal (source of
 * truth), prints a human report + GO/NO-GO, writes a dated snapshot under runtime/generated/w6/reports/.
 * Launches NO mission, changes NO runtime. Run: node w6-review.js  (from repo root). */
const fs = require("fs"), path = require("path");
const REPO = process.cwd();
const J = path.join(REPO, "runtime/generated/w6/journal.jsonl");
const INC = path.join(REPO, "runtime/generated/w6/collection-incidents.log");
const OUT = path.join(REPO, "runtime/generated/w6/reports");
if (!fs.existsSync(J)) { console.log("W6: no journal yet — nothing to review."); process.exit(0); }
const recs = fs.readFileSync(J, "utf8").trim().split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
const bad = recs.filter((r) => r === null).length;
const ok = recs.filter(Boolean);
const missions = ok.filter((r) => r.type && r.entry && r.entry !== "B-rollback-js");
const events = ok.filter((r) => r.event);
const types = new Set(missions.map((r) => r.type));
const nonSuccess = missions.filter((r) => r.status !== "SUCCESS" || r.validated !== true);
const incidents = ok.filter((r) => r.incident);
const parityRecs = missions.filter((r) => r.parity !== null && r.parity !== undefined);
const parityFail = parityRecs.filter((r) => r.parity !== true);
const auto = missions.filter((r) => r.source === "auto-collect").length;
const stale = !!events.find((e) => e.event === "stale-recovery-drill" && e.ok);
const rb = !!events.find((e) => e.event === "rollback-drill" && e.ok);
const tss = missions.map((r) => r.ts).sort();
const elapsedH = tss.length ? (Date.now() - new Date(tss[0]).getTime()) / 3.6e6 : 0;
const collFails = fs.existsSync(INC) ? fs.readFileSync(INC, "utf8").trim().split("\n").filter(Boolean).length : 0;
const volumeOk = missions.length >= 50 || elapsedH >= 72;
const typesOk = types.size >= 10;
const clean = bad === 0 && nonSuccess.length === 0 && incidents.length === 0 && parityFail.length === 0;
const anomaly = bad > 0 || nonSuccess.length > 0 || parityFail.length > 0;
const w6Met = volumeOk && typesOk && clean && stale && rb;
const verdict = anomaly ? "NO-GO (anomaly)" : (w6Met ? "GO (W6 met)" : "IN PROGRESS (criteria pending)");
const report = {
  date: new Date().toISOString(), journalLines: recs.length, malformed: bad,
  realMissions: missions.length, autoCollectedViaFrontDoorA: auto, distinctTypes: [...types],
  elapsedHours: Number(elapsedH.toFixed(3)), nonSuccess: nonSuccess.length, incidents: incidents.length,
  parityChecked: parityRecs.length, parityFailures: parityFail.length, collectionFailures: collFails,
  staleRecoveryObserved: stale, rollbackObserved: rb,
  thresholds: { missionsNeeded: 50, hoursNeeded: 72, distinctTypesNeeded: 10 },
  missing: [volumeOk ? null : `volume/duration ${missions.length}/50 or ${Number(elapsedH.toFixed(2))}/72h`,
            typesOk ? null : `distinct types ${types.size}/10`].filter(Boolean),
  verdict,
};
try { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, `w6-review-${report.date.slice(0,10)}.json`), JSON.stringify(report, null, 2)); } catch {}
console.log("===== W6 DAILY REVIEW =====");
console.log(JSON.stringify(report, null, 2));
console.log("VERDICT: " + verdict + (w6Met ? "" : " — migration NOT complete"));
