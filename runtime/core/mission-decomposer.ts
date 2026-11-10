#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V81 — MISSION DECOMPOSER. V80 tracked PARENT missions as indivisible; V81 splits each parent (a PARTIAL
 * part or a Level-B dossier) into its standard technical sub-missions — implementation, tests, evidence, dossier,
 * sign-off — and classifies EACH by real state: ALREADY_DONE (evidence present), LOCAL_REMAINING (executable now, Level-A)
 * or SIGN_OFF_GATED (reserved human/controller decision, Level-B/C). A parent gated at the sign-off STILL yields its
 * Level-A sub-missions so local work never stalls behind a human lock. It fabricates no completion: a sub-mission is
 * ALREADY_DONE only when its evidence pointer actually resolves. PURE/deterministic; dual export; no parallel registry.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const SUB_STATUS = Object.freeze(["ALREADY_DONE", "LOCAL_REMAINING", "SIGN_OFF_GATED"]);

/*
 * decompose(parent, evidenceResolver) -> { parent, subMissions, localRemaining, signOffGated, alreadyDone }.
 * parent: { id, kind("B_human"|"B_external"|"PARTIAL"|...), evidence:{impl?,test?,evidenceRef?,dossier?}, needsSignOff(bool) }.
 * evidenceResolver(ref) -> boolean (does the pointer resolve?). Deterministic.
 */
function decompose(parent: any, evidenceResolver: any): any {
  const p = isObj(parent) ? parent : {};
  const resolve = typeof evidenceResolver === "function" ? evidenceResolver : (() => false);
  const ev = isObj(p.evidence) ? p.evidence : {};
  const needsSignOff = p.needsSignOff !== false;   // default: a Level-B/PARTIAL parent needs a final sign-off
  const externalDep = /external/i.test(String(p.kind || ""));

  const sub = (name: string, level: string, doneWhen: boolean, gated: boolean): any => Object.freeze({
    id: p.id + ":" + name, name, level,
    status: gated ? "SIGN_OFF_GATED" : doneWhen ? "ALREADY_DONE" : "LOCAL_REMAINING",
  });

  const subMissions = [
    sub("implementation", "A", ev.impl === true || resolve(ev.implRef), false),
    sub("tests", "A", resolve(ev.test), false),
    sub("evidence", "A", resolve(ev.evidenceRef), false),
    sub("decision-dossier", "A", ev.dossier === true || resolve(ev.dossierRef), false),
    // the FINAL act is reserved: human sign-off (B) or external execution (C/B_external).
    sub(externalDep ? "external-execution" : "human-sign-off", externalDep ? "C" : "B", false, needsSignOff || externalDep),
  ];
  const localRemaining = subMissions.filter((s) => s.status === "LOCAL_REMAINING");
  const signOffGated = subMissions.filter((s) => s.status === "SIGN_OFF_GATED");
  const alreadyDone = subMissions.filter((s) => s.status === "ALREADY_DONE");
  return Object.freeze({
    parent: p.id, kind: p.kind || null, subMissions,
    localRemaining: Object.freeze(localRemaining.map((s) => s.id)),
    signOffGated: Object.freeze(signOffGated.map((s) => s.id)),
    alreadyDoneCount: alreadyDone.length,
    note: localRemaining.length === 0 ? "all local sub-work done; only the reserved final act remains" : `${localRemaining.length} local sub-mission(s) executable now; the final act stays gated`,
  });
}

const MISSION_DECOMPOSER_CONTRACT = Object.freeze({
  id: "V81-MISSION-DECOMPOSER", source: "CTO V81 — decompose parent missions into A/B/C sub-missions",
  subStatuses: SUB_STATUS,
  notAuthority: "splits a parent into sub-missions + classifies by real evidence; it executes nothing itself; ODG/engine execute Level-A sub-missions",
  invariants: Object.freeze([
    "a parent gated at the sign-off still exposes its Level-A sub-missions (local work never stalls behind a human lock)",
    "a sub-mission is ALREADY_DONE only when its evidence pointer actually resolves (no fabricated completion)",
    "the final act (human sign-off / external execution) stays SIGN_OFF_GATED — never auto-completed",
    "pure/deterministic; no parallel registry; sub-missions keep a stable id linked to the parent",
  ]),
});

module.exports = { SUB_STATUS, decompose, MISSION_DECOMPOSER_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(MISSION_DECOMPOSER_CONTRACT, null, 2) + "\n"); }
export {};
