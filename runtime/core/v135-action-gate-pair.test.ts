#!/usr/bin/env node
"use strict";
/* V135 seed C — controlled allowed/denied action-gate pair. Reuses the canonical evaluateAction (deny-by-default) + the
 * append-only audit-log. Proves: an authorized reversible action is ALLOWED when identity/contract/policy/scope/state are
 * all satisfied; an unauthorized action is DENIED with an explicit attributable reason; refusal has NO side effect (pure);
 * and the decision is recorded as tamper-evident audit evidence. Synthetic/local fixtures only; no real permissions granted. */
const { evaluateAction, DECISION } = require("./action-gate.js");
const AUDIT = require("./audit-log.js");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const VALID_TRANSITION = { state_before:{v:1}, action:{do:"write"}, observed_effect:{wrote:true}, state_after:{v:2}, state_version_before:1, state_version_after:2, difference:{v:{before:1,after:2}}, evidence_refs:[], verification_status:"RECORDED" };
const ALLOWED = () => ({ principal:"odg", verb:"apply", target:"runtime/x.js", actionClass:"WRITE", authority:{id:"AUTH-1"}, contract:{id:"C-1"}, policy:"LOCAL_FIRST", reversibility:"R0", expectedTransition:VALID_TRANSITION });
function main(){
  // ALLOWED: all admission dimensions satisfied ⇒ ALLOW
  const okd = evaluateAction(ALLOWED(), { allowedPolicies:["LOCAL_FIRST"] });
  check("authorized reversible WRITE (identity+authority+contract+policy+state) ⇒ ALLOW", okd.decision===DECISION.ALLOW);
  check("ALLOW records the four admission checks as ok (authority/contract/policy/state)", okd.checks && okd.checks.authority.ok && okd.checks.contract.ok && okd.checks.policy.ok && okd.checks.state.ok);
  // DENIED (missing authority) ⇒ DENY with an attributable reason
  const noAuth = (()=>{const a:any=ALLOWED(); delete a.authority; return evaluateAction(a,{});})();
  check("unauthorized (no authority) ⇒ DENY with an explicit attributable AUTHORITY reason", noAuth.decision===DECISION.DENY && noAuth.violations.some((v:string)=>/AUTHORITY/.test(v)));
  // DENIED (incompatible policy) ⇒ DENY
  check("policy not in the permitted set ⇒ DENY ('not compatible')", evaluateAction(ALLOWED(),{allowedPolicies:["OTHER"]}).violations.some((v:string)=>/not compatible/.test(v)));
  // DENIED (revoked authority) ⇒ DENY
  check("revoked authority ⇒ DENY", evaluateAction(ALLOWED(),{revokedAuthorities:["AUTH-1"]}).decision===DECISION.DENY);
  // deny-by-default on a bare consequential action
  check("bare consequential WRITE (no authority/contract/policy/state) ⇒ DENY (deny-by-default)", evaluateAction({principal:"x",actionClass:"WRITE"},{}).decision===DECISION.DENY);
  // NO SIDE EFFECT after refusal: evaluateAction is pure — the input is not mutated
  const inp:any=ALLOWED(); delete inp.authority; const snap=JSON.stringify(inp); evaluateAction(inp,{}); 
  check("refusal has NO side effect (input not mutated; pure decision)", JSON.stringify(inp)===snap);
  // AUDIT EVIDENCE: record both decisions in the append-only chain; verifyChain ok; tamper ⇒ detected
  let chain = AUDIT.appendEntry([], { kind:"action-gate", decision:okd.decision, principal:"odg", actionClass:"WRITE" });
  chain = AUDIT.appendEntry(chain, { kind:"action-gate", decision:noAuth.decision, violations:noAuth.violations });
  check("audit evidence records both decisions in an append-only chain, verifyChain ok", AUDIT.verifyChain(chain).ok===true && chain.length===2);
  const tampered = chain.map((e:any,i:number)=> i===0 ? {...e, payload:{...e.payload, decision:"ALLOW_TAMPERED"}} : e);
  check("audit evidence is TAMPER-EVIDENT (altering a recorded decision breaks the chain)", AUDIT.verifyChain(tampered).ok===false);
  process.stdout.write("\n"+(failures===0?"ALL PASS — action-gate pair (ALLOW authorized / DENY unauthorized with attributable reason, no side effect, tamper-evident audit)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
