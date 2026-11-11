#!/usr/bin/env node
"use strict";
/* V129 §2/§4 regression — the fleet-bridge service's canonical runtime ENTRY POINT must be present + executable, the dead
 * pre-zero-JS path must NOT exist (the cause of the MODULE_NOT_FOUND restart storm), and importing it must NOT activate a
 * provider. Locks the entry-point contract so a stale unit pointing at runtime/core/fleet-bridge.js is a detectable error. */
const fs=require("fs"), path=require("path"), cp=require("child_process");
const ROOT=path.join(__dirname,"..","..");
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  // dead path (what the stale Jul-17 unit invokes) must NOT exist — zero-JS retired it
  check("DEAD path runtime/core/fleet-bridge.js is ABSENT (unit must not point here — MODULE_NOT_FOUND cause)", !fs.existsSync(path.join(ROOT,"runtime/core/fleet-bridge.js")));
  // canonical source + compiled entry present
  check("canonical source runtime/core/fleet-bridge.ts present", fs.existsSync(path.join(ROOT,"runtime/core/fleet-bridge.ts")));
  check("compiled runtime entry runtime/dist/core/fleet-bridge.js present (build:runtime output)", fs.existsSync(path.join(ROOT,"runtime/dist/core/fleet-bridge.js")));
  // compiled entry LOADS with no MODULE_NOT_FOUND and exports the expected API (absolute path; require.main guard keeps it inert)
  let loadOut=""; let loadErr="";
  try { loadOut=cp.execFileSync("node",["-e","const m=require(process.argv[1]);process.stdout.write(Object.keys(m).join(','))", path.join(ROOT,"runtime/dist/core/fleet-bridge.js")],{encoding:"utf8",env:{...process.env,FLEET_BRIDGE_MOCK:"1"}}); }
  catch(e:any){ loadErr=String((e&&e.stdout||"")+(e&&e.stderr||"")); }
  check("compiled entry require()s cleanly (no MODULE_NOT_FOUND) and exports a non-empty API", loadOut.length>0 && !/Cannot find module/.test(loadOut) && loadErr==="");
  // import is side-effect-free (require.main guard): requiring does NOT run the watch daemon / spawn a provider
  const src=fs.readFileSync(path.join(ROOT,"runtime/core/fleet-bridge.ts"),"utf8");
  check("entry is require-safe: guarded by `require.main === module` (import does not start the daemon)", /require\.main === module/.test(src));
  // provider activation is FAIL-CLOSED: a real `claude` spawn only under ODG_PROVIDER_LIVE; FLEET_BRIDGE_MOCK short-circuits
  check("live provider is gated (provider-live-call-gate + FLEET_BRIDGE_MOCK) — not auto-activated on start", /provider-live-call-gate|gateLiveCall/.test(src) && /FLEET_BRIDGE_MOCK/.test(src));
  // a PREPARED corrected unit exists pointing at the dist path (not the dead path)
  const unit=path.join(ROOT,"deploy/fleet-bridge.service.corrected");
  check("PREPARED corrected unit deploy/fleet-bridge.service.corrected targets the dist entry + bounded restart", fs.existsSync(unit) && /runtime\/dist\/core\/fleet-bridge\.js/.test(fs.readFileSync(unit,"utf8")) && /StartLimitBurst/.test(fs.readFileSync(unit,"utf8")));
  process.stdout.write("\n"+(failures===0?"ALL PASS — fleet-bridge canonical entry present+loadable+provider-gated; dead path absent; corrected unit prepared":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
