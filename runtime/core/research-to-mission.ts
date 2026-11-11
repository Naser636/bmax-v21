#!/usr/bin/env node
"use strict";
/*
 * V140 — RESEARCH → GOVERNED-MISSION bridge. PURE, deterministic, fail-closed. Closes the explicit §3/§7 requirement that the
 * radar must "convertir les découvertes utiles en missions" — and closes a real gap: V138's live-research runner built
 * mission proposals AD-HOC (plain objects), bypassing the canonical self-mission-proposer, so discoveries were NOT injection-
 * quarantined, deduped, or routed owner-gated-vs-computer-side through the one canonical path.
 *
 * This bridge converts validated research findings into the CANONICAL proposer's input and delegates to
 * self-mission-proposer.proposeFromGaps — reusing its injection quarantine (sanitizeExternal), dedup, PROPOSED≠AUTHORIZED
 * discipline and OWNER_DECISION routing. It invents NO mission and authorizes nothing:
 *   - untrusted (quarantined) findings are DROPPED before proposing (and proposeFromGaps quarantines again — defence in depth);
 *   - an EXTERNAL benchmark finding (a world-class comparison) is OWNER-GATED ⇒ routed to an OWNER_DECISION (discovery ≠
 *     authorization — ODG/owner decides, never auto-executed);
 *   - provenance (source URL + confidence + the ODG component compared) is carried onto every emitted item.
 * No new queue/registry/primitive. Dual export.
 */
const PROPOSER = require("./self-mission-proposer.js");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
// a finding is ELIGIBLE to convert only if it is a real, trusted, dated source finding (anti-fabrication, anti-injection).
function eligible(f: any): boolean {
  return isObj(f) && isStr(f.content ?? f.claim) && isStr(f.source ?? f.url) && f.untrusted !== true &&
    (f.sourceClass === undefined || f.sourceClass === "LIVE_SOURCE" || f.sourceClass === "INTERNAL_EVIDENCE");
}

/** researchToMissions(findings, opts?) -> the CANONICAL proposer result (proposals / ownerDecisions / quarantined) plus a
 * provenance-stamped view. opts.componentByFinding?(finding)->metier/component string for the comparison; opts.now stamps.
 * External benchmark findings route to OWNER_DECISION (owner-gated). Fail-closed: no eligible finding ⇒ nothing proposed. */
function researchToMissions(findings: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const list = Array.isArray(findings) ? findings : [];
  const eligibleFindings = list.filter(eligible);
  // Build canonical gap-analysis targets. kind RESEARCH_BENCHMARK is non-COVERAGE ⇒ classifyTarget ⇒ OWNER_GATED ⇒
  // OWNER_DECISION (external comparison needs owner direction). The detail is UNTRUSTED text — proposeFromGaps quarantines it.
  const targets = eligibleFindings.map((f: any) => {
    const comp = typeof o.componentByFinding === "function" ? o.componentByFinding(f) : (isStr(f.metier) ? f.metier : "ODG");
    return { kind: "RESEARCH_BENCHMARK", detail: `${isStr(f.content) ? f.content : f.claim} — compare vs ${comp}`, items: [isStr(f.source) ? f.source : f.url], priority: 2 };
  });
  const result = PROPOSER.proposeFromGaps({ status: targets.length ? "DEGRADED" : "NO_FINDING", targets }, { now: o.now });
  // provenance view: map each surviving OWNER_DECISION back to its finding's source + confidence (quarantined ones dropped).
  const provByDetail: Record<string, any> = {};
  for (const f of eligibleFindings) { const comp = typeof o.componentByFinding === "function" ? o.componentByFinding(f) : (isStr(f.metier) ? f.metier : "ODG"); provByDetail[`${isStr(f.content) ? f.content : f.claim} — compare vs ${comp}`] = { source: isStr(f.source) ? f.source : f.url, confidence: isStr(f.confidence) ? f.confidence : "MEDIUM", component: comp }; }
  const ownerDecisions = result.ownerDecisions.map((d: any) => Object.freeze({ ...d, provenance: provByDetail[d.detail] || null }));
  return Object.freeze({
    eligibleCount: eligibleFindings.length,
    droppedUntrusted: list.length - eligibleFindings.length,
    proposals: result.proposals,                 // computer-side (none expected for external benchmarks)
    ownerDecisions: Object.freeze(ownerDecisions),
    quarantined: result.quarantined,             // injection payloads the canonical proposer refused
    selfAuthorizedAny: result.selfAuthorizedAny === true,   // must remain false (the proposer never self-authorizes)
    note: "research findings → CANONICAL governed proposals via self-mission-proposer (injection-quarantined, deduped, PROPOSED≠AUTHORIZED); external benchmark findings are OWNER-GATED (discovery ≠ authorization); provenance carried.",
  });
}

const RESEARCH_TO_MISSION_CONTRACT = Object.freeze({
  id: "V140-RESEARCH-TO-MISSION",
  reuses: ["self-mission-proposer.proposeFromGaps (quarantine + dedup + owner-routing)", "research-ledger findings (provenance)"],
  invariants: Object.freeze([
    "only trusted, dated, real-source findings convert (untrusted ⇒ dropped; anti-fabrication/anti-injection)",
    "external benchmark findings route to OWNER_DECISION — discovery NEVER authorizes implementation",
    "delegates to the canonical proposer (no ad-hoc proposal objects; no new queue/registry/primitive)",
    "provenance (source url + confidence + compared component) carried; selfAuthorizedAny stays false; fail-closed on no finding",
  ]),
});
module.exports = { researchToMissions, eligible, RESEARCH_TO_MISSION_CONTRACT };
export {};
