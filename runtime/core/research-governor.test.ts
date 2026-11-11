#!/usr/bin/env node
"use strict";
/* M4 (Phase 10 governance) — research-governor battery. Proves FAIL-CLOSED egress gating (deny without a grant, expired
 * grant, disallowed domain, empty allowlist) and ANTI-FABRICATION finding-stamping (requires source + ISO date), with
 * source-bounded confidence. The module NEVER fetches — it only decides + stamps. */
const R = require("./research-governor.js");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
const NOW=Date.parse("2026-11-11T00:00:00Z");
function main(){
  // DENY by default — no grant
  const d0=R.govern({query:"q", urls:["https://example.com/a"]}, {}, NOW);
  check("no grant ⇒ DENY EGRESS_NOT_AUTHORIZED (fail-closed, no egress)", d0.decision==="DENY" && d0.reasons.includes("EGRESS_NOT_AUTHORIZED"));
  check("authorized:false explicitly ⇒ DENY", R.govern({urls:["https://x.com"]}, {authorized:false, allowedDomains:["x.com"]}, NOW).decision==="DENY");
  // ALLOW with a valid grant + allowed domain
  const grant={authorized:true, allowedDomains:["example.com"], expiresMs:NOW+100000, issuer:"owner"};
  const dA=R.govern({query:"q", urls:["https://example.com/a","https://sub.example.com/b"]}, grant, NOW);
  check("valid grant + allowed domain (incl. subdomain) ⇒ ALLOW with fetch plan", dA.decision==="ALLOW" && dA.plan.domains.includes("example.com") && dA.plan.domains.includes("sub.example.com"));
  // domain not allowed ⇒ DENY
  check("url outside allowed domains ⇒ DENY DOMAIN_NOT_ALLOWED", R.govern({urls:["https://evil.com/x"]}, grant, NOW).reasons.some((r:string)=>/DOMAIN_NOT_ALLOWED/.test(r)));
  // expired grant ⇒ DENY
  check("expired grant ⇒ DENY GRANT_EXPIRED", R.govern({urls:["https://example.com/a"]}, {authorized:true,allowedDomains:["example.com"],expiresMs:NOW-1}, NOW).reasons.includes("GRANT_EXPIRED"));
  // grant but empty allowlist ⇒ nothing fetchable
  check("authorized but empty allowlist + urls ⇒ DENY NO_ALLOWED_DOMAINS", R.govern({urls:["https://example.com/a"]}, {authorized:true,allowedDomains:[]}, NOW).reasons.includes("NO_ALLOWED_DOMAINS"));
  // malformed url
  check("malformed url ⇒ DENY INVALID_URL", R.govern({urls:["notaurl"]}, grant, NOW).reasons.some((r:string)=>/INVALID_URL/.test(r)));
  // invalid time
  check("non-number nowMs ⇒ DENY INVALID_TIME", R.govern({urls:["https://example.com"]}, grant, "soon").reasons.includes("INVALID_TIME"));
  // STAMP — anti-fabrication
  const okF=R.stampFinding("GDP grew 2%", {url:"https://example.com/report", date:"2026-10-01", credibility:"HIGH"});
  check("stampFinding with source+ISO date ⇒ ok, dated provenance + HIGH confidence", okF.ok===true && okF.finding.date==="2026-10-01" && okF.finding.confidence==="HIGH" && /2026-10-01/.test(okF.finding.provenance));
  check("stampFinding WITHOUT a date ⇒ REFUSED NO_DATED_SOURCE (anti-fabrication)", R.stampFinding("claim", {url:"https://x.com"}).ok===false);
  check("stampFinding WITHOUT a source ⇒ REFUSED NO_SOURCE", R.stampFinding("claim", {date:"2026-10-01"}).reason.includes("NO_SOURCE"));
  check("stampFinding WITHOUT content ⇒ REFUSED NO_CONTENT", R.stampFinding("", {url:"https://x.com",date:"2026-10-01"}).reason.includes("NO_CONTENT"));
  check("unknown credibility ⇒ LOW (fail-closed)", R.stampFinding("c", {url:"https://x.com", date:"2026-10-01", credibility:"BOGUS"}).finding.confidence==="LOW");
  check("liveFetched defaults false unless explicitly set (no false 'real internet' claim)", R.stampFinding("c",{url:"https://x.com",date:"2026-10-01"}).finding.liveFetched===false);
  check("invalid ISO date rejected (not just any string)", R.isIsoDate("yesterday")===false && R.isIsoDate("2026-10-01")===true);
  // purity/frozen
  check("outputs frozen", Object.isFrozen(dA) && Object.isFrozen(okF) && Object.isFrozen(okF.finding));
  check("deterministic", JSON.stringify(R.govern({urls:["https://example.com/a"]},grant,NOW))===JSON.stringify(R.govern({urls:["https://example.com/a"]},grant,NOW)));
  process.stdout.write("\n"+(failures===0?"ALL PASS — research-governor M4 (fail-closed egress gate + anti-fabrication dated-source stamping; never fetches)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
