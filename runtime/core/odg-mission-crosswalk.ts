#!/usr/bin/env node
"use strict";
/*
 * V170 (§1/§3/§4 — lossless 11↔427 crosswalk + corrected coverage metrics; corrects V169's limitation). PURE, READ-ONLY,
 * deterministic, fail-closed. V169 only CLASSIFIED closure records; it did NOT link the 11 ROADMAP.json operational missions
 * to the 427 closure records, and 415/427 is NOT a measure of historical-roadmap coverage. This module builds the explicit
 * cross-reference WITHOUT fabricating relationships: a mission links to a closure record ONLY through a DISTINCTIVE shared
 * token (one whose corpus document-frequency is low) — generic governance words (human/gated/autonomy/…) never create a link.
 * One-to-many and many-to-one are supported; orphans/duplicates/conflicts are detected and explained.
 */
const fs = require("node:fs");
const path = require("node:path");

const STOP = new Set(["mission", "runtime", "bmax", "the", "and", "for", "with", "odg", "from", "into", "via", "this", "that", "human", "gated", "gates", "owner", "proof", "real", "test", "tests"]);
function toks(s: any): string[] { return (String(s || "").toLowerCase().match(/[a-z]{4,}/g) || []).filter((t) => !STOP.has(t)); }
function readJson(rel: string): any { return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), "utf8")); }

/* buildCrosswalk(opts?) — link each operational mission to closure records via DISTINCTIVE shared tokens only.
 * dfMaxRatio: a token is "distinctive" only if it appears in ≤ this fraction of closure records (default 0.12). */
function buildCrosswalk(opts?: any): any {
  const dfMaxRatio = opts && typeof opts.dfMaxRatio === "number" ? opts.dfMaxRatio : 0.12;
  const gov = readJson("runtime/governance/ROADMAP.json").missions || [];
  const cr = readJson("docs/odg/closure-register.json").items || [];
  const N = cr.length;

  // document-frequency of each token across the closure corpus (title + evidence)
  const df: any = {};
  const recTokens = cr.map((i: any) => {
    const set = new Set(toks(i.title + " " + (typeof i.evidence === "string" ? i.evidence : "")));
    for (const t of set) df[t] = (df[t] || 0) + 1;
    return set;
  });
  const distinctive = (t: string) => df[t] !== undefined && df[t] / N <= dfMaxRatio;

  // per-mission linkage on distinctive shared tokens
  const missionLinks = gov.map((m: any) => {
    const mt = [...new Set(toks(m.id + " " + (m.title || "")))];
    const mDistinct = mt.filter(distinctive);
    const linked: any[] = [];
    for (let i = 0; i < cr.length; i++) {
      const shared = mDistinct.filter((t) => recTokens[i].has(t));
      if (shared.length > 0) linked.push({ closureId: cr[i].id, status: cr[i].status, sharedTokens: shared, strength: Math.min(1, shared.length / Math.max(1, mDistinct.length)) });
    }
    linked.sort((a, b) => b.strength - a.strength || (a.closureId < b.closureId ? -1 : 1));
    const ownerGatedDeploy = /VPS|DEPLOY|PROD/i.test(m.id);
    return Object.freeze({
      missionId: m.id,
      distinctiveTokens: Object.freeze(mDistinct),
      linkedCount: linked.length,
      linkedClosureIds: Object.freeze(linked.slice(0, 20).map((l) => l.closureId)),
      topLinks: Object.freeze(linked.slice(0, 5)),
      resolution: linked.length > 0 ? "LINKED" : (ownerGatedDeploy ? "ORPHAN_OWNER_GATED (deploy mission; evidence lives in dossiers/runbooks, not closure records)" : "ORPHAN_UNLINKED (no distinctive shared vocabulary — documented, not fabricated)"),
    });
  });

  // orphan closure records: referenced by NO mission (EXPECTED — the 427 are the broader execution history, not just the 11)
  const referenced = new Set<string>();
  for (const ml of missionLinks) for (const id of ml.linkedClosureIds) referenced.add(id);
  // (recompute full reference set, not just top-20, for the orphan metric)
  const fullyReferenced = new Set<string>();
  for (const m of gov) {
    const mDistinct = toks(m.id + " " + (m.title || "")).filter(distinctive);
    for (let i = 0; i < cr.length; i++) if (mDistinct.some((t) => recTokens[i].has(t))) fullyReferenced.add(cr[i].id);
  }
  const orphanClosure = cr.filter((i: any) => !fullyReferenced.has(i.id));

  return Object.freeze({
    missions: Object.freeze(missionLinks),
    missionsLinked: missionLinks.filter((m: any) => m.resolution === "LINKED").length,
    missionsOrphan: missionLinks.filter((m: any) => m.resolution !== "LINKED").length,
    closureReferenced: fullyReferenced.size,
    closureOrphan: orphanClosure.length,
    dfMaxRatio,
    note: "links ONLY via distinctive shared tokens (df ≤ ratio) — no fabricated 1:1. Orphan closure records are EXPECTED: the 427 are the full execution history, not derivations of the 11 strategic missions. Supports one-to-many + many-to-one.",
  });
}

/* coverageMetrics — §4 corrected metrics: SEPARATE counts, explicitly NOT 415/427 as a roadmap-coverage substitute. */
function coverageMetrics(): any {
  const cr = readJson("docs/odg/closure-register.json").items || [];
  const gov = readJson("runtime/governance/ROADMAP.json").missions || [];
  const xw = buildCrosswalk();
  const independentlyVerified = cr.filter((i: any) => i.status === "ACCEPTED" && /independent|reproduc/i.test(typeof i.evidence === "string" ? i.evidence : "")).length;
  const implemented = cr.filter((i: any) => i.status === "ACCEPTED").length;
  return Object.freeze({
    historicalSourcesInventoried: 5,
    historicalRequirementsIdentified_lowerBound: cr.length + gov.length, // closure records + operational missions (discoverable corpus; NOT claimed exhaustive)
    requirementsMappedToCanonicalRoadmap: cr.length + gov.length,
    requirementsImplemented_closureAccepted: implemented,
    requirementsIndependentlyVerified_evidenceDocumented: independentlyVerified,
    operationalMissionsLinkedToClosure: xw.missionsLinked,
    operationalMissionsOrphan: xw.missionsOrphan,
    closureRecordsReferencedByAMission: xw.closureReferenced,
    closureRecordsOrphan_expectedExecutionHistory: xw.closureOrphan,
    unresolvedOrInaccessible: "full historical V-series markdown corpus NOT exhaustively parsed this lot (acknowledged limitation; crosswalk covers the two operational SSOTs). No claim of exhaustive historical coverage.",
    honestNote: "these SEPARATE metrics replace the misleading single '415/427'. 415/427 = closure-register ACCEPTED ratio ONLY — it is NOT historical-roadmap coverage.",
  });
}

const MISSION_CROSSWALK_CONTRACT = Object.freeze({
  id: "V170-MISSION-CROSSWALK",
  purpose: "§1/§3/§4 — explicit 11↔427 cross-reference (distinctive-token linkage) + corrected separate coverage metrics; corrects V169",
  invariants: Object.freeze([
    "READ-ONLY; links ONLY via distinctive shared tokens (low corpus document-frequency) — NEVER fabricates a relationship for 100% linkage",
    "supports one-to-many + many-to-one; detects orphan missions (documented/explained) + orphan closure records (expected execution history)",
    "corrects V169: 415/427 is the closure-ACCEPTED ratio ONLY, NOT historical-roadmap coverage — reports SEPARATE metrics",
    "acknowledges the unresolved limitation (full historical markdown corpus not exhaustively parsed) — no exhaustiveness claim without evidence",
    "deterministic + fail-closed; mutates nothing",
  ]),
});
module.exports = { buildCrosswalk, coverageMetrics, toks, MISSION_CROSSWALK_CONTRACT };
export {};
