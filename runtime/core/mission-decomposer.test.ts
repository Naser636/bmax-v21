#!/usr/bin/env node
"use strict";
/* V285 — DIRECT unit tests for mission-decomposer (V81). Complements the indirect bin test (v81-decomposition, which
 * exercises only the legacy resolve control) by covering the paths it does NOT: the V82 SEMANTIC `qualify` control
 * (ALREADY_DONE requires qualify===VALID, never mere existence), boolean evidence flags (impl/dossier), the needsSignOff
 * default vs explicit-false, external-execution gating (level C, gated even when needsSignOff=false), invalid-input
 * handling, stable parent-linked ids, determinism + freeze. Tests the REAL component; asserts only contract behaviour.
 * Does NOT duplicate decomposition-planner (a different component). */
const D = require("./mission-decomposer.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }
const statusOf = (d: any, name: string) => (d.subMissions.find((s: any) => s.name === name) || {}).status;

function main() {
  check("SUB_STATUS frozen = exactly [ALREADY_DONE, LOCAL_REMAINING, SIGN_OFF_GATED]", Object.isFrozen(D.SUB_STATUS) && D.SUB_STATUS.join(",") === "ALREADY_DONE,LOCAL_REMAINING,SIGN_OFF_GATED");

  // ---- V82 SEMANTIC qualify control: ALREADY_DONE requires qualify===VALID (never mere existence) ----
  const qValid = { qualify: () => "VALID" };
  const qInsuff = { qualify: () => "INSUFFICIENT" };
  const qAbsent = { qualify: () => "ABSENT" };
  const parent = { id: "P", kind: "B_human", needsSignOff: true, evidence: { test: "t.ts", evidenceRef: "e.json" } };
  check("qualify=VALID ⇒ evidence-backed sub is ALREADY_DONE", statusOf(D.decompose(parent, qValid), "evidence") === "ALREADY_DONE" && statusOf(D.decompose(parent, qValid), "tests") === "ALREADY_DONE");
  check("qualify=INSUFFICIENT ⇒ LOCAL_REMAINING (NOT done on mere existence)", statusOf(D.decompose(parent, qInsuff), "tests") === "LOCAL_REMAINING");
  check("qualify=ABSENT ⇒ LOCAL_REMAINING (no fabricated completion)", statusOf(D.decompose(parent, qAbsent), "evidence") === "LOCAL_REMAINING" && D.decompose(parent, qAbsent).alreadyDoneCount === 0);

  // ---- boolean evidence flags (impl / dossier) have no ref to qualify ----
  const flagged = D.decompose({ id: "P", kind: "B_human", needsSignOff: true, evidence: { impl: true, dossier: true } }, qAbsent);
  check("ev.impl===true ⇒ implementation ALREADY_DONE even when qualifier would say ABSENT", statusOf(flagged, "implementation") === "ALREADY_DONE");
  check("ev.dossier===true ⇒ decision-dossier ALREADY_DONE", statusOf(flagged, "decision-dossier") === "ALREADY_DONE");
  check("ev.impl falsy (not ===true) ⇒ implementation LOCAL_REMAINING", statusOf(D.decompose({ id: "P", evidence: { impl: "yes" } }, qAbsent), "implementation") === "LOCAL_REMAINING");

  // ---- sign-off gating ----
  check("needsSignOff default (undefined) ⇒ final human-sign-off SIGN_OFF_GATED", (() => { const d = D.decompose({ id: "P", evidence: {} }, qAbsent); return d.signOffGated.includes("P:human-sign-off") && statusOf(d, "human-sign-off") === "SIGN_OFF_GATED"; })());
  check("needsSignOff===false (non-external) ⇒ final human act is NOT gated (LOCAL_REMAINING)", (() => { const d = D.decompose({ id: "P", needsSignOff: false, evidence: {} }, qAbsent); return d.signOffGated.length === 0 && statusOf(d, "human-sign-off") === "LOCAL_REMAINING"; })());

  // ---- external-execution: level C, gated even when needsSignOff=false ----
  const ext = D.decompose({ id: "X", kind: "B_external", needsSignOff: false, evidence: {} }, qAbsent);
  check("external kind ⇒ final act 'external-execution' level C, SIGN_OFF_GATED despite needsSignOff=false", (() => { const s = ext.subMissions.find((x: any) => x.name === "external-execution"); return !!s && s.level === "C" && s.status === "SIGN_OFF_GATED" && ext.signOffGated.includes("X:external-execution"); })());

  // ---- gated parent still exposes Level-A local work ----
  check("gated parent still exposes Level-A LOCAL_REMAINING (local work never stalls behind the lock)", D.decompose({ id: "P", kind: "B_human", needsSignOff: true, evidence: { test: "t.ts" } }, qAbsent).localRemaining.includes("P:tests"));

  // ---- legacy control modes (back-compat) ----
  check("legacy function resolver: resolve(ref)===true ⇒ ALREADY_DONE", statusOf(D.decompose({ id: "P", evidence: { test: "t.ts" } }, () => true), "tests") === "ALREADY_DONE");
  check("legacy {resolve} object + absent control both handled (absent ⇒ nothing done)", statusOf(D.decompose({ id: "P", evidence: { test: "t.ts" } }, { resolve: () => true }), "tests") === "ALREADY_DONE" && D.decompose({ id: "P", evidence: { test: "t.ts" } }, undefined).alreadyDoneCount === 0);

  // ---- invalid / incomplete input ----
  check("invalid parent (null / number / undefined) ⇒ no throw, still 5 sub-missions", D.decompose(null, qAbsent).subMissions.length === 5 && D.decompose(42, qAbsent).subMissions.length === 5 && D.decompose(undefined, qAbsent).subMissions.length === 5);

  // ---- stable ids + always 5 standard sub-missions + determinism + freeze ----
  const d = D.decompose(parent, qValid);
  check("exactly 5 standard sub-missions, ids all prefixed by the parent id", d.subMissions.length === 5 && d.subMissions.every((s: any) => s.id.startsWith("P:")));
  check("deterministic: same inputs ⇒ byte-identical result", JSON.stringify(D.decompose(parent, qValid)) === JSON.stringify(d));
  check("result + sub-missions are frozen", Object.isFrozen(d) && Object.isFrozen(d.subMissions[0]));
  check("contract: SEMANTIC-qualification + no-fabrication + final-act-gated + local-not-stalled invariants present", D.MISSION_DECOMPOSER_CONTRACT.invariants.some((i: string) => /SEMANTIC qualification/.test(i)) && D.MISSION_DECOMPOSER_CONTRACT.invariants.some((i: string) => /no fabricated completion/.test(i)) && D.MISSION_DECOMPOSER_CONTRACT.invariants.some((i: string) => /never auto-completed/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — mission-decomposer (V285 direct contract tests: V82 qualify semantics [VALID vs INSUFFICIENT/ABSENT], boolean evidence flags, needsSignOff default vs false, external-execution level-C gating, legacy control modes, invalid-input handling, stable parent-linked ids, determinism + freeze; real component, complements v81 not duplicates decomposition-planner)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
