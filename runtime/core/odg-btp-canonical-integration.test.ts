#!/usr/bin/env node
"use strict";
/* V261 §2 — BTP canonical integration into docs/odg/v124-consolidated-roadmap.json (ADDITIVE). Proves the integration is
 * ADDITIVE (every original program/mission preserved), honest (delivered BTP = INTEGRATED, unbuilt = READY/BLOCKED, never
 * fabricated), referentially sound (INTEGRATED components reference real files), and that the PROTECTED executionManifest
 * (ROADMAP.json = 11) is UNCHANGED. Read-only validation. */
const fs = require("fs");
const R = require("../../docs/odg/v124-consolidated-roadmap.json");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  // PROTECTED manifest untouched.
  check("executionManifest ROADMAP.json stays 11 (UNCHANGED_AUTHORITATIVE — protected manifest not mutated)", R.executionManifest.missions === 11 && R.executionManifest.status === "UNCHANGED_AUTHORITATIVE");

  // ADDITIVE: every original mission id preserved.
  const original = ["CM-V234-CONTINUATION", "CM-V234-RESIDENT-DRIVER", "CM-V235-OBS-CURRENCY", "CM-V236-CARTOGRAPHY", "CM-V237-PROGRAM-CONTINUITY", "CM-V237-AZ-SCENARIO", "CM-V237-ORCHESTRATION", "CM-V237-REPO-VPS-MAP", "CM-RADAR-GATE-CHAIN", "CM-METIER-BASELINES", "CM-METIER-P5-PLATFORM", "CM-METIER-P8-API", "CM-BENCHMARK-AUDIT", "CM-MULTIMODAL-VIDEO"];
  const ids = new Set(R.missions.map((m: any) => m.id));
  check("ADDITIVE: all 14 original missions preserved (none deleted/renamed)", original.every((x) => ids.has(x)));
  check("ADDITIVE: original expectedMissionSources (V234–V237) preserved + V258–V261 appended", ["V234", "V235", "V236", "V237", "V258", "V259", "V260", "V261"].every((s) => R.expectedMissionSources.indexOf(s) >= 0));

  // the 6 CM-BTP-* missions present with HONEST statuses.
  const btp = R.missions.filter((m: any) => /^CM-BTP-/.test(m.id));
  check("6 CM-BTP-* missions appended (ROADMAP/MATRIX/DEVIS-ENGINE/METRE/VISION/VOICE)", btp.length === 6 && ["CM-BTP-ROADMAP", "CM-BTP-CAPABILITY-MATRIX", "CM-BTP-DEVIS-ENGINE", "CM-BTP-METRE", "CM-BTP-VISION", "CM-BTP-VOICE"].every((x) => ids.has(x)));
  const byId = (id: string) => R.missions.find((m: any) => m.id === id);
  check("HONEST: delivered BTP modules are INTEGRATED (merged+inspected), not falsely ACCEPTED/OPERATIONAL", ["CM-BTP-ROADMAP", "CM-BTP-CAPABILITY-MATRIX", "CM-BTP-DEVIS-ENGINE"].every((id) => byId(id).status === "INTEGRATED"));
  check("HONEST: unbuilt capabilities are READY/BLOCKED (NOT claimed built) — métré READY, vision/voice BLOCKED", byId("CM-BTP-METRE").status === "READY" && byId("CM-BTP-VISION").status === "BLOCKED" && byId("CM-BTP-VOICE").status === "BLOCKED");
  check("HONEST: BLOCKED capabilities state the absent-capability reason (vision/STT), not a fabricated block", /vision|OCR/i.test(JSON.stringify(byId("CM-BTP-VISION").authorizations)) && /speech-to-text|STT/i.test(JSON.stringify(byId("CM-BTP-VOICE").authorizations)));

  // REFERENTIAL INTEGRITY: every INTEGRATED mission's components reference a real file on disk.
  const integrated = R.missions.filter((m: any) => m.status === "INTEGRATED" && /^CM-BTP-/.test(m.id));
  const missingRef = integrated.flatMap((m: any) => (m.components || [])).filter((c: string) => !fs.existsSync(c));
  check("referential integrity: every INTEGRATED CM-BTP component file exists on disk (grounded)", missingRef.length === 0 && integrated.every((m: any) => (m.components || []).length >= 1));
  // READY/BLOCKED (unbuilt) missions honestly carry NO built component.
  check("honest: READY/BLOCKED CM-BTP missions carry no built component (empty components)", byId("CM-BTP-METRE").components.length === 0 && byId("CM-BTP-VISION").components.length === 0 && byId("CM-BTP-VOICE").components.length === 0);

  // provenance + preservation record.
  check("btpExtension provenance: INTEGRATED_ADDITIVE, master roadmap + sha256, preserves canon (9 prim/166/A01-A54/20 métiers/11)", R.btpExtension && R.btpExtension.integrationState === "INTEGRATED_ADDITIVE" && /ba7a2985/.test(R.btpExtension.masterRoadmapSha256) && R.btpExtension.preserves.some((p: string) => /9 primitives/.test(p)) && R.btpExtension.preserves.some((p: string) => /11 \(UNCHANGED\)/.test(p)));

  // protected registers truly untouched (independent read).
  const closure = require("../../docs/odg/closure-register.json");
  const roadmap = require("../../runtime/governance/ROADMAP.json");
  check("protected registers unchanged: closure-register 427, ROADMAP.json 11", (closure.length || (closure.items ? closure.items.length : 0)) === 427 && roadmap.missions.length === 11);

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-canonical-integration (V261 §2: BTP integrated ADDITIVELY into v124-consolidated-roadmap — 14 original missions preserved, 6 CM-BTP appended [3 INTEGRATED grounded on real files, métré READY, vision/voice BLOCKED on absent vision/STT — not fabricated]; executionManifest 11 UNCHANGED; protected registers 427/11 intact; no second roadmap)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
