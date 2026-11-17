#!/usr/bin/env node
"use strict";
/* V253 §4 — CM-V237-REPO-VPS-MAP. Proves the read-only continuity map keeps states DISTINCT, is FAIL-CLOSED (never
 * inflates a state without proof), detects DIVERGENCES (higher proven while a lower is not), handles N/A, and reflects the
 * real OBSERVED snapshot honestly (OPERATIONAL claimed for nothing). Deterministic + frozen. */
const M = require("./odg-repo-vps-map.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  check("ladder is the 6 distinct states in order", JSON.stringify(M.LADDER) === JSON.stringify(["PRESENT", "INTEGRATED", "INSTALLED", "ACTIVATED", "EXECUTED", "OPERATIONAL"]));

  // fully-proven contiguous ⇒ highest OPERATIONAL, consistent.
  const full = M.classifyComponent("x", { present: true, integrated: true, installed: true, activated: true, executed: true, operational: true });
  check("all states proven ⇒ highestContiguousProven OPERATIONAL, consistent", full.highestContiguousProven === "OPERATIONAL" && full.consistent === true && full.divergences.length === 0);

  // FAIL-CLOSED: present+integrated only ⇒ capped at INTEGRATED; higher states NOT inflated.
  const partial = M.classifyComponent("y", { present: true, integrated: true });
  check("present+integrated only ⇒ capped at INTEGRATED (installed/activated/... NOT_PROVEN, not inflated)", partial.highestContiguousProven === "INTEGRATED" && partial.cappedBy === "INSTALLED" && partial.states.OPERATIONAL === "NOT_PROVEN");

  // DIVERGENCE: installed proven but integrated NOT ⇒ highestContiguous capped at PRESENT + a divergence surfaced.
  const diverge = M.classifyComponent("z", { present: true, integrated: false, installed: true });
  check("installed-but-not-integrated ⇒ capped at PRESENT + divergence reported (not silently promoted)", diverge.highestContiguousProven === "PRESENT" && diverge.divergences.some((d: any) => d.higher === "INSTALLED" && d.missingLower === "INTEGRATED") && diverge.consistent === false);

  // N/A is transparent — does not break the contiguous chain.
  const na = M.classifyComponent("lib", { present: true, integrated: true, installed: true, activated: "N/A", executed: true });
  check("N/A activation is transparent ⇒ EXECUTED still reachable through it", na.highestContiguousProven === "EXECUTED" && na.states.ACTIVATED === "N/A");

  // fail-closed on no evidence.
  const none = M.classifyComponent("q", {});
  check("no evidence ⇒ NONE (nothing proven)", none.highestContiguousProven === "NONE" && none.states.PRESENT === "NOT_PROVEN");

  // OBSERVED snapshot: honest, OPERATIONAL claimed for nothing.
  const obs = M.observedMap();
  check("observed map: real snapshot, >=5 components, 0 OPERATIONAL (nothing inflated)", obs.map.components >= 5 && obs.map.byHighest.OPERATIONAL === 0 && obs.map.anyOperational === false);
  check("observed map: the resident L0 driver is proven up to EXECUTED (real user-systemd runs), not OPERATIONAL", obs.map.rows.some((r: any) => /resident L0 driver/.test(r.name) && r.highestContiguousProven === "EXECUTED"));
  check("observed map: L1/L2 autonomy is PRESENT only (not activated/executed — owner-gated)", obs.map.rows.some((r: any) => /L1\/L2/.test(r.name) && r.highestContiguousProven === "PRESENT"));
  check("observed map: honest limits state OPERATIONAL claimed for nothing + autonomy NOT_MEASURED", obs.honestLimits.some((l: string) => /OPERATIONAL is claimed for NOTHING/.test(l)));
  check("observed snapshot is read-only/static (provenance tagged, no mutation claim)", /No service\/config mutated/.test(obs.provenance) && obs.asOf === "2026-11-17");

  // contract + determinism + frozen.
  check("contract: distinct states + fail-closed + read-only invariants", M.REPO_VPS_MAP_CONTRACT.invariants.some((i: string) => /STRICTLY DISTINCT/.test(i)) && M.REPO_VPS_MAP_CONTRACT.invariants.some((i: string) => /FAIL-CLOSED/.test(i)) && M.REPO_VPS_MAP_CONTRACT.invariants.some((i: string) => /read-only/.test(i)));
  check("deterministic + frozen", JSON.stringify(M.observedMap()) === JSON.stringify(obs) && Object.isFrozen(obs) && Object.isFrozen(full));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-repo-vps-map (V253 §4 CM-V237-REPO-VPS-MAP: read-only continuity map; states DISTINCT PRESENT≠INTEGRATED≠INSTALLED≠ACTIVATED≠EXECUTED≠OPERATIONAL; fail-closed no-inflation; divergence detection; real host snapshot — OPERATIONAL claimed for nothing; no 2nd engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
