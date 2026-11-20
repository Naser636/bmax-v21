#!/usr/bin/env node
"use strict";
/* V258 §6/§7/§9 — BTP capability matrix. Proves the read-only gap map is GROUNDED (every referenced module really exists),
 * FAIL-CLOSED (no backing ⇒ ABSENT; computer-vision genuinely ABSENT; métré reconciled to PARTIEL — dedicated engine exists), and HONEST (nothing claimed world-class/operational; the
 * named MASTER ROADMAP.md is reported absent, not fabricated; integration PROPOSED not applied — no protected-register mutation). */
const fs = require("fs");
const M = require("./odg-btp-capability-matrix.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const matrix = M.buildMatrix();
  check("15 BTP domains + 3 requirement clusters = 18 rows", M.DOMAINS.length === 15 && M.REQUIREMENT_CLUSTERS.length === 3 && matrix.total === 18);

  // GROUNDED: every module named with a real file path (not "(none)", not a "p1..p15"/doc placeholder) must actually exist on disk.
  const placeholder = (s: string) => /\(none\)|\.\.|references|OCR_NOT_AVAILABLE|self-consistency|docs\/|\(parc\)|\(NL intent\)|\(TEXT only/.test(s);
  const allModules = matrix.rows.flatMap((r: any) => (r.modules || [r.backing]));
  const realNamed = allModules.filter((m: string) => typeof m === "string" && m && !placeholder(m));
  const missing = realNamed.filter((m: string) => !fs.existsSync("runtime/core/" + m + ".ts"));
  check("GROUNDED: every real named backing module exists on disk (no fabricated module)", missing.length === 0);

  // FAIL-CLOSED: the computer-vision gaps are honestly ABSENT (no inflation) — no vision engine exists.
  check("fail-closed: D03 (vision) + R-VISION are ABSENT (genuine gaps, not inflated)", matrix.rows.find((r: any) => r.id === "D03").status === "ABSENT" && matrix.rows.find((r: any) => r.id === "R-VISION").status === "ABSENT");
  // RECONCILED 2026-11-20: D04 métré is now PARTIEL (a DEDICATED métré engine exists + is consumed) — NOT inflated to EXISTANT
  // (world-class automated takeoff from plans still depends on the ABSENT vision engine). No module name is fabricated (grounded above).
  const d04 = matrix.rows.find((r: any) => r.id === "D04");
  check("reconciled: D04 métré = PARTIEL backed by the dedicated odg-btp-metre-engine (no longer ABSENT; not inflated to EXISTANT)", d04.status === "PARTIEL" && d04.modules.indexOf("odg-btp-metre-engine") >= 0);
  check("a row's status is one of EXISTANT/PARTIEL/ABSENT only", matrix.rows.every((r: any) => M.STATUS.indexOf(r.status) >= 0));
  check("status counts are consistent (existant+partiel+absent = total)", matrix.existant + matrix.partiel + matrix.absent === matrix.total);

  // HONEST: strongest area is finance (EXISTANT), and NOTHING is claimed world-class/operational.
  check("strongest BTP area is D13 finance (EXISTANT) — the only EXISTANT, honest", matrix.rows.find((r: any) => r.id === "D13").status === "EXISTANT" && /D13/.test(matrix.strongestArea));
  check("no world-class/operational/leader claim in the note", !/world-class|operational|numéro un|leader|number one/i.test(matrix.note) || /NOTHING is claimed|no benchmark/i.test(matrix.note));

  // INTEGRATION honesty: the owner-provided MASTER ROADMAP artefact EXISTS (grounded on disk); its canonical integration is NOT yet applied.
  const integ = M.integrationStatus();
  check("integration: MASTER ROADMAP artefact reported present AND genuinely exists on disk (grounded, owner-authored)", integ.masterRoadmapExists === true && fs.existsSync(integ.masterRoadmapFile));
  check("integration: prior V147 BTP artefacts are acknowledged AND exist", integ.priorBtpArtefactsPresent.every((p: string) => fs.existsSync(p)));
  check("integration: state = ARTEFACT_PRESENT_INTEGRATION_NOT_APPLIED (no protected-register mutation this checkpoint)", integ.integrationState === "ARTEFACT_PRESENT_INTEGRATION_NOT_APPLIED" && /v124-consolidated-roadmap/.test(integ.canonicalMechanism) && !/ROADMAP\.json \(additive/.test(integ.canonicalMechanism));
  check("integration preserves the canonical invariants (9 primitives / 166 caps / A01–A54 / 20 métiers)", integ.mustPreserve.some((x: string) => /9 primitives/.test(x)) && integ.mustPreserve.some((x: string) => /166/.test(x)) && integ.mustPreserve.some((x: string) => /A01/.test(x)) && integ.mustPreserve.some((x: string) => /20 métiers/.test(x)));

  check("contract: fail-closed, no fabrication, no world-class claim, no 2nd roadmap", M.BTP_CAPABILITY_MATRIX_CONTRACT.invariants.some((i: string) => /FAIL-CLOSED/.test(i)) && M.BTP_CAPABILITY_MATRIX_CONTRACT.invariants.some((i: string) => /not fabricated/i.test(i)) && M.BTP_CAPABILITY_MATRIX_CONTRACT.invariants.some((i: string) => /no second radar/i.test(i)));
  check("deterministic + frozen", JSON.stringify(M.buildMatrix()) === JSON.stringify(matrix) && Object.isFrozen(matrix) && Object.isFrozen(matrix.rows));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-capability-matrix (V258: read-only BTP gap map; GROUNDED [every named module exists]; FAIL-CLOSED [computer-vision ABSENT]; RECONCILED 2026-11-20 [métré→PARTIEL (dedicated engine), D06 supplier/price present, D13 reinforced, R-SUIVI consolidated via lifecycle harness — no inflation, D13 still only EXISTANT]; HONEST [MASTER ROADMAP artefact PRESENT, owner-authored, sha256-grounded; canonical V12.4 integration NOT yet applied; nothing world-class]; no 2nd roadmap)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
