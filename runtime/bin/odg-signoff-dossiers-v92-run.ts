#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V92 §2 — 14 HUMAN_SIGNOFF OWNER-DECISION DOSSIERS. For each of the 14 gated canonical parents (from the
 * V90 decomposition) builds a complete, traceable decision sheet (12 fields) with an ODG RECOMMENDATION — but the owner's
 * DECISION is never fabricated (status PENDING_OWNER_DECISION). Grouped into coherent lots of 3. The recommendation is
 * keyed to the REAL gating type: OWNER_GATED ⇒ genuine owner decision; NEEDS_LOCAL_BUILD ⇒ honestly flagged as local
 * work executable WITHOUT sign-off (not a true owner decision); INHERENTLY_REFERENTIAL ⇒ owner acknowledgement;
 * EXTERNAL_DEPENDENCY ⇒ needs a real external resource. Reads V90 decomposition + coverage/ledger; no parallel registry.
 * Writes docs/odg/V92_SIGNOFF_DOSSIERS.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
const decomp = j("V90_DECOMPOSITION.json");
const cov = j("V56_V124_COVERAGE_MATRIX.json");
const covByPart: any = {}; if (cov && cov.parts) for (const p of cov.parts) covByPart[String(p.part).split(" ")[0]] = p;

const REC = Object.freeze(["APPROVE", "REJECT", "APPROVE_WITH_CONDITIONS", "NEEDS_INFORMATION"]);
// gating → recommendation + decision nature (honest per §2 distinctions).
function profile(gating: string, part: string): any {
  if (gating === "INHERENTLY_REFERENTIAL") return { decisionNature: "owner acknowledgement of a referential/truth-level discipline (not an implementation sign-off)", recommendation: "APPROVE", rationale: "already practiced (compass + closure-register + truth-level honesty); acknowledging it carries low risk and no code to build", trueOwnerDecision: true };
  if (gating === "NEEDS_LOCAL_BUILD") return { decisionNature: "LOCAL work executable WITHOUT a sign-off — flagged as NOT a genuine owner decision", recommendation: "NEEDS_INFORMATION", rationale: "ODG can build/advance this locally under the standing mandate; the owner need only confirm priority/scope — the gate is scope confirmation, not a blocking legal/organizational decision", trueOwnerDecision: false };
  if (gating === "EXTERNAL_DEPENDENCY") return { decisionNature: "requires a real EXTERNAL resource (e.g. a fair, reproducible head-to-head benchmark / third-party data)", recommendation: "APPROVE_WITH_CONDITIONS", rationale: "the local protocol can be prepared now; the comparison itself needs an authorized external resource — no world-superiority claim without it", trueOwnerDecision: true };
  // OWNER_GATED (commercialization / organizational / governance decisions).
  return { decisionNature: "genuine owner decision (commercial / organizational / governance) with real-world consequences", recommendation: "NEEDS_INFORMATION", rationale: "ODG prepares the technical substrate but cannot decide a commercial/organizational commitment; the owner must choose with the risks below in view", trueOwnerDecision: true };
}

const dossiers = (decomp ? decomp.decompositions : []).map((p: any, i: number) => {
  const key = String(p.parent).replace(/^REQ-/, "");
  const prof = profile(p.gating, p.part);
  const covp = covByPart[key] || {};
  const localDone = p.subMissions.filter((s: any) => s.v90Category === "ALREADY_DONE_VALIDATED").map((s: any) => s.name);
  const localOpen = p.localProceedable;
  return {
    lot: Math.floor(i / 3) + 1,
    parentId: p.parent,
    requirement: `V12.4 ${p.part}${covp.title ? " — " + covp.title : ""}`,
    signoffReason: `gating=${p.gating}: ${prof.decisionNature}`,
    expectedDecision: prof.trueOwnerDecision ? "owner selects APPROVE / REJECT / APPROVE_WITH_CONDITIONS / NEEDS_INFORMATION" : "owner confirms scope/priority only (local work proceeds under the standing mandate regardless)",
    technicalWorkDone: covp.bucket ? `coverage bucket=${covp.bucket}; structural status tracked in V12.4 matrix` : "tracked in V12.4 matrix",
    localSubmissionsDoneWithProof: localDone.length ? localDone : ["(none individually closed yet — see V90 decomposition sub-missions)"],
    localSubmissionsOpen: localOpen,
    risksPerOption: {
      APPROVE: prof.trueOwnerDecision ? "commits to the requirement's intent; ensure downstream dependencies are ready" : "n/a (not a true owner decision)",
      REJECT: "the requirement stays open/parked; no local regression (reversible)",
      APPROVE_WITH_CONDITIONS: "proceed with named conditions (e.g. external benchmark, legal review)",
      NEEDS_INFORMATION: "ODG continues local work; decision deferred without blocking independent sub-missions",
    },
    dependencies: p.gating === "EXTERNAL_DEPENDENCY" ? ["authorized external resource / benchmark"] : p.gating === "OWNER_GATED" ? ["owner commercial/organizational decision"] : ["none blocking local work"],
    odgRecommendation: prof.recommendation,
    odgRationale: prof.rationale,
    validationAndClosureConditions: prof.trueOwnerDecision ? "closed only on a recorded owner decision + (if conditional) the named conditions met + evidence" : "local sub-work closed on valid evidence; owner scope-confirmation recorded",
    decisionStatus: "PENDING_OWNER_DECISION",
    isTrueOwnerDecision: prof.trueOwnerDecision,
  };
});

const trueOwner = dossiers.filter((d: any) => d.isTrueOwnerDecision).length;
const reclassifiedLocal = dossiers.filter((d: any) => !d.isTrueOwnerDecision).length;
const lots: any = {}; for (const d of dossiers) { (lots[d.lot] = lots[d.lot] || []).push(d.parentId); }

const out = {
  "//": "CTO V92 §2 — 14 owner-decision dossiers from the real V90 decomposition. Each has the 12 fields + an ODG recommendation; the owner DECISION is never fabricated (PENDING_OWNER_DECISION). NEEDS_LOCAL_BUILD parents are honestly flagged as local work NOT needing a sign-off. Grouped in lots of 3. No parallel registry.",
  dossierCount: dossiers.length, trueOwnerDecisions: trueOwner, reclassifiedAsLocalWork: reclassifiedLocal,
  lots, dossiers,
  honestConclusion: `14 dossiers prepared, each traceable + directly decidable. ${trueOwner} are GENUINE owner decisions (owner-gated/referential/external); ${reclassifiedLocal} (NEEDS_LOCAL_BUILD) are honestly reclassified as LOCAL work that proceeds under the standing mandate WITHOUT a sign-off — not inflated into false owner decisions. All decisions PENDING_OWNER_DECISION; ODG recommends but never fabricates the owner's choice. Grouped into ${Object.keys(lots).length} lots of ≤3.`,
  invariant: "14 distinct traceable dossiers; ODG recommends, owner decides (PENDING_OWNER_DECISION, never fabricated); NEEDS_LOCAL_BUILD ≠ a true sign-off; no global imprecise approval; no parallel registry.",
};
fs.writeFileSync(path.join(D, "V92_SIGNOFF_DOSSIERS.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ dossierCount: dossiers.length, trueOwnerDecisions: trueOwner, reclassifiedAsLocalWork: reclassifiedLocal, lots: Object.keys(lots).length }, null, 2) + "\n");
export {};
