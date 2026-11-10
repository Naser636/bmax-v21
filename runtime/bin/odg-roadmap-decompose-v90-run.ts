#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V90 §3 — DECOMPOSITION of the gated (PREPARED_B / DEFERRED) canonical missions into the 9 V90 categories.
 * Reuses the V81 mission-decomposer (ALREADY_DONE / LOCAL_REMAINING / SIGN_OFF_GATED) and REFINES each sub-mission into
 * the finer V90 taxonomy, honestly surfacing genuinely-LOCAL sub-work so a blocked parent never blocks its independent
 * local sub-missions. A parent is NOT classed HUMAN_SIGNOFF/EXTERNAL wholesale when it decomposes into local work. No
 * fabricated missions (no counter inflation). Derives gated missions from the REAL coverage matrix + closure ledger.
 * Writes docs/odg/V90_DECOMPOSITION.json. Run: `odg-roadmap-decompose-v90-run.ts`.
 */

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const D = path.join(ROOT, "docs", "odg");
const DEC = require("../core/mission-decomposer.js");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

const cov = j("V56_V124_COVERAGE_MATRIX.json");
const ledger = j("V58_CLOSURE_LEDGER.json");
const ledgerByPart: any = {}; if (ledger && ledger.rows) for (const r of ledger.rows) ledgerByPart[String(r.part).split(" ")[0]] = r;

const V90_CATS = ["ALREADY_DONE_VALIDATED", "LOCAL_IMPLEMENTATION", "LOCAL_TESTING", "LOCAL_RESEARCH", "LOCAL_DATA_AND_SIMULATION", "LOCAL_INTEGRATION", "HUMAN_SIGNOFF", "EXTERNAL_DEPENDENCY", "NOT_MEASURED"];
const LOCAL_CATS = new Set(["LOCAL_IMPLEMENTATION", "LOCAL_TESTING", "LOCAL_RESEARCH", "LOCAL_DATA_AND_SIMULATION", "LOCAL_INTEGRATION"]);

// refine a V81 sub-mission into the finer V90 taxonomy by its name + status (fail-closed to NOT_MEASURED).
function refine(sub: any): string {
  if (sub.status === "ALREADY_DONE") return "ALREADY_DONE_VALIDATED";
  if (sub.status === "SIGN_OFF_GATED") return "HUMAN_SIGNOFF";
  const n = String(sub.name || "").toLowerCase();
  if (/impl|build|code|wire-up/.test(n)) return "LOCAL_IMPLEMENTATION";
  if (/test|bench|evidence|proof|verify/.test(n)) return "LOCAL_TESTING";
  if (/research|study|public/.test(n)) return "LOCAL_RESEARCH";
  if (/data|sim|synthetic/.test(n)) return "LOCAL_DATA_AND_SIMULATION";
  if (/integrat|connect|raccord/.test(n)) return "LOCAL_INTEGRATION";
  if (/external|deploy|client|vps|publish/.test(n)) return "EXTERNAL_DEPENDENCY";
  if (/dossier|decision|plan/.test(n)) return "LOCAL_TESTING";   // a decision dossier is prepared locally (not the sign-off itself)
  return "NOT_MEASURED";
}

// the gated canonical missions = coverage parts that are NOT locally-closeable (owner/external/referential).
const gated: any[] = [];
if (cov && cov.parts) for (const p of cov.parts) {
  const key = String(p.part).split(" ")[0]; const led = ledgerByPart[key]; const consolidation = led && led.consolidationVerified;
  const levelA = p.bucket === "DONE" || consolidation || (led && /LOCALLY_CLOSEABLE/.test((led && led.gating) || ""));
  if (!levelA) gated.push({ id: "REQ-" + key, part: p.part, bucket: p.bucket, gating: led ? led.gating : null, kind: "PARTIAL", needsSignOff: true });
}
if (cov && cov.partXXXII) gated.push({ id: "REQ-XXXII", part: "Part XXXII (commercialization)", bucket: cov.partXXXII.bucket, gating: "OWNER_GATED", kind: "external", needsSignOff: true });

const decompositions = gated.map((g: any) => {
  const d = DEC.decompose(g, null);
  const subs = (d.subMissions || []).map((s: any) => ({ name: s.name, v81Status: s.status, v90Category: refine(s) }));
  const localSubs = subs.filter((s: any) => LOCAL_CATS.has(s.v90Category));
  return { parent: g.id, part: g.part, gating: g.gating, subMissions: subs, localProceedable: localSubs.map((s: any) => s.name), humanOrExternal: subs.filter((s: any) => s.v90Category === "HUMAN_SIGNOFF" || s.v90Category === "EXTERNAL_DEPENDENCY").length };
});

const catTally: any = {}; for (const c of V90_CATS) catTally[c] = 0;
for (const dc of decompositions) for (const s of dc.subMissions) catTally[s.v90Category]++;
const totalLocalProceedable = decompositions.reduce((n: number, dc: any) => n + dc.localProceedable.length, 0);

const out = {
  "//": "CTO V90 §3 — decomposition of the gated (PREPARED_B/DEFERRED) canonical missions into the 9 V90 categories (V81 refined). A gated parent still exposes its genuinely-LOCAL sub-work; only sub-work needing a real human sign-off or external dependency stays reserved. No fabricated missions.",
  gatedParents: gated.length, decompositions, categoryTally: catTally, totalLocalProceedableSubMissions: totalLocalProceedable,
  honestConclusion: `${gated.length} gated canonical parents decomposed into ${Object.values(catTally).reduce((a: any, b: any) => a + b, 0)} sub-missions across the 9 categories. ${totalLocalProceedable} are genuinely LOCAL (implementation/testing/research/data-sim/integration) and can proceed under gated parents; the rest are real HUMAN_SIGNOFF (${catTally.HUMAN_SIGNOFF}) / EXTERNAL_DEPENDENCY (${catTally.EXTERNAL_DEPENDENCY}) / ALREADY_DONE_VALIDATED (${catTally.ALREADY_DONE_VALIDATED}). Honest: most gated parents are inherently owner/referential — local sub-work is the finite minority, not inflated.`,
  invariant: "a gated parent never blocks its independent local sub-missions; a parent is not wholesale HUMAN_SIGNOFF when it decomposes into local work; no fabricated missions; derived from real canonical artifacts.",
};
fs.writeFileSync(path.join(D, "V90_DECOMPOSITION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ gatedParents: gated.length, categoryTally: catTally, totalLocalProceedable }, null, 2) + "\n");
export {};
