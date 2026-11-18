#!/usr/bin/env node
"use strict";

/*
 * V280/V281 §7 (P2 Lot 7) — ODG FUNCTIONAL ASSISTANTS: Connecteurs & automatisation (D16), Expérience utilisateur / exposition
 * (D18). The V269 coverage marked both ABSENT; per the directive (verify frontend/connector capabilities before concluding
 * impossibility) this lot VERIFIES the real capabilities and finds them PARTIAL (not ABSENT): connector modules EXIST but
 * production/external integration is OWNER_GATED; dashboards EXIST but UI exposure is NOT_READY (controls unmet). Honest
 * correction — completes the 20/20 domain coverage.
 *
 * REUSE (no new engine): existing connector modules (data-connector / finance-data-connector / email-gateway / einvoice-export
 * / ted-connector / tender-feed-connector / api-contract) + email-gateway.outboundReadiness + dashboard-exposure-readiness.
 * assessExposureReadiness + odg-executive-surface (V275).
 *
 * HONESTY: PREPARE/RECOMMEND only. Connecteurs: external/production integration + autonomous external send are OWNER_GATED;
 * credentials are NEVER accessed/exposed; a present connector is NOT a live integration. UX: production exposure requires unmet
 * controls ⇒ NOT_READY; a built dashboard is NOT an exposed/operational UI. UNKNOWN ≠ 0; no assistant OPERATIONAL. Deterministic.
 */

const SURFACE = require("./odg-executive-surface.js");            // V275
const EG = require("./email-gateway.js");                        // outboundReadiness (send gated)
const DE = require("./dashboard-exposure-readiness.js");         // assessExposureReadiness

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// the connector modules that genuinely EXIST in the repo (the test fs-grounds each on disk).
const CONNECTOR_MODULES = Object.freeze(["data-connector", "finance-data-connector", "email-gateway", "einvoice-export", "ted-connector", "tender-feed-connector", "api-contract", "intake-endpoint"]);

const CX_ASSISTANTS = Object.freeze({
  CONNECTEURS: Object.freeze({
    id: "CONNECTEURS", domain: "Automatisation et connecteurs (D16)", engine: "existing connector modules + email-gateway.outboundReadiness",
    mandate: "inventory the existing connectors and report their readiness — a present connector is NOT a live integration; external/production integration and autonomous external send are OWNER_GATED; credentials are never accessed",
    authorizedActions: Object.freeze(["inventory present connector modules", "report connector readiness (configured / not configured)", "prepare an integration proposal for owner approval"]),
    forbiddenActions: Object.freeze(["enable an external/production integration autonomously", "send an external message/email without approval", "access or expose credentials/secrets", "claim a connector is live without configuration"]),
    decisionLevelMax: "C",
  }),
  EXPERIENCE_UTILISATEUR: Object.freeze({
    id: "EXPERIENCE_UTILISATEUR", domain: "Performance et expérience utilisateur / exposition (D18)", engine: "dashboard-exposure-readiness.assessExposureReadiness",
    mandate: "report UI/dashboard exposure readiness against the required controls — a built dashboard is NOT an exposed or operational UI; production exposure is OWNER_GATED until all controls are met",
    authorizedActions: Object.freeze(["assess exposure readiness against required controls", "list missing controls", "prepare an exposure dossier for owner confirmation"]),
    forbiddenActions: Object.freeze(["expose a dashboard/UI to the network autonomously", "mint/provision an exposure token without approval", "claim a built dashboard is operational/exposed", "modify TLS/reverse-proxy/firewall"]),
    decisionLevelMax: "C",
  }),
});

function domainFindings(id: string, input: any): any {
  const i = isObj(input) ? input : {};
  if (id === "CONNECTEURS") {
    const ob = EG.outboundReadiness(isObj(i.emailConfig) ? i.emailConfig : {});
    return Object.freeze({ kind: "CONNECTORS", connectorsPresent: CONNECTOR_MODULES.length, connectors: CONNECTOR_MODULES.slice(), externalSendEnabled: ob.sendEnabled === true, emailOutboundState: ob.state, productionIntegrationGated: true, credentialsNeverAccessed: true, presentIsNotLive: true, coverageCorrection: "ABSENT→PARTIAL (connectors exist; production wiring OWNER_GATED)" });
  }
  if (id === "EXPERIENCE_UTILISATEUR") {
    const a = DE.assessExposureReadiness(isObj(i.exposure) ? i.exposure : {});
    return Object.freeze({ kind: "UX_EXPOSURE", verdict: a.verdict, requiredControls: DE.REQUIRED_CONTROLS.length, missingControls: Array.isArray(a.missing) ? a.missing.length : null, exposureReady: a.verdict === "READY", productionExposureGated: true, builtIsNotExposed: true, coverageCorrection: "ABSENT→PARTIAL (dashboards exist; exposure NOT_READY until controls met)" });
  }
  return Object.freeze({ kind: "NONE" });
}

/** runConnectorUxAssistant(id, input) -> governed role-scoped projection + real domain findings. */
function runConnectorUxAssistant(id: string, input: any): any {
  const spec = (CX_ASSISTANTS as any)[id];
  if (!spec) return Object.freeze({ ok: false, code: "UNKNOWN_ASSISTANT", detail: "id ∈ " + Object.keys(CX_ASSISTANTS).join("/") });
  const i = isObj(input) ? input : {};
  const surface = SURFACE.buildSurface(isObj(i.surfaceCtx) ? i.surfaceCtx : {});
  if (surface.ok !== true) return Object.freeze({ ok: false, code: "SURFACE_FAILED" });
  const findings = domainFindings(id, i);
  const missingData = (surface.dataIntegrity.unknown || 0) + (surface.dataIntegrity.noData || 0);
  const maturity = Object.freeze({
    status: "PARTIAL", operational: false,
    built: Object.freeze(["real readiness computation via " + spec.engine, "prepare/recommend-only (max authority " + spec.decisionLevelMax + ")"]),
    partial: Object.freeze(["connectors/dashboards present but production integration/exposure OWNER_GATED", "fed synthetic config, not real production config"]),
    absent: Object.freeze(["live external integration (owner-gated)", "network exposure (owner-gated, controls unmet)", "credentials (never accessed)"]),
  });
  return Object.freeze({
    ok: true, assistant: spec.id, domain: spec.domain, mandate: spec.mandate, engine: spec.engine, decisionLevelMax: spec.decisionLevelMax,
    domainFindings: findings, executesNothing: true, missingDataCount: missingData, decidable: surface.dataIntegrity.decidable,
    authorizedActions: spec.authorizedActions, forbiddenActions: spec.forbiddenActions, maturity,
    note: "connector/UX assistant = real readiness computation (" + spec.engine + ") + governed surface context. PREPARE/RECOMMEND only; connectors present but production/external integration + send OWNER_GATED (credentials never accessed); dashboards present but exposure NOT_READY (OWNER_GATED); present/built ≠ live/exposed/operational; UNKNOWN ≠ 0; PARTIAL not OPERATIONAL. Reuse — no new engine.",
  });
}

/** runLot7(input) -> the two Lot-7 assistants (completes the 20-domain coverage). */
function runLot7(input: any): any {
  const ids = ["CONNECTEURS", "EXPERIENCE_UTILISATEUR"];
  const assistants = ids.map((id) => runConnectorUxAssistant(id, input));
  return Object.freeze({ ok: assistants.every((a: any) => a.ok), lot: "P2_LOT_7", assistantCount: assistants.length, assistants: Object.freeze(assistants),
    allPrepareOnly: assistants.every((a: any) => a.ok && a.executesNothing), anyOperational: assistants.some((a: any) => a.ok && a.maturity.operational),
    note: "P2 Lot 7 — Connecteurs / Expérience utilisateur as functional assistants; both PREPARE/RECOMMEND only, none OPERATIONAL. Verified ABSENT→PARTIAL (capabilities exist, production integration/exposure OWNER_GATED). 20 of 20 domains now covered across Lots 1-7." });
}

const CONNECTORS_UX_ASSISTANTS_CONTRACT = Object.freeze({
  id: "V280-ODG-CONNECTORS-UX-ASSISTANTS-LOT7",
  source: "V280/V281 §7 (P2 Lot 7) — Connecteurs (D16) / Expérience utilisateur (D18) functional assistants",
  assistants: Object.freeze(Object.keys(CX_ASSISTANTS)), connectorModules: CONNECTOR_MODULES,
  reuses: Object.freeze(["odg-executive-surface (V275)", "email-gateway (outboundReadiness)", "dashboard-exposure-readiness (assessExposureReadiness)", "existing connector modules (data-connector/finance-data-connector/einvoice-export/ted-connector/tender-feed-connector/api-contract/intake-endpoint)"]),
  invariants: Object.freeze([
    "verified ABSENT→PARTIAL: connector modules + dashboards EXIST; production/external integration + network exposure are OWNER_GATED (not ABSENT, not OPERATIONAL)",
    "a present connector is NOT a live integration; external send is OWNER_GATED; credentials are NEVER accessed/exposed; no connector claimed live without configuration",
    "UI exposure requires all required controls (NOT_READY until met); a built dashboard is NOT an exposed/operational UI; no autonomous network exposure / TLS / reverse-proxy change",
    "PREPARE/RECOMMEND only (executionResult n/a — findings only); UNKNOWN ≠ 0; maturity PARTIAL — NO assistant OPERATIONAL; deterministic/read-only; completes 20/20 domains",
  ]),
});

module.exports = { CX_ASSISTANTS, CONNECTOR_MODULES, runConnectorUxAssistant, runLot7, CONNECTORS_UX_ASSISTANTS_CONTRACT };

export {};
