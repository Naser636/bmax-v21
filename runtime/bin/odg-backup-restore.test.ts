#!/usr/bin/env node
"use strict";
/* P1-R3 regression battery — real backups + verified restoration. Guards: the reproducible backup script produces a
 * VERIFIABLE git bundle; a bundle→clone restore round-trip reproduces the exact repo HEAD with a clean fsck and matching
 * file count (real restore-test, not an in-memory drill); the client-store backup/restore CLI round-trips; durable-backup
 * candidates exist but are NOT auto-enabled. All isolated (ODG_VAULT→tmp, restore→tmp) — no real-vault/production touch. */
const path=require("path"),fs=require("fs"),cp=require("child_process"),os=require("os");
const ROOT=path.join(__dirname,"..","..");
function exists(p:string):boolean{return fs.existsSync(path.join(ROOT,p))}
function sh(c:string,env?:any):string{try{return cp.execSync(c,{encoding:"utf8",timeout:60000,stdio:["ignore","pipe","ignore"],env:{...process.env,...(env||{})}}).trim()}catch(e:any){return String((e&&e.stdout)||"").trim()}}
let failures=0; function check(n:string,c:boolean){process.stdout.write((c?"ok":"NOT OK")+" - "+n+"\n"); if(!c)failures++;}
function main(){
  // 1 — reproducible backup mechanism + non-enabled durable candidates
  check("scripts/odg-backup-vault.sh exists + executable",exists("scripts/odg-backup-vault.sh")&&(()=>{try{fs.accessSync(path.join(ROOT,"scripts/odg-backup-vault.sh"),fs.constants.X_OK);return true}catch{return false}})());
  check("durable-backup candidates PREPARED (not installed): service+timer",exists("deploy/odg-backup.service.candidate")&&exists("deploy/odg-backup.timer.candidate"));
  const svc=fs.readFileSync(path.join(ROOT,"deploy/odg-backup.timer.candidate"),"utf8");
  check("candidate is a CANDIDATE (not auto-enabled) — documents owner/operator install",/CANDIDATE/.test(svc)&&/NOT (installed|enabled)/i.test(svc));
  // 2 — backup script produces a VERIFIABLE bundle in an ISOLATED vault (no real /var touch)
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"odg-r3t-"));
  const runOut=sh(`bash ${path.join(ROOT,"scripts/odg-backup-vault.sh")}`,{ODG_VAULT:tmp,ODG_BACKUP_REF:"HEAD"});
  check("backup script runs OK and reports a verified bundle",/OK .*odg-main\.bundle/.test(runOut));
  const bundles=sh(`ls ${tmp}/*/odg-main.bundle 2>/dev/null`).split("\n").filter(Boolean);
  check("script wrote a git bundle into the isolated vault",bundles.length>=1);
  const bundle=bundles[0]||"";
  check("produced bundle passes git bundle verify",!!bundle&&/is okay/.test(sh(`git bundle verify ${bundle} 2>&1`)));
  // 3 — REAL restore round-trip: clone from the bundle, HEAD + fsck + file-count match the live repo
  const restored=path.join(tmp,"restored");
  sh(`git clone -q ${bundle} ${restored} 2>&1`);
  const srcHead=sh(`git -C ${ROOT} rev-parse HEAD`), rstHead=sh(`git -C ${restored} rev-parse HEAD 2>&1`);
  check("restore(clone) reproduces the exact repo HEAD",!!srcHead&&srcHead===rstHead);
  check("restored repo fsck is clean (no corruption)",sh(`git -C ${restored} fsck --full 2>&1 | grep -iE 'error|missing|corrupt' | head -1`)==="");
  const sf=parseInt(sh(`git -C ${ROOT} ls-files | wc -l`)||"0",10), rf=parseInt(sh(`git -C ${restored} ls-files | wc -l`)||"0",10);
  check("restored working tree file count matches source (real data restored)",sf>0&&sf===rf);
  // 4 — client-store backup/restore CLI round-trips to an isolated target (dist artifact)
  if(exists("runtime/dist/bin/odg-backup.js")){
    const bj=path.join(tmp,"cs.json"), ct=path.join(tmp,"cs-restore");
    sh(`node ${path.join(ROOT,"runtime/dist/bin/odg-backup.js")} backup --out ${bj}`);
    const rr=sh(`node ${path.join(ROOT,"runtime/dist/bin/odg-backup.js")} restore --manifest ${bj} --target ${ct} 2>&1`);
    check("client-store backup→restore CLI round-trips (ok) to an isolated target",fs.existsSync(bj)&&/"ok":true/.test(rr));
  } else { check("client-store backup CLI compiled in dist",false); }
  try{fs.rmSync(tmp,{recursive:true,force:true})}catch{}
  process.stdout.write("\n"+(failures===0?"ALL PASS — P1-R3 (reproducible verified backup; real bundle→clone restore reproduces exact HEAD + clean fsck + file-count match; client-store CLI round-trips; durable candidates prepared not enabled)":failures+" FAIL")+"\n");
  process.exit(failures===0?0:1);
}
main();
export {};
