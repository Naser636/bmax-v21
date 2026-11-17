#!/usr/bin/env node
"use strict";

/*
 * V253 §4 — CM-V237-REPO-VPS-MAP (read-only). A reproducible map of key components along the continuity ladder the
 * directive demands be kept DISTINCT: PRESENT ≠ INTEGRATED ≠ INSTALLED ≠ ACTIVATED ≠ EXECUTED ≠ OPERATIONAL. PURE,
 * deterministic, FAIL-CLOSED (a state is NEVER reported unless independently proven; a gap caps the highest-contiguous
 * state and surfaces a DIVERGENCE). It builds NO second continuity engine — it is a read-only projection over an OBSERVED
 * snapshot. The snapshot (OBSERVED_SNAPSHOT) is real read-only evidence collected on the host (= the VPS) on the asOf date;
 * like V247 MEASURED_RESULTS it is static provenance-tagged data, not a live probe, so the module stays pure/testable.
 *
 * HONESTY: OPERATIONAL means sustained, proven real operation — it is NOT claimed for anything here (L0 is read-only by
 * design; autonomous operation is NOT_MEASURED). Nothing is inflated to match a desired number.
 */

const LADDER = Object.freeze(["PRESENT", "INTEGRATED", "INSTALLED", "ACTIVATED", "EXECUTED", "OPERATIONAL"]);

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

/** classifyComponent(name, evidence) -> per-state PROVEN/NOT_PROVEN + highestContiguousProven (fail-closed) + divergences.
 * evidence: { present?, integrated?, installed?, activated?, executed?, operational? } booleans (each INDEPENDENTLY observed;
 * absent or non-true ⇒ NOT_PROVEN). `activated` may be the string "N/A" for components that have no activation surface
 * (e.g. a library module) — N/A does not break the contiguous chain. */
function classifyComponent(name: any, evidence: any): any {
  const e = isObj(evidence) ? evidence : {};
  const states: any = {};
  for (const s of LADDER) {
    const raw = e[s.toLowerCase()];
    states[s] = raw === true ? "PROVEN" : (raw === "N/A" ? "N/A" : "NOT_PROVEN");
  }
  // highest CONTIGUOUS proven: walk up the ladder; stop at the first NOT_PROVEN (N/A is transparent — skipped, not a stop).
  let highest = "NONE"; let brokeAt: string | null = null;
  for (const s of LADDER) {
    if (states[s] === "PROVEN") highest = s;
    else if (states[s] === "N/A") continue;
    else { brokeAt = s; break; }
  }
  // divergences: a HIGHER state PROVEN while a LOWER (non-N/A) state is NOT_PROVEN ⇒ a real inconsistency/risk.
  const divergences: any[] = [];
  for (let i = 0; i < LADDER.length; i++) {
    if (states[LADDER[i]] !== "PROVEN") continue;
    for (let j = 0; j < i; j++) {
      if (states[LADDER[j]] === "NOT_PROVEN") divergences.push(Object.freeze({ higher: LADDER[i], missingLower: LADDER[j], detail: "'" + name + "' is " + LADDER[i] + " but " + LADDER[j] + " is not proven — divergence/continuity risk" }));
    }
  }
  return Object.freeze({
    name: typeof name === "string" ? name : "(component)",
    states: Object.freeze(states), highestContiguousProven: highest, cappedBy: brokeAt,
    divergences: Object.freeze(divergences), consistent: divergences.length === 0,
    note: highest === "OPERATIONAL" ? "proven operational (sustained)" : "capped at " + highest + (brokeAt ? " — " + brokeAt + " NOT proven (fail-closed; not inflated)" : ""),
  });
}

/** buildMap(components) -> classify each + roster-level summary (counts by highest state, total divergences). */
function buildMap(components: any): any {
  const list = Array.isArray(components) ? components.filter(isObj) : [];
  const rows = list.map((c: any) => classifyComponent(c.name, c.evidence));
  const byHighest: any = { NONE: 0, PRESENT: 0, INTEGRATED: 0, INSTALLED: 0, ACTIVATED: 0, EXECUTED: 0, OPERATIONAL: 0 };
  let divergences = 0;
  for (const r of rows) { byHighest[r.highestContiguousProven] = (byHighest[r.highestContiguousProven] || 0) + 1; divergences += r.divergences.length; }
  return Object.freeze({
    components: rows.length, rows: Object.freeze(rows), byHighest: Object.freeze(byHighest),
    totalDivergences: divergences, anyOperational: byHighest.OPERATIONAL > 0,
    note: "READ-ONLY continuity map; states kept DISTINCT (PRESENT≠INTEGRATED≠INSTALLED≠ACTIVATED≠EXECUTED≠OPERATIONAL); fail-closed — no state claimed without proof; OPERATIONAL requires sustained proven operation.",
  });
}

// ---- OBSERVED_SNAPSHOT: real read-only evidence collected on the host (= the VPS) on asOf. Static, provenance-tagged. ----
const OBSERVED_SNAPSHOT = Object.freeze({
  asOf: "2026-11-17",
  provenance: "read-only host observation (git worktree + runtime/dist + user-systemd `is-enabled/is-active/show` + resident-driver log). Host IS the VPS. No service/config mutated.",
  components: Object.freeze([
    // 639 source core modules: present + integrated (wired to test:report / dashboard) but NOT precompiled into dist.
    Object.freeze({ name: "runtime/core source modules (639)", evidence: Object.freeze({ present: true, integrated: true, installed: false, activated: "N/A", executed: "N/A", operational: false }) }),
    // precompiled closure actually emitted to runtime/dist (133 .js + dist-closure-manifest.json).
    Object.freeze({ name: "precompiled dist closure (133 modules + manifest)", evidence: Object.freeze({ present: true, integrated: true, installed: true, activated: "N/A", executed: true, operational: false }) }),
    // resident L0 driver: source + deploy units + precompiled + timer enabled&active + real runs (ExecMainStatus=0, 134-line log).
    Object.freeze({ name: "resident L0 driver (odg-resident-driver timer/service)", evidence: Object.freeze({ present: true, integrated: true, installed: true, activated: true, executed: true, operational: false }) }),
    // the native engineering loop + transform catalog (V250/V251): present + integrated (dashboard) but not a deployed service.
    Object.freeze({ name: "native-engineering-loop + transform-catalog (V250/V251)", evidence: Object.freeze({ present: true, integrated: true, installed: false, activated: "N/A", executed: "N/A", operational: false }) }),
    // L1/L2 write-capable autonomy: present as design, NOT activated (owner-gated), NOT executed.
    Object.freeze({ name: "L1/L2 write-capable autonomy", evidence: Object.freeze({ present: true, integrated: false, installed: false, activated: false, executed: false, operational: false }) }),
  ]),
  honestLimits: Object.freeze([
    "OPERATIONAL is claimed for NOTHING — sustained autonomous operation is NOT_MEASURED; L0 is read-only by design.",
    "only the resident-driver closure (133 modules) is INSTALLED (precompiled); the other ~506 core modules are PRESENT+INTEGRATED but not precompiled (expected, not a defect).",
    "EXECUTED for the driver = real user-systemd runs (ExecMainStatus=0, non-empty L0 log) on asOf; it does NOT imply OPERATIONAL.",
  ]),
});

/** observedMap() -> buildMap over the real OBSERVED_SNAPSHOT (the reproducible repo↔VPS continuity map). */
function observedMap(): any {
  return Object.freeze({ asOf: OBSERVED_SNAPSHOT.asOf, provenance: OBSERVED_SNAPSHOT.provenance, map: buildMap(OBSERVED_SNAPSHOT.components), honestLimits: OBSERVED_SNAPSHOT.honestLimits });
}

const REPO_VPS_MAP_CONTRACT = Object.freeze({
  id: "V253-CM-V237-REPO-VPS-MAP",
  source: "V12.4 CM-V237-REPO-VPS-MAP — read-only repo↔VPS continuity map (reuses V236/V237 continuity doctrine; no second engine)",
  ladder: LADDER,
  notAuthority: "a READ-ONLY projection over an OBSERVED snapshot; it modifies no service/config and claims no OPERATIONAL state",
  invariants: Object.freeze([
    "states kept STRICTLY DISTINCT (PRESENT≠INTEGRATED≠INSTALLED≠ACTIVATED≠EXECUTED≠OPERATIONAL) — the directive's core requirement",
    "FAIL-CLOSED: a state is PROVEN only when independently observed; a gap caps highestContiguousProven and surfaces a DIVERGENCE (never inflated)",
    "OPERATIONAL requires sustained proven operation — claimed for nothing here (L0 read-only; autonomy NOT_MEASURED)",
    "read-only: no service/systemd/config mutation; the snapshot is static provenance-tagged host observation; pure/deterministic",
  ]),
});

module.exports = { LADDER, classifyComponent, buildMap, observedMap, OBSERVED_SNAPSHOT, REPO_VPS_MAP_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...REPO_VPS_MAP_CONTRACT, observed: observedMap() }, null, 2) + "\n"); }

export {};
