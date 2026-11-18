#!/usr/bin/env node
"use strict";

/*
 * V280/V281 §4 (P2 Lot 6) — ODG FUNCTIONAL ASSISTANTS: Modèle économique (D20), IA & autonomie (D17), Assistant-maçon/voix
 * terrain (D03). Canonical domain names verified against V269. REAL functional assistants: each composes the V275 surface AND
 * its domain engine(s) for deterministic findings.
 *
 * REUSE (no new engine / no 10th primitive / no parallel orchestrator):
 *   - D20 Économique: odg-business-model-families (selectPrimaryProduct) + odg-three-person-economic-model (TEAM_CAP).
 *   - D17 IA/autonomie: odg-observation-currency (ASSERTABLE — memory ≠ current fact) + odg-mission-orchestrator (routing).
 *   - D03 Maçon/voix: odg-btp-vision-voice-pipeline (availableEngines — recognition status).
 *   - All: odg-executive-surface (V275) for governed context.
 *
 * HONESTY: PREPARE/RECOMMEND only. Économique: figures are PLANNING/TARGET (FORECAST ≠ REALIZED; €5M/€500M are ambitions,
 * NOT realized sales). IA/autonomie: a memorized datum is NOT automatically a current fact (only CURRENT_OBSERVED/VERIFIED/
 * CORROBORATED are assertable-as-current); an LLM NEVER overrides deterministic policy/finance/Truth Lock; native-autonomy
 * ratio is NOT instrumented ⇒ reported as NOT_MEASURED (V281 §6), never invented. Voix: OCR/STT recognition is BLOCKED (no
 * engine) ⇒ machine extraction is ESTIMATED, NEVER MEASURED; a voice command is never executed autonomously. Deterministic.
 */

const SURFACE = require("./odg-executive-surface.js");            // V275
const BM = require("./odg-business-model-families.js");          // selectPrimaryProduct
const TP = require("./odg-three-person-economic-model.js");      // TEAM_CAP
const OC = require("./odg-observation-currency.js");             // ASSERTABLE (memory ≠ current)
const MO = require("./odg-mission-orchestrator.js");             // routing (single orchestrator, reused)
const VV = require("./odg-btp-vision-voice-pipeline.js");        // availableEngines (recognition status)

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

const IE_ASSISTANTS = Object.freeze({
  MODELE_ECONOMIQUE: Object.freeze({
    id: "MODELE_ECONOMIQUE", domain: "Modèle économique et valeur client (D20)", engine: "odg-business-model-families + odg-three-person-economic-model",
    mandate: "report the modelled business-family mix and the ≤3-person economic constraint — figures are PLANNING/TARGET scenarios, NOT realized results; €5M/€500M are ambitions, never claimed achieved",
    authorizedActions: Object.freeze(["report the selected primary product family (model)", "report the 3-person team ceiling constraint", "prepare scenario analysis (planning estimates)"]),
    forbiddenActions: Object.freeze(["present a forecast as realized revenue", "claim a profitability/traction result without measured data", "exceed the 3-person team ceiling in a plan"]),
    decisionLevelMax: "C",
  }),
  IA_AUTONOMIE: Object.freeze({
    id: "IA_AUTONOMIE", domain: "Intelligence artificielle et autonomie (D17)", engine: "odg-observation-currency + odg-mission-orchestrator",
    mandate: "govern model routing (deterministic-first; LLM is PROPOSER_ONLY) and observation currency (a memorized datum is NOT automatically a current fact) — an LLM NEVER overrides deterministic policy/finance/Truth Lock",
    authorizedActions: Object.freeze(["report which observation currencies are assertable-as-current", "confirm deterministic-first model routing", "report native-autonomy instrumentation status honestly"]),
    forbiddenActions: Object.freeze(["treat a memorized datum as a current fact", "let an LLM override deterministic policy/finance/Truth Lock", "claim native engineering autonomy for provider-authored work", "invent an autonomy metric that is not instrumented"]),
    decisionLevelMax: "C",
  }),
  MACON_VOIX: Object.freeze({
    id: "MACON_VOIX", domain: "Assistant du maçon et des équipes — voix terrain (D03)", engine: "odg-btp-vision-voice-pipeline.availableEngines",
    mandate: "report the field voice/vision recognition status and structure human-provided field info — OCR/STT recognition is BLOCKED (no engine); machine extraction is ESTIMATED never MEASURED; a voice command is never executed autonomously",
    authorizedActions: Object.freeze(["report recognition-engine availability (currently none)", "structure human-provided field reports", "flag that voice→event needs STT (absent)"]),
    forbiddenActions: Object.freeze(["recognise voice/image without a real STT/OCR engine", "promote a machine extraction to MEASURED", "execute a voice command with financial/contractual effect autonomously"]),
    decisionLevelMax: "B",
  }),
});

function domainFindings(id: string, input: any): any {
  const i = isObj(input) ? input : {};
  if (id === "MODELE_ECONOMIQUE") {
    const sel = BM.selectPrimaryProduct();
    return Object.freeze({ kind: "ECONOMIC", primaryProductFamily: sel.primaryProduct, familyCount: BM.FAMILIES.length, teamCap: TP.TEAM_CAP, figuresBasis: "PLANNING_ESTIMATE/TARGET", forecastIsNotRealized: true, fiveMAndFiveHundredMAreAmbitions: true });
  }
  if (id === "IA_AUTONOMIE") {
    return Object.freeze({ kind: "IA_AUTONOMY", currencyStates: OC.CURRENCY.length, assertableAsCurrent: OC.ASSERTABLE.slice(), memoryIsNotCurrentFact: OC.ASSERTABLE.length < OC.CURRENCY.length, singleOrchestrator: typeof MO.routeMission === "function", deterministicFirstRouting: true, llmNeverOverridesDeterministic: true, nativeAutonomyRatio: "NOT_MEASURED" });
  }
  if (id === "MACON_VOIX") {
    const ae = VV.availableEngines();
    const ocrAny = Object.keys(ae.ocr || {}).some((k) => k !== "note" && ae.ocr[k] === true);
    const sttAny = Object.keys(ae.stt || {}).some((k) => k !== "note" && ae.stt[k] === true);
    return Object.freeze({ kind: "MACON_VOIX", asOf: ae.asOf, ocrAvailable: ocrAny, sttAvailable: sttAny, recognitionBlocked: !ocrAny && !sttAny, machineExtractionIsEstimatedNeverMeasured: true, voiceCommandNeverAutonomous: true });
  }
  return Object.freeze({ kind: "NONE" });
}

/** runIntelligenceEconomicAssistant(id, input) -> governed role-scoped projection + real domain findings. */
function runIntelligenceEconomicAssistant(id: string, input: any): any {
  const spec = (IE_ASSISTANTS as any)[id];
  if (!spec) return Object.freeze({ ok: false, code: "UNKNOWN_ASSISTANT", detail: "id ∈ " + Object.keys(IE_ASSISTANTS).join("/") });
  const i = isObj(input) ? input : {};
  const surface = SURFACE.buildSurface(isObj(i.surfaceCtx) ? i.surfaceCtx : {});
  if (surface.ok !== true) return Object.freeze({ ok: false, code: "SURFACE_FAILED" });
  const findings = domainFindings(id, i);
  const missingData = (surface.dataIntegrity.unknown || 0) + (surface.dataIntegrity.noData || 0);
  const maturity = Object.freeze({
    status: "PARTIAL", operational: false,
    built: Object.freeze(["real domain computation via " + spec.engine, "missing-data surfacing", "prepare/recommend-only (max authority " + spec.decisionLevelMax + ")"]),
    partial: Object.freeze(["recommendations are governed proposals, not executed", "economic figures are planning estimates; recognition BLOCKED; native-autonomy NOT instrumented"]),
    absent: Object.freeze(["real company/economic data feed", "OCR/STT recognition engines", "native-autonomy instrumentation (NOT_MEASURED)"]),
  });
  return Object.freeze({
    ok: true, assistant: spec.id, domain: spec.domain, mandate: spec.mandate, engine: spec.engine, decisionLevelMax: spec.decisionLevelMax,
    domainFindings: findings, executesNothing: true, missingDataCount: missingData, decidable: surface.dataIntegrity.decidable,
    authorizedActions: spec.authorizedActions, forbiddenActions: spec.forbiddenActions, maturity,
    note: "intelligence/economic assistant = real domain computation (" + spec.engine + ") + governed surface context. PREPARE/RECOMMEND only; FORECAST≠REALIZED (€5M/€500M ambitions); memory≠current fact; LLM never overrides deterministic/Truth Lock; native-autonomy NOT_MEASURED (V281 §6); OCR/STT recognition BLOCKED (extraction ESTIMATED never MEASURED); UNKNOWN≠0; PARTIAL not OPERATIONAL. Reuse — no new engine/orchestrator/primitive.",
  });
}

/** runLot6(input) -> the three Lot-6 assistants over one input. */
function runLot6(input: any): any {
  const ids = ["MODELE_ECONOMIQUE", "IA_AUTONOMIE", "MACON_VOIX"];
  const assistants = ids.map((id) => runIntelligenceEconomicAssistant(id, input));
  return Object.freeze({ ok: assistants.every((a: any) => a.ok), lot: "P2_LOT_6", assistantCount: assistants.length, assistants: Object.freeze(assistants),
    allPrepareOnly: assistants.every((a: any) => a.ok && a.executesNothing), anyOperational: assistants.some((a: any) => a.ok && a.maturity.operational),
    note: "P2 Lot 6 — Modèle économique / IA-autonomie / Assistant-maçon-voix as functional assistants; all PREPARE/RECOMMEND only, none OPERATIONAL. 18 of 20 domains across Lots 1-6 (D16 connecteurs + D18 UX remain — verify frontend/connector caps before concluding ABSENT)." });
}

const INTELLIGENCE_ECONOMIC_ASSISTANTS_CONTRACT = Object.freeze({
  id: "V280-ODG-INTELLIGENCE-ECONOMIC-ASSISTANTS-LOT6",
  source: "V280/V281 §4 (P2 Lot 6) — Modèle économique (D20) / IA-autonomie (D17) / Assistant-maçon-voix (D03)",
  assistants: Object.freeze(Object.keys(IE_ASSISTANTS)),
  reuses: Object.freeze(["odg-executive-surface (V275)", "odg-business-model-families", "odg-three-person-economic-model", "odg-observation-currency", "odg-mission-orchestrator (single orchestrator)", "odg-btp-vision-voice-pipeline"]),
  invariants: Object.freeze([
    "real domain computation via existing engines (reuse, no new engine, no 10th primitive, no parallel orchestrator); PREPARE/RECOMMEND only, executionResult null",
    "Économique: FORECAST ≠ REALIZED; €5M/€500M are ambitions, never realized sales; the ≤3-person team ceiling is a constraint",
    "IA/autonomie: a memorized datum is NOT automatically a current fact (only CURRENT_OBSERVED/VERIFIED/CORROBORATED assertable); an LLM NEVER overrides deterministic/Truth Lock; native-autonomy ratio NOT_MEASURED (never invented, V281 §6)",
    "Maçon/voix: OCR/STT recognition is BLOCKED (no engine); machine extraction is ESTIMATED never MEASURED; a voice command with financial/contractual effect is never autonomous",
    "UNKNOWN ≠ 0; maturity PARTIAL — NO assistant OPERATIONAL; deterministic/read-only; 18 of 20 domains across Lots 1-6",
  ]),
});

module.exports = { IE_ASSISTANTS, runIntelligenceEconomicAssistant, runLot6, INTELLIGENCE_ECONOMIC_ASSISTANTS_CONTRACT };

export {};
