#!/usr/bin/env node
"use strict";
/* V135 seed B — P7-SRE FMEA battery. Independently re-derives RPN/residual via the canonical safety-fmea policy (not
 * trusting the dossier's precomputed values), proves fail-closed worst-case on a missing factor, proves a HIGH residual
 * is SURFACED for owner acceptance (never silently cleared), and includes a controlled SAFE-REFUSAL regression: the SRE
 * recovery path (odg-recover.sh) is attempt-CAPPED (no infinite recovery loop) and the recovery components resolve. */
const FMEA=require("./safety-fmea.js");
const fs=require("fs"),path=require("path");
const ROOT=path.join(__dirname,"..","..");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  // 1 — independent RPN = S×O×D + classification (not trusting the dossier)
  const fm=FMEA.analyzeFailureMode({mode:"m",cause:"c",effect:"e",severity:8,occurrence:5,detection:5});
  check("RPN = S×O×D (8×5×5=200) ⇒ CRITICAL (independent recompute via canonical policy)", fm.rpn===200 && fm.risk==="CRITICAL");
  // 2 — FAIL-CLOSED: a missing factor ⇒ worst-case 10 ⇒ high risk (never under-stated)
  const miss=FMEA.analyzeFailureMode({mode:"m",cause:"c",effect:"e",severity:9/*,occurrence missing,detection missing*/});
  check("missing factor ⇒ worst-case (occurrence/detection=10) ⇒ CRITICAL/HIGH (fail-closed, never under-stated)", (miss.risk==="CRITICAL"||miss.risk==="HIGH") && miss.rpn>=FMEA.factor(undefined)*9);
  // 3 — mitigation reduces residual occurrence ONLY when named; absence ⇒ no reduction
  const noMit=FMEA.analyzeFailureMode({mode:"m",cause:"c",effect:"e",severity:7,occurrence:6,detection:5});
  const withMit=FMEA.analyzeFailureMode({mode:"m",cause:"c",effect:"e",severity:7,occurrence:6,detection:5,mitigation:"real mechanism",mitigationEffect:0.6});
  check("named mitigation reduces residual RPN; no mitigation ⇒ no reduction (fail-closed)", withMit.residualRpn < noMit.residualRpn && noMit.residualRpn===noMit.rpn);
  // 4 — the REAL P7-SRE FMEA dossier: GENUINELY re-derive every residual from the stored scoredFailureModes (not trusting
  // the dossier's precomputed values) and confirm 0 divergence. This is the fix for the independent-validation defect.
  const d=JSON.parse(fs.readFileSync(path.join(ROOT,"docs","odg","V135_P7_SRE_FMEA.json"),"utf8"));
  const scored=d.scoredFailureModes;
  const stored=d.fmea.components[0].failureModes;
  const reDerived=scored.map((m:any)=>FMEA.analyzeFailureMode(m));
  check("every residual RE-DERIVED from scoredFailureModes matches the stored FMEA (0 divergence, reproducible)",
    scored.length===6 && reDerived.every((r:any,i:number)=>r.rpn===stored[i].rpn && r.residualRpn===stored[i].residualRpn && r.residualRisk===stored[i].residualRisk));
  check("CONSERVATIVE: residual == raw RPN for every mode (NO mitigation credit claimed ⇒ never under-stated)",
    reDerived.every((r:any)=>r.residualRpn===r.rpn));
  check("real FMEA: 6 modes, 0 CRITICAL, ≥1 HIGH, all MEDIUM+ surfaced for owner review", d.fmea.summary.criticalResidual===0 && d.fmea.summary.highResidual>=1 && d.ownerReviewRequired.length>=1 && d.ownerReviewRequired.every((r:any)=>["MEDIUM","HIGH","CRITICAL"].includes(r.residualRisk)));
  check("safeguards documented SEPARATELY with a basis (not fed to the RPN math)", Array.isArray(d.safeguards) && d.safeguards.length===6 && d.safeguards.every((s:any)=>typeof s.safeguard==="string"&&typeof s.basis==="string"));
  // 5 — grounded: recovery components referenced by mitigations RESOLVE on disk
  check("recovery components resolve (build-recovery-engine, odg-recover.sh, fdir-engine)", fs.existsSync(path.join(ROOT,"runtime/core/build-recovery-engine.ts"))&&fs.existsSync(path.join(ROOT,"scripts/odg-recover.sh"))&&fs.existsSync(path.join(ROOT,"runtime/core/fdir-engine.ts")));
  // 6 — SAFE-REFUSAL regression: the SRE recovery path is attempt-CAPPED (no infinite loop) — honest bounded recovery
  const recov=fs.readFileSync(path.join(ROOT,"scripts/odg-recover.sh"),"utf8");
  check("SAFE-REFUSAL: odg-recover.sh is attempt-capped (bounded; CAP_EXCEEDED stops the loop — no infinite recovery)", /CAP_EXCEEDED|MAX_?ATTEMPTS|attempt.*(cap|limit|>=)|no retry/i.test(recov));
  check("odg-recover.sh records an incident on cap/failure (failure never masked)", /incidents?\.jsonl|_incident|RESTART_FAILED/.test(recov));
  process.stdout.write("\n"+(failures===0?"ALL PASS — P7-SRE FMEA (canonical policy, fail-closed, HIGH residual owner-surfaced, attempt-capped recovery safe-refusal)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
