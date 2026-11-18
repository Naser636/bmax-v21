#!/usr/bin/env node
"use strict";
/* V280/V281 §7 (P2 Lot 7) — Connecteurs / UX functional assistants. Verifies ABSENT→PARTIAL: connector modules exist on disk
 * (external send gated), dashboard exposure NOT_READY (controls unmet). Real readiness computation; prepare-only; present≠live,
 * built≠exposed; PARTIAL not OPERATIONAL; completes 20/20. SYNTHETIC. */
const fs = require("fs");
const A = require("./odg-connectors-ux-assistants.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

function main() {
  const input = { surfaceCtx: { dashboard: { asOf: 10, nowDay: 12, odg: { missions: [{ id: "M1", status: "READY" }] } } } };  // commercial absent ⇒ UNKNOWN

  // every named connector module EXISTS on disk (anti-fabrication — proves D16 is PARTIAL not ABSENT).
  const missing = A.CONNECTOR_MODULES.filter((m: string) => !fs.existsSync("runtime/core/" + m + ".ts"));
  check("D16 connector modules all EXIST on disk (" + A.CONNECTOR_MODULES.length + " refs) — verified PARTIAL not ABSENT", missing.length === 0 && A.CONNECTOR_MODULES.length >= 7);

  const lot = A.runLot7(input);
  check("runLot7: 2 assistants (Connecteurs/UX), all ok, all PREPARE-only, NONE operational; 20/20 domains", lot.ok && lot.assistantCount === 2 && lot.allPrepareOnly === true && lot.anyOperational === false && /20 of 20/.test(lot.note));

  const con = A.runConnectorUxAssistant("CONNECTEURS", input);
  check("Connecteurs: real inventory (≥7 present) + email outbound NOT live (sendEnabled false); production integration OWNER_GATED",
    con.ok && con.domainFindings.kind === "CONNECTORS" && con.domainFindings.connectorsPresent >= 7 && con.domainFindings.externalSendEnabled === false && con.domainFindings.productionIntegrationGated === true && con.domainFindings.presentIsNotLive === true && /ABSENT→PARTIAL/.test(con.domainFindings.coverageCorrection));
  check("Connecteurs: credentials never accessed; forbidden to enable integration/send externally/expose secrets autonomously",
    con.domainFindings.credentialsNeverAccessed === true && con.forbiddenActions.some((x: string) => /external\/production integration autonomously/.test(x)) && con.forbiddenActions.some((x: string) => /access or expose credentials/.test(x)) && con.forbiddenActions.some((x: string) => /send an external message\/email without approval/.test(x)));

  const ux = A.runConnectorUxAssistant("EXPERIENCE_UTILISATEUR", input);
  check("UX: real exposure readiness via dashboard-exposure-readiness — NOT_READY, 6 required controls, missing>0; exposure gated",
    ux.ok && ux.domainFindings.kind === "UX_EXPOSURE" && ux.domainFindings.verdict === "NOT_READY" && ux.domainFindings.requiredControls === 6 && ux.domainFindings.missingControls > 0 && ux.domainFindings.exposureReady === false && ux.domainFindings.productionExposureGated === true);
  check("UX: built dashboard ≠ exposed; forbidden to expose UI autonomously / mint token w/o approval / modify TLS-proxy-firewall",
    ux.domainFindings.builtIsNotExposed === true && /ABSENT→PARTIAL/.test(ux.domainFindings.coverageCorrection) && ux.forbiddenActions.some((x: string) => /expose a dashboard\/UI to the network autonomously/.test(x)) && ux.forbiddenActions.some((x: string) => /mint\/provision an exposure token without approval/.test(x)) && ux.forbiddenActions.some((x: string) => /modify TLS\/reverse-proxy\/firewall/.test(x)));

  // UNKNOWN surfacing + prepare-only + fail-closed + determinism + contract.
  check("UNKNOWN ≠ 0 surfaced (commercial absent ⇒ missingDataCount>0, decidable false)", con.missingDataCount > 0 && con.decidable === false && ux.missingDataCount > 0);
  check("both assistants: executesNothing true, maturity PARTIAL not operational", [con, ux].every((a: any) => a.executesNothing === true && a.maturity.status === "PARTIAL" && a.maturity.operational === false));
  check("unknown assistant id ⇒ UNKNOWN_ASSISTANT (fail-closed)", A.runConnectorUxAssistant("XYZ", input).code === "UNKNOWN_ASSISTANT");
  check("deterministic + frozen", JSON.stringify(A.runConnectorUxAssistant("CONNECTEURS", input)) === JSON.stringify(con) && Object.isFrozen(A.CX_ASSISTANTS));
  check("contract: verified ABSENT→PARTIAL; present≠live; exposure gated; credentials never; PARTIAL not OPERATIONAL; completes 20/20",
    A.CONNECTORS_UX_ASSISTANTS_CONTRACT.invariants.some((i: string) => /ABSENT→PARTIAL/.test(i)) && A.CONNECTORS_UX_ASSISTANTS_CONTRACT.invariants.some((i: string) => /present connector is NOT a live integration/.test(i)) && A.CONNECTORS_UX_ASSISTANTS_CONTRACT.invariants.some((i: string) => /completes 20\/20/.test(i)));

  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-connectors-ux-assistants (V280/V281 P2 Lot 7: Connecteurs [≥7 real connector modules present, external send NOT live/gated, credentials never, present≠live] / UX [exposure NOT_READY 6 controls unmet, built≠exposed, no autonomous network exposure]; verified ABSENT→PARTIAL; all PREPARE/RECOMMEND only; UNKNOWN≠0; PARTIAL not OPERATIONAL; completes 20/20 domains; reuse — no new engine)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
