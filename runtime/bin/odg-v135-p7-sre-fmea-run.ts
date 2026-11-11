#!/usr/bin/env node
"use strict";
/* V135 seed B (remediated per independent validation) — apply canonical safety-fmea to P7-SRE. CONSERVATIVE + FULLY
 * REPRODUCIBLE: the scored failure modes carry ONLY {mode,cause,effect,severity,occurrence,detection} ⇒ the residual =
 * raw RPN (NO mitigation credit claimed — fail-closed, never under-stated). Real safeguards (detection/containment/
 * safe-refusal/recovery) are documented SEPARATELY with a stated basis — NOT fed into the RPN math (no invented reduction).
 * The stored `scoredFailureModes` are exactly what analyzeFailureMode consumes, so every residual is re-derivable (tested).
 * Writes docs/odg/V135_P7_SRE_FMEA.json. */
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..",".."),D=path.join(ROOT,"docs","odg");
const FMEA=require(path.join(ROOT,"runtime","core","safety-fmea.js"));
// SCORED modes: S/O/D only (no mitigation ⇒ residual = rpn, fail-closed). safeguard/basis are documentation, not math.
const MODES=[
 {mode:"production service outage (odg-preprod down)",cause:"process crash / OOM",effect:"dashboard unavailable",severity:8,occurrence:3,detection:2,safeguard:"systemd Restart=on-failure + odg-healthcheck 3-strike + odg-recover.sh",basis:"detection=2: healthcheck polls ~10s + systemd supervision"},
 {mode:"restart storm (unit loops on a start failure)",cause:"stale unit path / MODULE_NOT_FOUND",effect:"journal/disk/CPU churn",severity:6,occurrence:4,detection:2,safeguard:"StartLimitBurst=5/300s bounds the loop (corrected fleet-bridge unit) + odg-monitor",basis:"occurrence=4: observed (fleet-bridge); detection=2: NRestarts+monitor"},
 {mode:"recovery loop cannot recover",cause:"release artifact corrupt",effect:"prolonged outage",severity:9,occurrence:2,detection:3,safeguard:"odg-recover HARD ATTEMPT CAP (CAP_EXCEEDED, exit 3, no self-OnFailure) + rollback to verified previous release",basis:"severity=9: prolonged down; attempt-cap prevents infinite loop"},
 {mode:"stale/false health evidence",cause:"buildId drift vs current release",effect:"false-healthy signal",severity:5,occurrence:3,detection:3,safeguard:"dynamic buildId==current-release check (post-deploy-regression) + odg-maintenance-check",basis:"detection=3: dynamic check added V134"},
 {mode:"storage unavailable / disk full",cause:"journal/log growth",effect:"service degradation",severity:6,occurrence:3,detection:4,safeguard:"odg-maintenance-check DISK/backup-age alerts + release pruning (keep-N)",basis:"detection=4: maintenance-check cadence"},
 {mode:"interrupted / bad deployment",cause:"build or activate failure",effect:"degraded or down release",severity:7,occurrence:2,detection:2,safeguard:"odg-release.sh staging verify + atomic swap + health-gated auto-rollback",basis:"detection=2: staging health-check before activation"},
];
// FMEA uses ONLY the scoring factors (strip safeguard/basis so no mitigation credit leaks into the math).
const scored=MODES.map((m:any)=>({mode:m.mode,cause:m.cause,effect:m.effect,severity:m.severity,occurrence:m.occurrence,detection:m.detection}));
const reg=FMEA.buildRiskRegister([{id:"P7-SRE",failureModes:scored}]);
const residualAtLeastMedium=reg.components[0].failureModes.filter((f:any)=>f.residualRisk==="MEDIUM"||f.residualRisk==="HIGH"||f.residualRisk==="CRITICAL");
const out={
 "//":"V135 seed B — P7-SRE FMEA via canonical safety-fmea. Conservative: residual = raw RPN (no mitigation credit claimed, fail-closed). Safeguards documented separately (not in the math). Residuals fully re-derivable from scoredFailureModes (tested). No invented scores.",
 metier:"P7-SRE (profession-p7-sre-reference)",
 policySource:"runtime/core/safety-fmea.ts (RPN=S×O×D 1-10; CRITICAL≥200; HIGH≥100; MEDIUM≥40; fail-closed worst-case=10)",
 scoredFailureModes:scored,                       // exactly what analyzeFailureMode consumes ⇒ reproducible
 safeguards:MODES.map((m:any)=>({mode:m.mode,safeguard:m.safeguard,basis:m.basis})),  // documentation, NOT fed to RPN
 fmea:reg,
 residualRegister:reg.residualRegister,
 ownerReviewRequired:residualAtLeastMedium.map((f:any)=>({mode:f.mode,residualRisk:f.residualRisk,residualRpn:f.residualRpn})),
 honesty:"residuals = raw RPN (NO mitigation reduction claimed ⇒ conservative, never under-stated); safeguards are documented separately with a stated basis and are NOT credited in the RPN math; every residual is re-derivable via analyzeFailureMode(scoredFailureModes[i]) (regression-tested). criticalResidual="+reg.summary.criticalResidual+", highResidual="+reg.summary.highResidual+".",
 status:"FMEA_BUILT_conservative_reproducible",
};
fs.writeFileSync(path.join(D,"V135_P7_SRE_FMEA.json"),JSON.stringify(out,null,2)+"\n");
process.stdout.write(JSON.stringify({status:out.status,failureModes:reg.summary.failureModes,critical:reg.summary.criticalResidual,high:reg.summary.highResidual,mediumPlusForReview:out.ownerReviewRequired.length},null,2)+"\n");
export {};
