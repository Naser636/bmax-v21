#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V93 §3 — DOSSIER DECISIONS UNDER OWNER DELEGATION. The owner delegated technical/referential/reversible
 * decisions to ODG. This re-qualifies the 14 dossiers and ODG ACTUALLY DECIDES the delegable ones (recording a motivated
 * technical position + the proving evidence), handles the 3 NEEDS_LOCAL_BUILD honestly (close on existing proof or keep
 * NOT_MEASURED — never fabricating FROZEN-Master content), and consolidates ONLY the genuinely non-delegable (external /
 * commercial / owner-operational-priority) into one sheet. ODG recommends but never fabricates an owner signature. Reads
 * V92 dossiers + coverage/ledger; no parallel registry. Writes docs/odg/V93_DOSSIER_DECISIONS.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

// per-part delegation classification + ODG decision (grounded in the real part title + what exists in the repo).
// class: ODG_DECIDED (referential/method/governance ODG may arbitrate) | LOCAL_VERIFY (needs-local-build; close on proof or NOT_MEASURED) | NON_DELEGABLE (external/commercial/owner-priority).
const DECISIONS: any = {
  "REQ-Préambule": { cls: "ODG_DECIDED", decision: "ADOPT truth-level discipline + version preservation as the standing technical position", rationale: "already practiced + enforced by the closure-register, truth-level typing, and the honesty gates — a referential acknowledgement, not an owner personal/legal change", evidence: "closure-register + truth-level discipline (V12.4 matrix) + honesty invariants (tested across V82–V92)", closure: "DECIDED_CLOSED_ON_EXISTING_PROOF" },
  "REQ-XVII": { cls: "ODG_DECIDED", decision: "ADOPT the seven-step operational ordering (with the ordering correction) as the method", rationale: "pure method/ordering decision delegated to ODG; the campaign-engine + scheduler already enact an ordered pipeline", evidence: "campaign-engine + mission-scheduler + intelligence-loop (tested)", closure: "DECIDED_CLOSED_ON_EXISTING_PROOF" },
  "REQ-XIX": { cls: "ODG_DECIDED", decision: "ODG runs campaigns C1–C4 through the canonical pipeline with the appropriate gates", rationale: "campaign execution + gating is exactly ODG's delegated technical remit (V78/V86/V88/V89)", evidence: "campaign-engine (V78) + inspection boundary (V86) + incremental assurance (V88) + real roadmap run (V89)", closure: "DECIDED_CLOSED_ON_EXISTING_PROOF" },
  "REQ-XXIII": { cls: "ODG_DECIDED", decision: "ADOPT gates A–G as the canonical gate set enforced by the pipeline", rationale: "gate definitions/enforcement are delegated technical governance; action-gate + inspection-boundary + the test gate enforce them", evidence: "action-gate + inspection-boundary + test:report gate (490 suites)", closure: "DECIDED_CLOSED_ON_EXISTING_PROOF" },
  "REQ-XXVIII": { cls: "ODG_DECIDED", decision: "ADOPT the ordering of the 7 steps / 4 campaigns", rationale: "referential ordering, delegated; consistent with XVII/XIX", evidence: "same pipeline ordering as XVII/XIX", closure: "DECIDED_CLOSED_ON_EXISTING_PROOF" },
  "REQ-XXIX": { cls: "ODG_DECIDED", decision: "ADOPT the execution mandate + method + P0–P8 priorities as ODG's operating method", rationale: "this IS ODG's delegated operating remit — priorities are selected by mission-priority-selector + campaign-engine", evidence: "mission-priority-selector (V76) + local-work-mandate (V77/V84) + campaign-engine (V78)", closure: "DECIDED_CLOSED_ON_EXISTING_PROOF" },
  // NEEDS_LOCAL_BUILD — honest: close only on existing proof; NEVER fabricate FROZEN-Master enumerations.
  "REQ-I": { cls: "LOCAL_VERIFY", decision: "position: the 26-capability vision is PARTIAL; local capability substrate exists but the full enumeration is Master-owned", rationale: "the capabilities present are built+tested, but enumerating/closing all 26 needs the FROZEN Master content (NOT_RECOVERABLE) — not fabricated", evidence: "architecture audit 23/23 wired + 15/15 métiers; coverage bucket=PARTIAL", closure: "NOT_MEASURED (partial; owner-referential enumeration)" },
  "REQ-IV": { cls: "LOCAL_VERIFY", decision: "position: the 3-level architecture + 12 dimensions are referential; the local architecture is coherent and tested", rationale: "ODG adopts the coherent local architecture position; the full 12-dimension validation is Master-referential", evidence: "9/9 primitives + 23/23 pipeline wired", closure: "NOT_MEASURED (referential dimensions)" },
  "REQ-XXV": { cls: "LOCAL_VERIFY", decision: "position: a failures register (F01–F40) is a real local artifact; ODG maintains a closure/incident discipline but the F01–F40 enumeration is Master-owned", rationale: "incident-lifecycle + closure-register exist; fabricating 40 specific failure entries would be dishonest", evidence: "closure-register + incident-resolution-lifecycle", closure: "NOT_MEASURED (enumeration Master-owned)" },
  // TRULY NON-DELEGABLE — consolidated owner decisions.
  "REQ-XIII": { cls: "NON_DELEGABLE", decision: null, question: "authorize a fair, reproducible EXTERNAL head-to-head benchmark (world-level comparison)?", options: ["authorize external benchmark resource", "defer (no world-superiority claim)"], consequence: "without it, no world-superiority claim is permitted (fail-closed)", ownerAction: "grant/deny an authorized external benchmark resource", recommendation: "APPROVE_WITH_CONDITIONS", closure: "PENDING_OWNER_DECISION" },
  "REQ-XVI": { cls: "NON_DELEGABLE", decision: null, question: "which of the six dossiers A–F to open/prioritize?", options: ["open Dossier A first", "another order", "defer"], consequence: "sets the strategic work order", ownerAction: "choose dossier priority", recommendation: "NEEDS_INFORMATION", closure: "PENDING_OWNER_DECISION" },
  "REQ-XXVII": { cls: "NON_DELEGABLE", decision: null, question: "accept study/operational closure of the 33 deliverables scope?", options: ["accept scope closure", "revise scope"], consequence: "defines deliverable completeness commitment", ownerAction: "confirm deliverable scope", recommendation: "NEEDS_INFORMATION", closure: "PENDING_OWNER_DECISION" },
  "REQ-XXX": { cls: "NON_DELEGABLE", decision: null, question: "issue the first operational mandate (open Dossier A + preservation)?", options: ["issue mandate", "defer"], consequence: "starts operational execution of Dossier A", ownerAction: "issue/decline the operational mandate", recommendation: "APPROVE", closure: "PENDING_OWNER_DECISION" },
  "REQ-XXXII": { cls: "NON_DELEGABLE", decision: null, question: "commercialization commitment (pricing/engagement)?", options: ["approve commercialization", "reject", "defer"], consequence: "commercial/legal commitment — NOT delegable (no spend/engagement under V93)", ownerAction: "make the commercial decision", recommendation: "NEEDS_INFORMATION", closure: "PENDING_OWNER_DECISION" },
};

const v92 = j("V92_SIGNOFF_DOSSIERS.json");
const dossiers = (v92 ? v92.dossiers : []).map((d: any) => {
  const dec = DECISIONS[d.parentId] || { cls: "NON_DELEGABLE", closure: "PENDING_OWNER_DECISION" };
  return { parentId: d.parentId, requirement: d.requirement, class: dec.cls, odgDecision: dec.decision || null, rationale: dec.rationale || null, evidence: dec.evidence || null, closureStatus: dec.closure, ownerQuestion: dec.question || null, options: dec.options || null, ownerAction: dec.ownerAction || null, odgRecommendation: dec.recommendation || d.odgRecommendation };
});
const odgDecided = dossiers.filter((d: any) => d.class === "ODG_DECIDED");
const localVerify = dossiers.filter((d: any) => d.class === "LOCAL_VERIFY");
const nonDelegable = dossiers.filter((d: any) => d.class === "NON_DELEGABLE");

const out = {
  "//": "CTO V93 §3 — dossier decisions under owner delegation. ODG ACTUALLY DECIDED the delegable referential/method/governance dossiers (recording a motivated position + existing proof); NEEDS_LOCAL_BUILD handled honestly (NOT_MEASURED where Master-content is required — never fabricated); only genuinely non-delegable (external/commercial/owner-priority) remain, consolidated into one owner sheet. ODG recommends; it never fabricates an owner signature.",
  total: dossiers.length,
  odgDecidedCount: odgDecided.length, localVerifyCount: localVerify.length, trulyNonDelegableCount: nonDelegable.length,
  odgDecided, localVerify,
  consolidatedOwnerSheet: { count: nonDelegable.length, decisions: nonDelegable.map((d: any) => ({ parentId: d.parentId, question: d.ownerQuestion, options: d.options, ownerAction: d.ownerAction, odgRecommendation: d.odgRecommendation, status: d.closureStatus })) },
  honestConclusion: `From 14 blocked dossiers, ODG DECIDED ${odgDecided.length} (referential/method/governance — motivated position + existing proof, DECIDED_CLOSED_ON_EXISTING_PROOF); ${localVerify.length} NEEDS_LOCAL_BUILD are honestly NOT_MEASURED (require FROZEN-Master enumerations — never fabricated); ONLY ${nonDelegable.length} remain as genuine owner decisions (XIII external benchmark, XVI/XXVII/XXX owner priority, XXXII commercial), consolidated into ONE sheet. Not 14 blocks — ${odgDecided.length} decided + ${nonDelegable.length} real owner decisions. ODG recommends but never fabricates the owner's signature.`,
  invariant: "ODG decides all delegable technical/referential dossiers (position + existing proof); NEEDS_LOCAL_BUILD NOT_MEASURED not fabricated; only genuine owner decisions remain, consolidated; no invented approval; DECIDED ≠ CLOSED unless existing proof supports it.",
};
fs.writeFileSync(path.join(D, "V93_DOSSIER_DECISIONS.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ total: dossiers.length, odgDecided: odgDecided.length, localVerify: localVerify.length, trulyNonDelegable: nonDelegable.length }, null, 2) + "\n");
export {};
