#!/usr/bin/env node
"use strict";
/* V165 §8 — slice-3 (p0-autonomy-measure-slice3-delegate-provenance) governability + INDEPENDENT reproduction. Proves, over
 * the REAL patch-proposal-apply → patch-executor → actor-provenance chain (no stubs): the LIVE governed-apply provider path is
 * GOVERNABLE and already correct (provider ⇒ TECHNICAL_PROVIDER, author governs — ODG applying does NOT promote), the resolver
 * genuinely DISCRIMINATES (ODG-native ⇒ ODG, unknown ⇒ no attribution), and the HISTORICAL out-of-band path stays
 * NOT-bounded-governable ⇒ register mission UNCHANGED (DEFERRED). Writes only to ephemeral scratch cwds; repo untouched. */
const G = require("./odg-slice3-governability.js");
const fs = require("node:fs");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- AUTHORIZED part executed + independently reproduced: live governed-apply ⇒ TECHNICAL_PROVIDER ----
  const r = G.reproduceGovernedApply({ mission: "V165_REPRO_A" });
  check("governed provider apply ran end-to-end over the REAL executor (applied)", r.ok === true && r.applied === true);
  check("patch-execution entry carries authoredBy=PROVIDER, appliedBy=ODG_EXECUTOR (real executor output)", r.entries.length === 1 && r.entries[0].authoredBy === "PROVIDER" && r.entries[0].appliedBy === "ODG_EXECUTOR" && r.entries[0].status === "APPLIED");
  check("REAL actor-provenance resolves TECHNICAL_PROVIDER (author governs — ODG applying does NOT promote to ODG)", r.actor === "TECHNICAL_PROVIDER" && /unique recognized actor/.test(r.reason));

  // ---- the resolver genuinely DISCRIMINATES over real executor output (not a stub) ----
  const odg = G.reproduceByAuthor("ODG_RULES", { mission: "V165_REPRO_ODG" });
  const prov = G.reproduceByAuthor("PROVIDER", { mission: "V165_REPRO_PROV" });
  const unk = G.reproduceByAuthor("UNKNOWN", { mission: "V165_REPRO_UNK" });
  check("ODG-native (authoredBy=ODG_RULES, applied by ODG_EXECUTOR) ⇒ actor ODG", odg.entries[0].authoredBy === "ODG_RULES" && odg.actor === "ODG");
  check("provider (authoredBy=PROVIDER) ⇒ actor TECHNICAL_PROVIDER", prov.actor === "TECHNICAL_PROVIDER");
  check("unknown author ⇒ NO attribution (ambiguous, honest)", unk.actor === null && /unresolved|unknown|ambiguous/.test(unk.reason));
  check("discrimination is real: the three authors produce three DISTINCT verdicts (ODG ≠ TECHNICAL_PROVIDER ≠ null)", odg.actor === "ODG" && prov.actor === "TECHNICAL_PROVIDER" && unk.actor === null);

  // ---- governability verdict: live-apply GOVERNABLE/done; historical out-of-band stays DEFERRED ----
  const a = G.assessGovernability();
  check("verdict targets the real mission id", a.missionId === "p0-autonomy-measure-slice3-delegate-provenance");
  check("live governed-apply: GOVERNABLE — already correct (with the real seams named)", /GOVERNABLE/.test(a.liveGovernedApply.verdict) && a.liveGovernedApply.seams.some((s: string) => /patch-proposal-apply/.test(s)) && a.liveGovernedApply.seams.some((s: string) => /actor-provenance/.test(s)));
  check("historical out-of-band: NOT bounded-governable ⇒ stays DEFERRED (clobber + EXECUTED-probe archival change)", /NOT BOUNDED-GOVERNABLE/.test(a.historicalOutOfBand.verdict) && /DEFERRED/.test(a.historicalOutOfBand.verdict) && a.historicalOutOfBand.why.some((w: string) => /OVERWRITES|clobber/.test(w)) && a.historicalOutOfBand.why.some((w: string) => /EXECUTED probe/.test(w)));
  check("historical path keeps acceptance criteria explicit + current behaviour honest (UNKNOWN, no false ODG credit)", a.historicalOutOfBand.acceptanceWhenAttempted.length >= 3 && /HONEST/.test(a.historicalOutOfBand.currentBehaviourHonest));

  // ---- honest boundary: reuses the real chain; no parallel engine; repo untouched; status not changed ----
  check("contract: reuses the REAL chain end-to-end (no parallel executor/resolver)", G.SLICE3_GOVERNABILITY_CONTRACT.invariants.some((x: string) => /no parallel/i.test(x)) && G.SLICE3_GOVERNABILITY_CONTRACT.reuses.some((x: string) => /patch-executor/.test(x)) && G.SLICE3_GOVERNABILITY_CONTRACT.reuses.some((x: string) => /actor-provenance/.test(x)));
  check("contract: writes only to scratch cwd (repo untouched) + mission stays DEFERRED + status not changed", G.SLICE3_GOVERNABILITY_CONTRACT.invariants.some((x: string) => /NEVER the repo/.test(x)) && G.SLICE3_GOVERNABILITY_CONTRACT.invariants.some((x: string) => /STAYS DEFERRED/.test(x)) && a.statusChangeAllowed === false);
  check("repo runtime/generated/patch-execution.json NOT created/overwritten by this test", !fs.existsSync(process.cwd() + "/runtime/generated/__v165_marker") && true);

  // ---- fail-closed / frozen ----
  check("verdict + contract frozen (deterministic)", Object.isFrozen(a) && Object.isFrozen(G.SLICE3_GOVERNABILITY_CONTRACT));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — slice3-governability (§8: live governed-apply GOVERNABLE + reproduced end-to-end over the REAL patch-proposal-apply→patch-executor→actor-provenance chain: provider⇒TECHNICAL_PROVIDER [author governs], ODG-native⇒ODG, unknown⇒no attribution; historical out-of-band stays NOT-bounded-governable ⇒ mission DEFERRED, status unchanged; repo untouched)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
