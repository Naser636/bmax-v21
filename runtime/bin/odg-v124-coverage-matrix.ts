#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V56 (§2) — V12.4 FULL COVERAGE MATRIX (read-only aggregator). Builds ONE consolidated coverage view of the
 * canonical roadmap by (a) taking the EXISTING structural coverage proof (v124-section-coverage: §1–§122 covered exactly
 * once, fail-closed) and (b) PARSING the EXISTING per-part status SSOT (V12.4_SECTION_TRACEABILITY_MATRIX.md) into V56's
 * five buckets — DONE / PARTIAL / MISSING / BLOCKED / NOT_VALIDATED — plus Part XXXII. It re-derives NO section status
 * (the matrix stays the SSOT) and creates NO parallel roadmap. Pure read-only. Run: `odg-v124-coverage-matrix.ts`.
 */

const fs = require("fs");
const path = require("path");
const COV = require("../core/v124-section-coverage.js");
const MATRIX = path.join(__dirname, "..", "..", "docs", "odg", "V12.4_SECTION_TRACEABILITY_MATRIX.md");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// map the matrix's status vocabulary → V56 buckets (DONE/PARTIAL/MISSING/BLOCKED/NOT_VALIDATED). Order matters: test strongest-first.
function bucketOf(statusCell: string): string {
  // classify on the whole status cell (markdown stripped). Fail-closed precedence: PARTIAL dominates a decorative
  // PROVEN sub-note (a part with any "partial" is not DONE); "unblocked" never counts as BLOCKED.
  const s = statusCell.replace(/\*\*/g, "").toUpperCase();
  if (/PARTIAL/.test(s)) return "PARTIAL";                                        // "PARTIALLY_BUILT" or "...(partial)"
  if (/\bNOT_RECOVERABLE\b|\bBLOCKED\b/.test(s) && !/UNBLOCKED/.test(s)) return "BLOCKED";
  if (/\bNOT_STARTED\b|\bABSENT\b|\bMISSING\b|\bNOT_RECOVERED\b/.test(s)) return "MISSING";
  if (/PRESENT_AND_PROVEN|PRESENT|DEMONSTRATED|PROVEN/.test(s)) return "DONE";
  if (/DOCUMENTED_NOT_VERIFIED|NOT_VERIFIED|PROPOSED|NOT_MEASURED/.test(s)) return "NOT_VALIDATED";
  return "NOT_VALIDATED"; // fail-closed: unknown status is never counted as DONE
}

// parse the part-rows from the matrix table: lines like `| I §5–§6 | <title> | <STATUS...> | <notes> |`.
const lines = fs.readFileSync(MATRIX, "utf8").split(/\r?\n/);
const parts: any[] = [];
for (const ln of lines) {
  if (!/^\|/.test(ln)) continue;
  const cols = ln.split("|").map((c: string) => c.trim());
  // cols[0] is empty (leading |). Expect [ "", partLabel, title, status, notes, "" ].
  if (cols.length < 4) continue;
  const label = cols[1];
  if (!/§\s*\d/.test(label)) continue;                 // must reference at least one section
  if (/^(Partie|Part|Section|Roadmap|§-range)/i.test(label) && /title|status/i.test(cols[2] || "")) continue; // skip header
  const status = cols[3] || "";
  const bucket = bucketOf(status);
  // take a short evidence excerpt from the notes cell.
  const notes = (cols[4] || "").replace(/\*\*/g, "").slice(0, 160);
  parts.push({ part: label, title: cols[2], matrixStatus: status.replace(/\*\*/g, "").slice(0, 80), bucket, evidenceExcerpt: notes });
}

// structural coverage proof (existing primitive).
const proof = COV.verifyCoverage();

const tally: any = { DONE: 0, PARTIAL: 0, MISSING: 0, BLOCKED: 0, NOT_VALIDATED: 0 };
for (const p of parts) tally[p.bucket] = (tally[p.bucket] || 0) + 1;

const out = {
  "//": "CTO V56 §2 — V12.4 FULL COVERAGE MATRIX. Read-only aggregation: structural §1–§122 coverage proof (v124-section-coverage) + the per-part status SSOT (V12.4_SECTION_TRACEABILITY_MATRIX.md) classified into V56 buckets. NO re-derivation of section status (matrix remains SSOT); NO parallel roadmap.",
  structuralCoverage: { ok: proof.ok, totalSections: proof.totalSections, blocks: proof.blocks, covered: proof.covered, note: "§1–§122 covered exactly once (fail-closed) — structural completeness, NOT per-section functional completion" },
  partXXXII: { part: "XXXII §123–§130", title: "Commercialisation & Acquisition", bucket: "NOT_VALIDATED", note: "proposed directing referential (V50); commercial hypotheses unproven (0 clients)" },
  partsParsed: parts.length,
  parts,
  tally,
  honestConclusion: `Of ${parts.length} parsed roadmap parts (+ Part XXXII): ${tally.DONE} DONE, ${tally.PARTIAL} PARTIAL, ${tally.MISSING} MISSING, ${tally.BLOCKED} BLOCKED, ${tally.NOT_VALIDATED} NOT_VALIDATED. Structural §1–§122 coverage is PROVEN exactly-once (${proof.covered}/${proof.totalSections}); that is structural, not functional completion. Per-section status SSOT remains the traceability matrix. No part is declared DONE merely because a document exists.`,
  invariant: "Coverage is classified by reading the existing SSOT, never re-asserted. Structural coverage ≠ functional completion. A mission is DONE only when its criteria + evidence + validations hold — a document alone never flips a bucket to DONE.",
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V56_V124_COVERAGE_MATRIX.json"), JSON.stringify(out, null, 2) + "\n");
export {};
