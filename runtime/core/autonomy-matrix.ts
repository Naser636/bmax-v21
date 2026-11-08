#!/usr/bin/env node
"use strict";

/*
 * WI-AUTO-13 — AUTONOMY A1–A5 EVIDENCE MATRIX (§4/§57). PURE, deterministic, honest measurement: it maps a set
 * of DEMONSTRATED capabilities (each with evidence + a kind REAL|SIMULATED|DECLARED) to the highest JUSTIFIED
 * autonomy level. A level is GRANTED only when ALL its required capabilities are demonstrated with REAL
 * evidence; capabilities shown only on a SIMULATED scenario yield SIMULATED_ONLY (NOT granted for A3+);
 * DECLARED-without-evidence counts for nothing (§57 "never on a declaration or an isolated demo"). It ASSIGNS
 * nothing by itself — it reports what the evidence justifies and what is still missing. Dual export.
 */

const KINDS = Object.freeze(["REAL", "SIMULATED", "DECLARED"]);
const LEVELS = Object.freeze([
  { level: "A1", name: "Assisted Execution", requires: Object.freeze(["bounded-execution"]), success: "executes a bounded task under supervision", limit: "heavy human supervision" },
  { level: "A2", name: "Mission Autonomy", requires: Object.freeze(["bounded-execution", "mission-planning", "independent-verification", "evidence-recording"]), success: "plans + accomplishes a bounded mission with control + validation", limit: "scoped missions only" },
  { level: "A3", name: "Persistent Autonomy", requires: Object.freeze(["bounded-execution", "mission-planning", "independent-verification", "evidence-recording", "persistence-resume", "dependency-management"]), success: "persistent missions across interruptions, deps, resume", limit: "no self-directed capability change" },
  { level: "A4", name: "Adaptive Autonomy", requires: Object.freeze(["bounded-execution", "mission-planning", "independent-verification", "evidence-recording", "persistence-resume", "dependency-management", "capability-discovery", "controlled-experiment"]), success: "discovers capabilities + adapts methods via controlled experiments", limit: "evolution still gated" },
  { level: "A5", name: "Controlled Evolution", requires: Object.freeze(["bounded-execution", "mission-planning", "independent-verification", "evidence-recording", "persistence-resume", "dependency-management", "capability-discovery", "controlled-experiment", "self-build-verify", "governed-evolution"]), success: "designs/builds/tests/verifies/evolves its own capabilities under governance", limit: "within governance boundaries only" },
]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
function hasEvidence(v: any): boolean { return Array.isArray(v) ? v.length > 0 : isStr(v); }

// Build capability -> best demonstrated kind (REAL > SIMULATED), only when evidence is present.
function demoMap(demonstrated: any): any {
  const rank: any = { REAL: 3, SIMULATED: 2, DECLARED: 1 };
  const m: any = {};
  for (const d of (Array.isArray(demonstrated) ? demonstrated : [])) {
    if (!isObj(d) || !isStr(d.capability)) continue;
    const kind = KINDS.includes(d.kind) ? d.kind : "DECLARED";
    if (kind === "DECLARED" || !hasEvidence(d.evidence)) continue; // no evidence ⇒ does not count (§57)
    if (!m[d.capability] || rank[kind] > rank[m[d.capability]]) m[d.capability] = kind;
  }
  return m;
}

/** assess(demonstrated) -> { grantedLevel, demonstratedLevel, perLevel:[...], note }. Pure, deterministic. */
function assess(demonstrated: any): any {
  const m = demoMap(demonstrated);
  const perLevel = LEVELS.map((L: any) => {
    const missing = L.requires.filter((c: string) => !m[c]).sort();
    let verdict;
    if (missing.length > 0) verdict = "INSUFFICIENT_EVIDENCE";
    else if (L.requires.every((c: string) => m[c] === "REAL")) verdict = "GRANTED";
    else verdict = "SIMULATED_ONLY";
    const met = L.requires.filter((c: string) => !!m[c]).sort();
    return Object.freeze({ level: L.level, name: L.name, verdict, met, missing, success: L.success, limit: L.limit });
  });
  // granted = highest level with A1..Ai ALL GRANTED (consecutive, monotonic).
  let grantedLevel = "NONE"; let demonstratedLevel = "NONE";
  for (let i = 0; i < perLevel.length; i++) {
    if (perLevel.slice(0, i + 1).every((p: any) => p.verdict === "GRANTED")) grantedLevel = perLevel[i].level;
    if (perLevel.slice(0, i + 1).every((p: any) => p.verdict === "GRANTED" || p.verdict === "SIMULATED_ONLY")) demonstratedLevel = perLevel[i].level;
  }
  const note = grantedLevel === demonstratedLevel
    ? `granted ${grantedLevel} on REAL evidence`
    : `granted ${grantedLevel} (REAL); ${demonstratedLevel} reachable but rests on SIMULATED evidence — not granted (§4)`;
  return Object.freeze({ grantedLevel, demonstratedLevel, perLevel: Object.freeze(perLevel), note });
}

const AUTONOMY_MATRIX_CONTRACT = Object.freeze({
  id: "WI-AUTO-13-AUTONOMY-MATRIX",
  source: "FICHE §4 (measure A1–A5) + §57 (a level is never granted on a declaration or an isolated/simulated demo)",
  kinds: KINDS, levels: Object.freeze(LEVELS.map((L: any) => L.level)),
  notAuthority: "measurement lens; assigns no level by fiat — reports what the evidence justifies and what is missing",
  invariants: Object.freeze([
    "pure/deterministic: demonstrated-capabilities in → justified level out",
    "a capability counts only with evidence AND kind REAL|SIMULATED (DECLARED-without-evidence = nothing, §57)",
    "GRANTED requires ALL the level's capabilities with REAL evidence; SIMULATED evidence ⇒ SIMULATED_ONLY (not granted, §4)",
    "grantedLevel is monotonic (A1..Ai all GRANTED); a simulated scenario never grants A3/A4/A5",
  ]),
});

module.exports = { KINDS, LEVELS, AUTONOMY_MATRIX_CONTRACT, demoMap, assess };

if (require.main === module) {
  process.stdout.write(JSON.stringify(AUTONOMY_MATRIX_CONTRACT, null, 2) + "\n");
}

export {};
