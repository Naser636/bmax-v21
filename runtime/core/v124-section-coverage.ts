#!/usr/bin/env node
"use strict";

/*
 * V12.4 Phase-3 — 122-SECTION COVERAGE + TWO-CTO-OUTPUTS FUSION VERIFIER. PURE, verifiable. Enumerates the structure
 * of the preserved V12.4 master roadmap (Préambule §1-§4 + 31 Parts, §1-§122) and PROVES, fail-closed, that every one
 * of the 122 sections is accounted for by exactly one structural block — no gap, no overlap, no silent drop (the CTO
 * directive's "aucun abandon silencieux d'une exigence"). It records the TWO CTO OUTPUTS being fused: the TARGET
 * (ODG_MASTER_ROADMAP_V12.4.md, owner-supplied requirement) and the REALITY (V12.4_SECTION_TRACEABILITY_MATRIX.md,
 * repo confrontation). It HONESTLY flags that if a DISTINCT second owner-supplied CTO source is meant, it is NOT in-
 * repo (NOT_RECOVERABLE — never fabricated). It builds NO third roadmap; the matrix stays the per-section status SSOT.
 * Dual export.
 */

// Préambule + 31 Parts, each [startSection, endSection] inclusive. Ranges read from ODG_MASTER_ROADMAP_V12.4.md index.
const BLOCKS = Object.freeze([
  { id: "Preambule", range: [1, 4], title: "Préambule — Objet/Statut de vérité/Préservation/Validation" },
  { id: "I", range: [5, 6], title: "Mission fondamentale" },
  { id: "II", range: [7, 8], title: "Invariants absolus" },
  { id: "III", range: [9, 15], title: "Autorité, G0, Root of Trust" },
  { id: "IV", range: [16, 20], title: "Architecture générale" },
  { id: "V", range: [21, 23], title: "Cycle cognitif & World Model" },
  { id: "VI", range: [24, 28], title: "Découverte scientifique/technologique" },
  { id: "VII", range: [29, 33], title: "Mémoire & apprentissage" },
  { id: "VIII", range: [34, 37], title: "Méta-intelligence & auto-amélioration" },
  { id: "IX", range: [38, 42], title: "Autonomie & missions persistantes" },
  { id: "X", range: [43, 46], title: "Quinze métiers" },
  { id: "XI", range: [47, 50], title: "Multi-agents & fournisseurs" },
  { id: "XII", range: [51, 56], title: "Ingénierie logicielle autonome" },
  { id: "XIII", range: [57, 61], title: "Expérimentation & benchmarks" },
  { id: "XIV", range: [62, 65], title: "Sécurité & résilience" },
  { id: "XV", range: [66, 70], title: "Observabilité & provenance" },
  { id: "XVI", range: [71, 76], title: "Six dossiers CTO" },
  { id: "XVII", range: [77, 79], title: "Sept étapes" },
  { id: "XVIII", range: [80, 82], title: "Préservation historique" },
  { id: "XIX", range: [83, 87], title: "Quatre campagnes" },
  { id: "XX", range: [88, 89], title: "Méthode de construction" },
  { id: "XXI", range: [90, 92], title: "Métriques & évaluation" },
  { id: "XXII", range: [93, 96], title: "Statuts & registres" },
  { id: "XXIII", range: [97, 103], title: "Gates de validation" },
  { id: "XXIV", range: [104, 104], title: "Restrictions opérationnelles" },
  { id: "XXV", range: [105, 105], title: "Registre des failles" },
  { id: "XXVI", range: [106, 107], title: "Références scientifiques/techniques" },
  { id: "XXVII", range: [108, 110], title: "Livrables finaux" },
  { id: "XXVIII", range: [111, 112], title: "Ordre de marche" },
  { id: "XXIX", range: [113, 115], title: "Mandat d'exécution" },
  { id: "XXX", range: [116, 119], title: "Premier mandat opérationnel" },
  { id: "XXXI", range: [120, 122], title: "Décisions finales" },
]);

const TOTAL_SECTIONS = 122;

const TWO_CTO_OUTPUTS = Object.freeze({
  target: { role: "TARGET (requirement)", file: "docs/odg-operational/ODG_MASTER_ROADMAP_V12.4.md", note: "owner-supplied V12.4 verbatim (PROPOSED référentiel, Niveau 1) — 31 parts / 122 sections" },
  reality: { role: "REALITY (confrontation)", file: "docs/odg/V12.4_SECTION_TRACEABILITY_MATRIX.md", note: "§1-§122 confronted row-by-row against real repo code/tests (per-section status SSOT)" },
  distinctSecondSource: { status: "NOT_RECOVERABLE_IF_MEANT", note: "If 'two CTO outputs' means a DISTINCT second owner-supplied document (not the matrix), it is NOT in-repo — only ONE roadmap was ingested 2026-11-08. Not fabricated; awaiting the owner to supply it if that is the intent." },
});

/** verifyCoverage() -> fail-closed proof that §1..122 are each covered exactly once (no gap/overlap/drop). */
function verifyCoverage(): any {
  const seen: Record<number, string[]> = {};
  let malformed = 0;
  for (const b of BLOCKS) {
    const [a, z] = b.range as number[];
    if (!(Number.isInteger(a) && Number.isInteger(z) && a <= z)) { malformed++; continue; }
    for (let s = a; s <= z; s++) { (seen[s] = seen[s] || []).push(b.id); }
  }
  const gaps: number[] = [];
  const overlaps: number[] = [];
  for (let s = 1; s <= TOTAL_SECTIONS; s++) {
    const n = (seen[s] || []).length;
    if (n === 0) gaps.push(s);
    else if (n > 1) overlaps.push(s);
  }
  const beyond = Object.keys(seen).map(Number).filter((s) => s < 1 || s > TOTAL_SECTIONS);
  const covered = Object.keys(seen).filter((s) => Number(s) >= 1 && Number(s) <= TOTAL_SECTIONS).length;
  return Object.freeze({
    ok: malformed === 0 && gaps.length === 0 && overlaps.length === 0 && beyond.length === 0 && covered === TOTAL_SECTIONS,
    totalSections: TOTAL_SECTIONS, blocks: BLOCKS.length, covered,
    gaps: Object.freeze(gaps), overlaps: Object.freeze(overlaps), beyond: Object.freeze(beyond), malformed,
  });
}

const V124_SECTION_COVERAGE_CONTRACT = Object.freeze({
  id: "V124-SECTION-COVERAGE-FUSION",
  source: "V12.4 Phase-3 — 122-section coverage + two-CTO-outputs fusion (target roadmap vs reality matrix)",
  twoCtoOutputs: TWO_CTO_OUTPUTS, totalSections: TOTAL_SECTIONS, blocks: BLOCKS.length,
  notAuthority: "a structural coverage proof; it builds no third roadmap and the matrix remains the per-section status SSOT",
  invariants: Object.freeze([
    "Préambule §1-§4 + 31 Parts cover §1-§122 EXACTLY once — fail-closed on any gap, overlap, or section beyond 122 (no silent drop)",
    "the two fused CTO outputs are the TARGET roadmap + the REALITY matrix; both are named real files",
    "a DISTINCT second owner-supplied CTO source, if meant, is NOT_RECOVERABLE in-repo (not fabricated)",
    "pure/deterministic; verifyCoverage is checkable; per-section status stays in the traceability matrix",
  ]),
});

module.exports = { BLOCKS, TOTAL_SECTIONS, TWO_CTO_OUTPUTS, verifyCoverage, V124_SECTION_COVERAGE_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...V124_SECTION_COVERAGE_CONTRACT, verify: verifyCoverage() }, null, 2) + "\n"); }

export {};
