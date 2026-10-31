#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx; migration-debt convention (sibling style).
"use strict";
/*
 * Mission Ledger — P0-AUTONOMY-MEASURE slice 2 (MEASURE-ONLY) write-path regression.
 *
 * Proves recordMission stamps an HONEST execution actor from the mission-scoped patch-execution.json, and OMITS
 * it (entry byte-shape-identical to the legacy ~1388) whenever evidence is absent / cross-mission / unmappable /
 * contradictory — never fabricating, never defaulting to ODG, never reading proven/validated as an actor signal.
 * Fully isolated: each case runs recordMission in a throwaway cwd with the governance fixtures copied in, so the
 * real ledger under runtime/generated/ is NEVER touched.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = process.cwd();
const { recordMission } = require(path.join(REPO, "runtime", "core", "mission-ledger.js"));

const GOV_FILES = [
  path.join("runtime", "constitution", "runtime-constitution.json"),
  path.join("runtime", "policies", "runtime-policies.json"),
  path.join("runtime", "governance", "state-machine.json"),
];

let failures = 0;
const check = (cond, label) => { if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); } };

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-actor-"));
  for (const rel of GOV_FILES) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    try { fs.copyFileSync(path.join(REPO, rel), path.join(dir, rel)); } catch { /* fixture optional */ }
  }
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  return dir;
}
const G = (dir, name) => path.join(dir, "runtime", "generated", name);
const writeReport = (dir, mission, validated) => fs.writeFileSync(G(dir, "mission-report.json"), JSON.stringify({ mission, validated, status: validated ? "SUCCESS" : "FAILED" }));
const writePatchExecution = (dir, mission, executed) => fs.writeFileSync(G(dir, "patch-execution.json"), JSON.stringify({ mission, executed }));
const writeCheckpoint = (dir, mission, startedAt) => fs.writeFileSync(G(dir, "pipeline-checkpoint.json"), JSON.stringify({ mission, startedAt }));
function lastEntry(dir) { try { const l = JSON.parse(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8")); return l.entries[l.entries.length - 1]; } catch { return null; } }
function ledgerCount(dir) { try { return JSON.parse(fs.readFileSync(G(dir, "mission-ledger.json"), "utf8")).count; } catch { return 0; } }
function recordIn(dir, mission) { const prev = process.cwd(); process.chdir(dir); try { return recordMission(mission); } finally { process.chdir(prev); } }

console.log("MISSION LEDGER — SLICE 2 ACTOR PROVENANCE (measure-only, fail-closed)");

// A4 — ODG: concordant author (ODG_CAPABILITY) + ODG applicator ⇒ actor ODG, executedBy present.
{ const d = sandbox(); writeReport(d, "M_ODG", true); writePatchExecution(d, "M_ODG", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }]);
  const r = recordIn(d, "M_ODG"); const e = lastEntry(d);
  check(r.skipped !== true && e && e.actor === "ODG" && typeof e.executedBy === "string" && e.executedBy.length > 0, "A4 ODG concordant ⇒ actor ODG + executedBy stamped");
  check(e && e.proven === true, "A4 proven still true (gate unaffected)"); }

// A5 — provider-authored, ODG-applied ⇒ TECHNICAL_PROVIDER (author governs, applicator does NOT promote to ODG).
{ const d = sandbox(); writeReport(d, "M_PROV", true); writePatchExecution(d, "M_PROV", [{ authoredBy: "PROVIDER", appliedBy: "ODG_EXECUTOR" }]);
  const e = (recordIn(d, "M_PROV"), lastEntry(d));
  check(e && e.actor === "TECHNICAL_PROVIDER", "A5 provider author + ODG applied ⇒ TECHNICAL_PROVIDER, never ODG"); }

// A6 — human-mandatory ⇒ HUMAN.
{ const d = sandbox(); writeReport(d, "M_HUM", true); writePatchExecution(d, "M_HUM", [{ humanMandatory: true }]);
  const e = (recordIn(d, "M_HUM"), lastEntry(d));
  check(e && e.actor === "HUMAN", "A6 humanMandatory ⇒ HUMAN"); }

// B4 — STALE cross-mission patch-execution ⇒ NO actor stamped (mirrors scopedPlan ===mission guard); still proven.
{ const d = sandbox(); writeReport(d, "M_STALE", true); writePatchExecution(d, "OTHER_MISSION", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }]);
  const r = recordIn(d, "M_STALE"); const e = lastEntry(d);
  check(r.skipped !== true && e && !("actor" in e) && !("executedBy" in e), "B4 cross-mission artifact ⇒ actor OMITTED (not borrowed)");
  check(e && e.proven === true, "B4 record still proven (actor is not a proof substitute)"); }

// B5 — no patch-execution at all ⇒ actor OMITTED (legacy shape); proven unchanged.
{ const d = sandbox(); writeReport(d, "M_NONE", true);
  const e = (recordIn(d, "M_NONE"), lastEntry(d));
  check(e && !("actor" in e) && !("executedBy" in e), "B5 absent artifact ⇒ actor OMITTED, never defaulted to ODG"); }

// B6 — CONTRADICTORY executed[] (ODG + PROVIDER) ⇒ ambiguous ⇒ actor OMITTED.
{ const d = sandbox(); writeReport(d, "M_CONFL", true); writePatchExecution(d, "M_CONFL", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "PROVIDER", appliedBy: "ODG_EXECUTOR" }]);
  const e = (recordIn(d, "M_CONFL"), lastEntry(d));
  check(e && !("actor" in e), "B6 contradictory signals ⇒ actor OMITTED (ambiguous, no attribution)"); }

// B7 — ODG-authored but NOT ODG-applied ⇒ NOT ODG (demotion) ⇒ actor OMITTED.
{ const d = sandbox(); writeReport(d, "M_DEMOTE", true); writePatchExecution(d, "M_DEMOTE", [{ authoredBy: "ODG_CAPABILITY", appliedBy: null }]);
  const e = (recordIn(d, "M_DEMOTE"), lastEntry(d));
  check(e && e.actor !== "ODG" && !("actor" in e), "B7 ODG-authored but not ODG-applied ⇒ never ODG (omitted)"); }

// D1/D2 — persistence + idempotence: actor round-trips; a duplicate (mission,runId) record is a no-op with stable actor.
{ const d = sandbox(); writeReport(d, "M_IDEM", true); writePatchExecution(d, "M_IDEM", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }]); writeCheckpoint(d, "M_IDEM", "2026-10-31T00:00:00Z");
  recordIn(d, "M_IDEM"); const first = lastEntry(d);
  const r2 = recordIn(d, "M_IDEM");
  check(first && first.actor === "ODG" && first.executedBy, "D1 actor persists through temp+rename round-trip");
  check(r2.skipped === true && r2.reason === "DUPLICATE_RUN" && ledgerCount(d) === 1, "D2 duplicate (mission,runId) ⇒ no-op, count stays 1, actor stable"); }

// D3 — no .tmp-* residue after a successful record.
{ const d = sandbox(); writeReport(d, "M_TMP", true); writePatchExecution(d, "M_TMP", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }]);
  recordIn(d, "M_TMP");
  const residue = fs.readdirSync(path.join(d, "runtime", "generated")).filter((n) => n.indexOf("mission-ledger.json.tmp") === 0);
  check(residue.length === 0, "D3 crash-atomic write leaves no .tmp-* residue"); }

// F-reg — GATE NON-WIDENING: absent report + PRESENT actor artifact ⇒ UNPROVEN, nothing recorded.
{ const d = sandbox(); writePatchExecution(d, "M_NOPROOF", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }]); // NO report
  const r = recordIn(d, "M_NOPROOF");
  check(r.skipped === true && r.reason === "UNPROVEN" && ledgerCount(d) === 0, "F-reg actor artifact never substitutes for proof (UNPROVEN refuse)"); }

// R1 (P0-A hardening) — a concordant-ODG entry PLUS a present-but-UNMAPPED author entry ⇒ actor OMITTED (ambiguous),
// never silently stamped ODG. Preserved: a demoted sibling whose author IS known (ODG_CAPABILITY, not applied) is NOT
// ambiguity, so a genuine multi-entry ODG mission still stamps ODG.
{ const d = sandbox(); writeReport(d, "M_R1A", true); writePatchExecution(d, "M_R1A", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "MYSTERY", appliedBy: "ODG_EXECUTOR" }]);
  const e = (recordIn(d, "M_R1A"), lastEntry(d));
  check(e && !("actor" in e), "R1a ODG + UNMAPPED author ⇒ actor OMITTED (not silently ODG)"); }
{ const d = sandbox(); writeReport(d, "M_R1B", true); writePatchExecution(d, "M_R1B", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "UNKNOWN", appliedBy: "ODG_EXECUTOR" }]);
  const e = (recordIn(d, "M_R1B"), lastEntry(d));
  check(e && !("actor" in e), "R1b ODG + UNKNOWN-sentinel author ⇒ actor OMITTED (conservative)"); }
{ const d = sandbox(); writeReport(d, "M_R1C", true); writePatchExecution(d, "M_R1C", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "ODG_CAPABILITY", appliedBy: null }]);
  const e = (recordIn(d, "M_R1C"), lastEntry(d));
  check(e && e.actor === "ODG", "R1c ODG applied + ODG-authored-not-applied sibling (known author) ⇒ still ODG (not over-suppressed)"); }
// R1 resolver-level: unresolvedCount surfaced; suppression reason explicit.
{ const AP = require("./actor-provenance.ts");
  const r = AP.resolveMissionActor({ mission: "M", executed: [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "MYSTERY" }] }, "M");
  check(r.actor === null && r.unresolvedCount === 1 && /unresolved\/unknown author/.test(r.reason), "R1 resolver surfaces unresolvedCount + ambiguity reason, actor null"); }

// E2 — role separation: provider-executed but (would be) ODG-verified/accepted ⇒ actor stays provider, not ODG.
{ const d = sandbox(); writeReport(d, "M_ROLE", true); writePatchExecution(d, "M_ROLE", [{ authoredBy: "PROVIDER", appliedBy: "ODG_EXECUTOR", authorizedBy: "ODG" }]);
  const e = (recordIn(d, "M_ROLE"), lastEntry(d));
  check(e && e.actor === "TECHNICAL_PROVIDER" && e.authorized !== undefined, "E2 executor(EXTERNAL) not promoted by ODG verify/accept; authorized is a separate field"); }

console.log(failures === 0 ? "\nALL PASS — MISSION LEDGER SLICE 2 ACTOR PROVENANCE" : `\nFAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
