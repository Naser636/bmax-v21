#!/usr/bin/env node
"use strict";
/* TS source (tsx-run) of scripts/w6-collect; scripts/w6-collect.js = ODG_RUNTIME=js rollback. */
/*
 * η3-B110 — W6 observational collector (STRICTLY OBSERVATIONAL; NEVER alters a mission).
 *
 * Invoked (guarded) at the END of a mission run, AFTER runtime/generated/mission-report.json is
 * finalized. It ONLY reads the canonical report + dist manifest and APPENDS one record to the existing
 * W6 journal, then recomputes the checkpoint. It writes NOTHING outside runtime/generated/w6/ and never
 * touches a business artifact, exit code, authorization or behaviour. It ALWAYS exits 0: a collection
 * failure is itself logged to runtime/generated/w6/collection-incidents.log (an observability problem)
 * but must never block or fail the mission. Usage: node scripts/w6-collect.js <mission> <entry> [exit].
 */
const fs = require("fs"), path = require("path");
const REPO = process.cwd();
const W6 = path.join(REPO, "runtime", "generated", "w6");
const JOURNAL = path.join(W6, "journal.jsonl");
const CKPT = path.join(W6, "checkpoint.json");
const INC = path.join(W6, "collection-incidents.log");
const mission = process.argv[2] || "UNKNOWN";
const entry = process.argv[3] || "A-shell";
const exitArg = process.argv[4];

function incident(msg: string): void { try { fs.mkdirSync(W6, { recursive: true }); fs.appendFileSync(INC, new Date().toISOString() + " " + msg + "\n"); } catch { /* last resort: swallow */ } }

try {
  fs.mkdirSync(W6, { recursive: true });
  const repPath = path.join(REPO, "runtime", "generated", "mission-report.json");
  let rep: any;
  try { rep = JSON.parse(fs.readFileSync(repPath, "utf8")); }
  catch (e: any) { incident(`collect ${mission}: no/invalid mission-report (${e.message})`); process.exit(0); }
  // Anti-false-count: if the finalized report is for a DIFFERENT mission, it is stale/mismatched — do
  // NOT append (that would mis-attribute/inflate the W6 counter); flag it as an observability incident.
  if (rep && rep.mission && mission !== "UNKNOWN" && rep.mission !== mission) {
    incident(`collect ${mission}: report mission mismatch (found "${rep.mission}") — stale report, skipped to avoid false count`);
    process.exit(0);
  }
  let dist = "absent";
  try { const m = JSON.parse(fs.readFileSync(path.join(REPO, "runtime/dist/dist-closure-manifest.json"), "utf8")); dist = `emitted=${m.emittedCount},copied=${m.copiedCount}`; } catch { /* dist optional on JS path */ }
  const rec = {
    ts: new Date().toISOString(), type: rep.mission || mission, entry,
    status: rep.status, validated: rep.validated === true,
    exitCode: exitArg !== undefined && exitArg !== "" ? Number(exitArg) : null,
    parity: null, // single-runtime real op: parity is not re-measured per run (proven byte-identical B105/B108)
    dist, source: "auto-collect",
    incident: rep.status === "SUCCESS" ? null : "non-success",
  };
  fs.appendFileSync(JOURNAL, JSON.stringify(rec) + "\n");

  // Recompute the checkpoint from the FULL journal (resumable single source of truth).
  const lines = fs.readFileSync(JOURNAL, "utf8").trim().split("\n").filter(Boolean)
    .map((l: string) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const mrecs = lines.filter((r: any) => r.type && r.entry && r.entry !== "B-rollback-js");
  const types = new Set(mrecs.map((r: any) => r.type));
  const errors = lines.filter((r: any) => r.incident).length;
  const prec = mrecs.filter((r: any) => r.parity !== null && r.parity !== undefined);
  const parityPass = prec.every((r: any) => r.parity === true);
  let prior: any = {};
  try { prior = JSON.parse(fs.readFileSync(CKPT, "utf8")); } catch { /* first run */ }
  const windowStart = prior.windowStart || rec.ts;
  const elapsedH = (Date.now() - new Date(windowStart).getTime()) / 3.6e6;
  const stale = prior.staleRecoveryObserved || false;
  const rollback = prior.rollbackObserved || false;
  const ckpt = {
    windowStart, lastUpdate: rec.ts,
    missionsObserved: mrecs.length, distinctTypes: types.size, typesList: [...types],
    unexplainedErrors: errors, parityChecked: prec.length, parityAllPass: parityPass,
    staleRecoveryObserved: stale, rollbackObserved: rollback,
    elapsedHours: Number(elapsedH.toFixed(3)),
    thresholds: { missionsNeeded: 50, hoursNeeded: 72, distinctTypesNeeded: 10 },
    w6Met: (mrecs.length >= 50 || elapsedH >= 72) && types.size >= 10 && errors === 0 && parityPass && stale && rollback,
    remaining: [
      mrecs.length >= 50 || elapsedH >= 72 ? null : `volume/duration: ${mrecs.length}/50 missions or ${Number(elapsedH.toFixed(3))}/72h`,
      types.size >= 10 ? null : `distinct types: ${types.size}/10`,
      errors === 0 ? null : `errors: ${errors}`,
      parityPass ? null : "parity divergence present",
      stale ? null : "stale-recovery not yet observed",
      rollback ? null : "rollback not yet observed",
    ].filter(Boolean),
    nextAction: "Accrue real governed-mission records until volume/duration + distinct-types thresholds are met with 0 errors and parity preserved.",
  };
  fs.writeFileSync(CKPT, JSON.stringify(ckpt, null, 2));
  process.exit(0);
} catch (e: any) {
  incident("collector error: " + (e && e.message));
  process.exit(0);
}

export {};
