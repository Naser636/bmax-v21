#!/usr/bin/env node
"use strict";

/*
 * V12.4 CONSOLIDATION (addendum V2 §5 — single directing roadmap). PURE, deterministic. Verifies that V12.4 is the
 * SOLE directing roadmap and that every program/extension (V5 Master Technological Superiority, FIED, Engineering
 * Intelligence, Radar, RCE, Frontier Lab, Compounding, the 15 métiers) is INTEGRATED into it as a section/domain/phase/
 * mission — NOT a concurrent roadmap. It reconciles requirements to their canonical location (register id / manifest
 * mission / matrix section) so NO requirement, decision, or validated work is lost: an unmapped requirement is an
 * ORPHAN (flagged, never dropped). Old documents remain accessible as ARCHIVES, not concurrent roadmaps. Fail-closed:
 * directeur ≠ V12.4, a concurrent/un-integrated program, or an orphan requirement ⇒ NOT consolidated. It reuses the
 * existing manifest/register (no new system, §4 anti-gas-factory); it verifies/reports and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

/** consolidate({ directeur, programs }) -> { singleSource, consolidated, conflicts, reasons }. */
function consolidate(input: any): any {
  const o = isObj(input) ? input : {};
  const directeur = o.directeur;
  const programs = arr(o.programs).filter(isObj);
  const conflicts: any[] = []; const consolidated: any[] = [];

  if (directeur !== "V12.4") conflicts.push({ what: "directeur", detail: `directing roadmap is '${directeur}', must be V12.4 (single source)` });
  for (const p of programs) {
    const integrated = isStr(p.integratedInto) && /V12\.4/.test(p.integratedInto);
    const concurrent = p.concurrent === true;
    if (!integrated || concurrent) conflicts.push({ program: p.name, detail: concurrent ? "declares itself a concurrent roadmap ⇒ CONFLICT" : "not integrated into V12.4 ⇒ CONFLICT" });
    else consolidated.push({ name: p.name, integratedInto: p.integratedInto, status: p.status || "INTEGRATED" });
  }

  const singleSource = directeur === "V12.4" && conflicts.length === 0;
  return Object.freeze({
    singleSource, directeur: directeur || null,
    consolidated: Object.freeze(consolidated), conflicts: Object.freeze(conflicts),
    reasons: Object.freeze(singleSource ? [`V12.4 is the single directing roadmap; ${consolidated.length} program(s) integrated as sections/phases/missions (no concurrent roadmap)`] : conflicts.map((c) => c.detail)),
  });
}

/** reconcile({ requirements }) -> { allCovered, covered, orphans, coverage }. An unmapped requirement is an ORPHAN (never dropped). */
function reconcile(input: any): any {
  const o = isObj(input) ? input : {};
  const reqs = arr(o.requirements).filter(isObj);
  const covered = reqs.filter((r) => isStr(r.canonicalLocation));
  const orphans = reqs.filter((r) => !isStr(r.canonicalLocation)).map((r) => (isStr(r.id) ? r.id : "unnamed"));
  const allCovered = reqs.length > 0 && orphans.length === 0;
  return Object.freeze({
    allCovered, total: reqs.length, coveredCount: covered.length,
    orphans: Object.freeze(orphans),
    coverage: reqs.length > 0 ? Number((covered.length / reqs.length).toFixed(4)) : 0,
    note: orphans.length > 0 ? `${orphans.length} ORPHAN requirement(s) with no canonical location — must be PLACED under V12.4, never dropped (fail-closed)` : "every requirement maps to a canonical location (register/manifest/matrix)",
  });
}

const ROADMAP_CONSOLIDATION_CONTRACT = Object.freeze({
  id: "V124-ROADMAP-CONSOLIDATION",
  source: "ODG addendum V2 §5 — single directing roadmap V12.4 (consolidation of all programs)",
  reuses: Object.freeze(["master-technological-superiority-program.json manifest (programs declare directeur V12.4)", "closure-register (requirement → canonical location)", "no new system (§4 anti-gas-factory)"]),
  notAuthority: "verifies the single-source consolidation + reconciliation; it builds no concurrent roadmap and grants no authority",
  invariants: Object.freeze([
    "V12.4 is the SINGLE directing roadmap; every program/extension is integrated as a section/domain/phase/mission, not a concurrent roadmap",
    "a program that declares itself concurrent, or does not integrate into V12.4, ⇒ CONFLICT (not consolidated)",
    "every requirement must map to a canonical location (register/manifest/matrix); an unmapped requirement is an ORPHAN — flagged, NEVER dropped",
    "old documents remain accessible as ARCHIVES, not concurrent roadmaps",
    "pure/deterministic: programs + requirements in → consolidation verdict out; no clock/random/network; reuses existing (no new system)",
  ]),
});

module.exports = { consolidate, reconcile, ROADMAP_CONSOLIDATION_CONTRACT };

if (require.main === module) {
  const c = consolidate({ directeur: "V12.4", programs: [{ name: "V5 Master", integratedInto: "V12.4" }, { name: "FIED", integratedInto: "V12.4 + V5" }, { name: "Engineering Intelligence", integratedInto: "V12.4 + V5" }] });
  process.stdout.write(JSON.stringify({ ...ROADMAP_CONSOLIDATION_CONTRACT, demo: { singleSource: c.singleSource, consolidated: c.consolidated.length } }, null, 2) + "\n");
}

export {};
