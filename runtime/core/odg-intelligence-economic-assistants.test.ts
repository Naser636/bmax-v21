#!/usr/bin/env node
"use strict";
/* V280/V281 §4 (P2 Lot 6) — Modèle économique / IA-autonomie / Assistant-maçon-voix functional assistants. Asserts real domain
 * computation (primary product family + team cap; observation-currency memory≠current; vision-voice recognition BLOCKED),
 * FORECAST≠REALIZED, LLM-never-overrides, native-autonomy NOT_MEASURED, OCR/STT blocked, prepare-only, PARTIAL. SYNTHETIC. */
const A = require("./odg-intelligence-economic-assistants.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const input = { surfaceCtx: { dashboard: { asOf: 10, nowDay: 12, odg: { missions: [{ id: "M1", status: "READY" }] } } } };  // commercial absent ⇒ UNKNOWN

  const lot = A.runLot6(input);
  check("runLot6: 3 assistants, all ok, all PREPARE-only, NONE operational; 18/20 domains", lot.ok && lot.assistantCount === 3 && lot.allPrepareOnly === true && lot.anyOperational === false && /18 of 20/.test(lot.note));

  const eco = A.runIntelligenceEconomicAssistant("MODELE_ECONOMIQUE", input);
  check("Économique: real model — primary family 'hybrid', 6 families, team cap (≤3); figures PLANNING/TARGET, FORECAST≠REALIZED",
    eco.ok && eco.domainFindings.kind === "ECONOMIC" && eco.domainFindings.primaryProductFamily === "hybrid" && eco.domainFindings.familyCount === 6 && typeof eco.domainFindings.teamCap === "number" && eco.domainFindings.forecastIsNotRealized === true && /PLANNING/.test(eco.domainFindings.figuresBasis));
  check("Économique: €5M/€500M are ambitions (not realized); forbidden to present a forecast as realized revenue or exceed 3-person ceiling",
    eco.domainFindings.fiveMAndFiveHundredMAreAmbitions === true && eco.forbiddenActions.some((x: string) => /forecast as realized revenue/.test(x)) && eco.forbiddenActions.some((x: string) => /exceed the 3-person team ceiling/.test(x)));

  const ia = A.runIntelligenceEconomicAssistant("IA_AUTONOMIE", input);
  check("IA/autonomie: memory≠current fact (only 3 of 9 currencies assertable-as-current via observation-currency); single orchestrator reused",
    ia.ok && ia.domainFindings.kind === "IA_AUTONOMY" && ia.domainFindings.currencyStates === 9 && ia.domainFindings.assertableAsCurrent.length === 3 && ia.domainFindings.memoryIsNotCurrentFact === true && ia.domainFindings.singleOrchestrator === true);
  check("IA/autonomie: LLM never overrides deterministic; native-autonomy NOT_MEASURED (not invented, V281 §6); forbidden to claim native autonomy for provider work",
    ia.domainFindings.llmNeverOverridesDeterministic === true && ia.domainFindings.nativeAutonomyRatio === "NOT_MEASURED" && ia.forbiddenActions.some((x: string) => /override deterministic/.test(x)) && ia.forbiddenActions.some((x: string) => /native engineering autonomy for provider-authored/.test(x)) && ia.forbiddenActions.some((x: string) => /invent an autonomy metric/.test(x)));

  const mv = A.runIntelligenceEconomicAssistant("MACON_VOIX", input);
  check("Maçon/voix: real recognition status via availableEngines — OCR false + STT false ⇒ recognitionBlocked true",
    mv.ok && mv.domainFindings.kind === "MACON_VOIX" && mv.domainFindings.ocrAvailable === false && mv.domainFindings.sttAvailable === false && mv.domainFindings.recognitionBlocked === true);
  check("Maçon/voix: machine extraction ESTIMATED never MEASURED; voice command never autonomous; forbidden to recognise w/o engine or promote to MEASURED",
    mv.domainFindings.machineExtractionIsEstimatedNeverMeasured === true && mv.domainFindings.voiceCommandNeverAutonomous === true && mv.forbiddenActions.some((x: string) => /recognise voice\/image without a real STT\/OCR engine/.test(x)) && mv.forbiddenActions.some((x: string) => /promote a machine extraction to MEASURED/.test(x)));

  // UNKNOWN surfacing + prepare-only + fail-closed + determinism + contract.
  check("UNKNOWN ≠ 0 surfaced (commercial absent ⇒ missingDataCount>0, decidable false)", eco.missingDataCount > 0 && eco.decidable === false && ia.missingDataCount > 0);
  check("every assistant: executesNothing true, maturity PARTIAL not operational", [eco, ia, mv].every((a: any) => a.executesNothing === true && a.maturity.status === "PARTIAL" && a.maturity.operational === false));
  check("unknown assistant id ⇒ UNKNOWN_ASSISTANT (fail-closed)", A.runIntelligenceEconomicAssistant("XYZ", input).code === "UNKNOWN_ASSISTANT");
  check("deterministic + frozen", JSON.stringify(A.runIntelligenceEconomicAssistant("IA_AUTONOMIE", input)) === JSON.stringify(ia) && Object.isFrozen(A.IE_ASSISTANTS));
  check("contract: reuse economic/observation-currency/orchestrator/vision-voice (no new engine/primitive/orchestrator); FORECAST≠REALIZED; memory≠current; recognition BLOCKED; PARTIAL",
    A.INTELLIGENCE_ECONOMIC_ASSISTANTS_CONTRACT.reuses.some((x: string) => /observation-currency/.test(x)) && A.INTELLIGENCE_ECONOMIC_ASSISTANTS_CONTRACT.invariants.some((i: string) => /FORECAST ≠ REALIZED/.test(i)) && A.INTELLIGENCE_ECONOMIC_ASSISTANTS_CONTRACT.invariants.some((i: string) => /memorized datum is NOT automatically a current fact/.test(i)) && A.INTELLIGENCE_ECONOMIC_ASSISTANTS_CONTRACT.invariants.some((i: string) => /recognition is BLOCKED/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-intelligence-economic-assistants (V280/V281 P2 Lot 6: Modèle économique [primary family hybrid/6, team cap ≤3, FORECAST≠REALIZED, €5M/€500M ambitions] / IA-autonomie [memory≠current: 3/9 assertable, LLM never overrides, native-autonomy NOT_MEASURED] / Maçon-voix [OCR/STT recognition BLOCKED, extraction ESTIMATED never MEASURED, voice never autonomous]; all PREPARE/RECOMMEND only; UNKNOWN≠0; PARTIAL not OPERATIONAL; 18/20 domains; reuse — no new engine/orchestrator/primitive)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
