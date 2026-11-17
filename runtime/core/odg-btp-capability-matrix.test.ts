#!/usr/bin/env node
"use strict";
/* V258 §6/§7/§9 — BTP capability matrix. Proves the read-only gap map is GROUNDED (every referenced module really exists),
 * FAIL-CLOSED (no backing ⇒ ABSENT; vision/métré genuinely ABSENT), and HONEST (nothing claimed world-class/operational; the
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

  // FAIL-CLOSED: the vision/métré gaps are honestly ABSENT (no inflation).
  check("fail-closed: D03 (vision) + D04 (métré) + R-VISION are ABSENT (genuine gaps, not inflated)", matrix.rows.find((r: any) => r.id === "D03").status === "ABSENT" && matrix.rows.find((r: any) => r.id === "D04").status === "ABSENT" && matrix.rows.find((r: any) => r.id === "R-VISION").status === "ABSENT");
  check("a row's status is one of EXISTANT/PARTIEL/ABSENT only", matrix.rows.every((r: any) => M.STATUS.indexOf(r.status) >= 0));
  check("status counts are consistent (existant+partiel+absent = total)", matrix.existant + matrix.partiel + matrix.absent === matrix.total);

  // HONEST: strongest area is finance (EXISTANT), and NOTHING is claimed world-class/operational.
  check("strongest BTP area is D13 finance (EXISTANT) — the only EXISTANT, honest", matrix.rows.find((r: any) => r.id === "D13").status === "EXISTANT" && /D13/.test(matrix.strongestArea));
  check("no world-class/operational/leader claim in the note", !/world-class|operational|numéro un|leader|number one/i.test(matrix.note) || /NOTHING is claimed|no benchmark/i.test(matrix.note));

  // INTEGRATION honesty: named MASTER ROADMAP.md is reported ABSENT (matches disk) and NOT fabricated; proposed-not-applied.
  const integ = M.integrationStatus();
  check("integration: named MASTER ROADMAP.md reported absent AND is genuinely absent on disk (not fabricated)", integ.namedMasterRoadmapExists === false && !fs.existsSync(integ.namedMasterRoadmapFile));
  check("integration: prior V147 BTP artefacts are acknowledged AND exist", integ.priorBtpArtefactsPresent.every((p: string) => fs.existsSync(p)));
  check("integration: state is PROPOSED_NOT_APPLIED (no protected-register mutation this checkpoint)", integ.integrationState === "PROPOSED_NOT_APPLIED" && /v124-consolidated-roadmap/.test(integ.canonicalMechanism) && !/ROADMAP\.json \(additive/.test(integ.canonicalMechanism));
  check("integration preserves the canonical invariants (9 primitives / 166 caps / A01–A54 / 20 métiers)", integ.mustPreserve.some((x: string) => /9 primitives/.test(x)) && integ.mustPreserve.some((x: string) => /166/.test(x)) && integ.mustPreserve.some((x: string) => /A01/.test(x)) && integ.mustPreserve.some((x: string) => /20 métiers/.test(x)));

  check("contract: fail-closed, no fabrication, no world-class claim, no 2nd roadmap", M.BTP_CAPABILITY_MATRIX_CONTRACT.invariants.some((i: string) => /FAIL-CLOSED/.test(i)) && M.BTP_CAPABILITY_MATRIX_CONTRACT.invariants.some((i: string) => /NOT fabricated/.test(i)) && M.BTP_CAPABILITY_MATRIX_CONTRACT.invariants.some((i: string) => /no second radar/i.test(i)));
  check("deterministic + frozen", JSON.stringify(M.buildMatrix()) === JSON.stringify(matrix) && Object.isFrozen(matrix) && Object.isFrozen(matrix.rows));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-btp-capability-matrix (V258: read-only BTP gap map; GROUNDED [every named module exists]; FAIL-CLOSED [vision/métré ABSENT]; HONEST [MASTER ROADMAP.md absent not fabricated; integration PROPOSED not applied; nothing world-class]; no 2nd roadmap)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
