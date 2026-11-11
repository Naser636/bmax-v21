#!/usr/bin/env node
"use strict";
/* P0-R1 regression battery — monitor entrypoints. Root cause: zero-JS convergence (fba76c7) retired
 * runtime/bin/odg-exposure-check.js + odg-maintenance-check.js WITHOUT a TS replacement, so scripts/odg-monitor.sh
 * crashed with MODULE_NOT_FOUND every tick. Fix: canonical TS source CLIs under runtime/bin/*.ts (importing the surviving
 * pure core modules), compiled into runtime/dist/bin via tsconfig.runtime-dist.json, with odg-monitor.sh + README pointing
 * at the dist path. The CLIs ALSO write the steady-state runtime/generated/{exposure,maintenance}-status.json that
 * odg-health §G Supervision reads (faithful restoration — an independent validator caught the first port dropping these).
 * This test proves the fix end-to-end and guards the regressions (dead path + dropped status files + tsx/dist divergence). */
const path=require("path"),fs=require("fs"),cp=require("child_process"),os=require("os");
const ROOT=path.join(__dirname,"..","..");
function rd(p:string):string{try{return fs.readFileSync(path.join(ROOT,p),"utf8")}catch{return""}}
function exists(p:string):boolean{return fs.existsSync(path.join(ROOT,p))}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
// run an entrypoint from a throwaway cwd so generated status/alert files land in tmp (not the repo); return output+status+tmp
function run(cmd:string,argv:string[]):{out:string,code:number,tmp:string}{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"odg-r1-"));
  try{const out=cp.execFileSync(cmd,argv,{cwd:tmp,encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]});return{out,code:0,tmp};}
  catch(e:any){return{out:String((e.stdout||"")+(e.stderr||"")),code:typeof e.status==="number"?e.status:1,tmp};}
}
function genStatus(tmp:string,name:string):any{try{return JSON.parse(fs.readFileSync(path.join(tmp,"runtime","generated",name),"utf8"))}catch{return null}}
function cleanup(tmp:string){try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}}
function main(){
  // 1 — canonical TS source restored, importing core (logic not duplicated)
  check("source CLI runtime/bin/odg-exposure-check.ts exists",exists("runtime/bin/odg-exposure-check.ts"));
  check("source CLI runtime/bin/odg-maintenance-check.ts exists",exists("runtime/bin/odg-maintenance-check.ts"));
  check("surviving core modules present + imported (not duplicated)",exists("runtime/core/exposure-audit.ts")&&exists("runtime/core/maintenance-alerts.ts")&&/exposure-audit\.js/.test(rd("runtime/bin/odg-exposure-check.ts"))&&/maintenance-alerts\.js/.test(rd("runtime/bin/odg-maintenance-check.ts")));
  // 2 — build config includes all four so build:runtime emits the compiled dist
  const tcfg=rd("tsconfig.runtime-dist.json");
  check("tsconfig.runtime-dist.json includes both bin CLIs + both core modules",/odg-exposure-check\.ts/.test(tcfg)&&/odg-maintenance-check\.ts/.test(tcfg)&&/core\/exposure-audit\.ts/.test(tcfg)&&/core\/maintenance-alerts\.ts/.test(tcfg));
  // 3 — monitor + README point at the compiled dist path; dead runtime/bin/*.js invocation is GONE
  const mon=rd("scripts/odg-monitor.sh");
  check("odg-monitor.sh invokes runtime/dist/bin/odg-{exposure,maintenance}-check.js",/runtime\/dist\/bin\/odg-exposure-check\.js/.test(mon)&&/runtime\/dist\/bin\/odg-maintenance-check\.js/.test(mon));
  check("REGRESSION: odg-monitor.sh no longer invokes the retired runtime/bin/odg-*-check.js",!/runtime\/bin\/odg-exposure-check\.js/.test(mon)&&!/runtime\/bin\/odg-maintenance-check\.js/.test(mon));
  check("deploy/README-systemd.md references the dist path",/runtime\/dist\/bin\/odg-exposure-check\.js/.test(rd("deploy/README-systemd.md")));
  // 4 — BEHAVIORAL via tsx SOURCE: runs, no MODULE_NOT_FOUND, verdict line, AND writes the steady-state status file
  const ex=run("npx",["tsx",path.join(ROOT,"runtime/bin/odg-exposure-check.ts")]);
  check("exposure-check (tsx) runs, no MODULE_NOT_FOUND, Exposure verdict line, exit 0|1",!/Cannot find module|MODULE_NOT_FOUND/.test(ex.out)&&/Exposure\s*:/.test(ex.out)&&(ex.code===0||ex.code===1));
  const exS=genStatus(ex.tmp,"exposure-status.json"); cleanup(ex.tmp);
  check("exposure-check writes fresh exposure-status.json (feeds odg-health §G) — REGRESSION guard",!!exS&&typeof exS.verdict==="string"&&typeof exS.at==="string");
  const mt=run("npx",["tsx",path.join(ROOT,"runtime/bin/odg-maintenance-check.ts")]);
  check("maintenance-check (tsx) runs, no MODULE_NOT_FOUND, Maintenance verdict line, exit 0|1",!/Cannot find module|MODULE_NOT_FOUND/.test(mt.out)&&/Maintenance\s*:/.test(mt.out)&&(mt.code===0||mt.code===1));
  const mtS=genStatus(mt.tmp,"maintenance-status.json"); cleanup(mt.tmp);
  check("maintenance-check writes fresh maintenance-status.json (feeds odg-health §G) — REGRESSION guard",!!mtS&&typeof mtS.ok==="boolean"&&typeof mtS.at==="string");
  // 5 — exercise the ACTUAL compiled dist/node artifact production runs (closes the tsx-vs-dist gap) when dist is built
  const distEx="runtime/dist/bin/odg-exposure-check.js", distMt="runtime/dist/bin/odg-maintenance-check.js";
  if(exists(distEx)&&exists(distMt)){
    const dex=run("node",[path.join(ROOT,distEx)]);
    check("compiled dist exposure-check (node) runs, no MODULE_NOT_FOUND + writes status",!/Cannot find module|MODULE_NOT_FOUND/.test(dex.out)&&/Exposure\s*:/.test(dex.out)&&!!genStatus(dex.tmp,"exposure-status.json")); cleanup(dex.tmp);
    const dmt=run("node",[path.join(ROOT,distMt)]);
    check("compiled dist maintenance-check (node) runs, no MODULE_NOT_FOUND + writes status",!/Cannot find module|MODULE_NOT_FOUND/.test(dmt.out)&&/Maintenance\s*:/.test(dmt.out)&&!!genStatus(dmt.tmp,"maintenance-status.json")); cleanup(dmt.tmp);
  } else {
    check("compiled dist present (build:runtime emits the node artifacts production runs)",false);
  }
  process.stdout.write("\n"+(failures===0?"ALL PASS — P0-R1 (monitor entrypoints restored as canonical TS source incl. odg-health §G status writes, compiled to dist + run via node, monitor/README rewired, no MODULE_NOT_FOUND; dead path + dropped-status + tsx/dist gaps guarded)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
