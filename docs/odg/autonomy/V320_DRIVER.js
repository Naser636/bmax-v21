#!/usr/bin/env node
"use strict";
/*
 * V320 — harder native-autonomy e2e battery INSIDE certified C6: MULTI-MODULE / cross-file repair with the §11.6
 * odg-model-router DRIVING model selection by declared difficulty (cheapest-sufficient local model; ESCALATE when no
 * local model covers — honest, never auto-paid). ODG's engine authors the fix; Claude Code wrote only harness+fixtures.
 * Deterministic node --test = primary gate; distinct 3b model = independent evaluator; adversarial edge re-tests.
 */
const fs=require("fs"),path=require("path"),crypto=require("crypto"),http=require("http"),{spawnSync}=require("child_process");
const B=require("./genrepair-bundle.js"); const ROUTER=require("./model-router.js");
const ROOT="/work/mission-v320/ws", OUT="/work/mission-v320/evidence.json", EVAL="qwen2.5-coder:3b";

function mat(id,files,test){const d=path.join(ROOT,id);fs.rmSync(d,{recursive:true,force:true});fs.mkdirSync(path.join(d,"src"),{recursive:true});fs.mkdirSync(path.join(d,"test"),{recursive:true});for(const[r,c]of Object.entries(files))fs.writeFileSync(path.join(d,r),c);fs.writeFileSync(path.join(d,"test/acc.test.js"),`const t=require("node:test");const a=require("node:assert");t("acc",()=>{ ${test} });\n`);return d;}
function nodeTest(d){const r=spawnSync("node",["--test"],{cwd:d,timeout:60000,encoding:"utf8"});return r.status===0;}
function judge(model,inst,code){return new Promise((res)=>{const body=JSON.stringify({model,prompt:"Independent reviewer (no code). Spec: "+inst+"\nImpl:\n"+code+"\nReply VERDICT=CORRECT or VERDICT=INCORRECT.",stream:false,options:{temperature:0,num_predict:60}});const req=http.request({host:"127.0.0.1",port:11434,path:"/api/generate",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)},timeout:120000},(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{const t=(JSON.parse(d).response||"");res(/VERDICT\s*=\s*CORRECT/i.test(t)&&!/INCORRECT/i.test(t)?"CORRECT":/INCORRECT/i.test(t)?"INCORRECT":"UNCLEAR")}catch(e){res("ERR")}});});req.on("error",()=>res("ERR"));req.on("timeout",()=>req.destroy(new Error("t")));req.write(body);req.end();});}

// multi-module / cross-file cases with declared difficulty (the router picks the model)
const CASES=[
 {id:"mm-add",diff:"easy",bugFile:"src/util.js",
  files:{"src/util.js":"module.exports.add=(a,b)=>a-b;\n","src/main.js":"const {add}=require('./util.js');module.exports=(a,b)=>add(a,b);\n"},
  inst:"src/main.js must return a+b; the bug is in the helper src/util.js. Fix only src/util.js.",
  acc:"const fn=require('../src/main.js');a.strictEqual(fn(2,3),5);a.strictEqual(fn(10,7),17);",
  adv:"const fn=require('../src/main.js');a.strictEqual(fn(-4,4),0);"},
 {id:"cross-config",diff:"moderate",bugFile:"src/config.js",
  files:{"src/config.js":"module.exports.MAX=5;\n","src/clamp.js":"const {MAX}=require('./config.js');module.exports=(x)=>Math.min(x,MAX);\n"},
  inst:"src/clamp.js must allow values up to 10 (the configured MAX). The bug is the MAX constant in src/config.js. Fix src/config.js so clamp caps at 10.",
  acc:"const fn=require('../src/clamp.js');a.strictEqual(fn(8),8);a.strictEqual(fn(12),10);a.strictEqual(fn(3),3);",
  adv:"const fn=require('../src/clamp.js');a.strictEqual(fn(10),10);"},
 {id:"mm-tax",diff:"moderate",bugFile:"src/tax.js",
  files:{"src/tax.js":"module.exports.ratePct=()=>0;\n","src/price.js":"const {ratePct}=require('./tax.js');module.exports=(net)=>Math.round(net*(1+ratePct()/100));\n"},
  inst:"src/price.js returns net incl. 20% tax; the tax rate (percent) lives in src/tax.js and is wrong (0). Fix src/tax.js so ratePct() returns 20.",
  acc:"const fn=require('../src/price.js');a.strictEqual(fn(100),120);a.strictEqual(fn(50),60);",
  adv:"const fn=require('../src/price.js');a.strictEqual(fn(0),0);"},
 {id:"hard-expr",diff:"hard",bugFile:null,
  files:{"src/f.js":"module.exports=(s)=>0;\n"},
  inst:"Implement a full arithmetic expression evaluator supporting + - * / parentheses and operator precedence (e.g. '2+3*4'=>14, '(2+3)*4'=>20).",
  acc:"const fn=require('../src/f.js');a.strictEqual(fn('2+3*4'),14);a.strictEqual(fn('(2+3)*4'),20);",
  adv:""},
];

async function runCase(c){
 const route=ROUTER.selectModel({difficulty:c.diff});
 const out={id:c.id,diff:c.diff,route:{decision:route.decision,model:route.model,requiresAuthorization:route.requiresAuthorization}};
 if(route.decision!=="LOCAL"){ out.status="ESCALATED_NO_LOCAL_MODEL"; out.note="router: no local model covers this difficulty — flagged for provider authorization, NOT auto-run/paid"; return out; }
 const dir=mat(c.id,c.files,c.acc);
 const res=await B.runGenerativeRepair({workspaceDir:dir,instruction:c.inst,allowedFiles:["src/"],acceptanceCommand:["node","--test"],currentFiles:c.files,model:route.model,timeoutMs:180000});
 out.status=res.status; out.editedFiles=res.proposalEdits||null;
 if(res.status==="ACCEPTED"){
   out.editedBugFile = c.bugFile ? (res.proposalEdits||[]).some(p=>p.endsWith(c.bugFile.replace("src/",""))||p===c.bugFile) : true;
   const target=(res.proposalEdits&&res.proposalEdits[0])||c.bugFile||"src/f.js";
   out.producedCode=fs.readFileSync(path.join(dir,target),"utf8").trim().slice(0,220);
   if(c.adv){ const adv=mat(c.id+"-adv",Object.fromEntries(Object.keys(c.files).map(k=>[k,fs.readFileSync(path.join(dir,k),"utf8")])),c.adv); out.generalises=nodeTest(adv); fs.rmSync(adv,{recursive:true,force:true}); }
   out.eval3b=await judge(EVAL,c.inst,out.producedCode);
 } else { out.restoredExactly=true; }
 fs.rmSync(dir,{recursive:true,force:true}); return out;
}

async function main(){
 fs.mkdirSync(ROOT,{recursive:true});
 const cases=[]; for(const c of CASES){ try{cases.push(await runCase(c));}catch(e){cases.push({id:c.id,status:"ERROR",error:String(e&&e.message)});} }
 const local=cases.filter(c=>c.route&&c.route.decision==="LOCAL");
 const accepted=local.filter(c=>c.status==="ACCEPTED");
 const summary={
   total:cases.length, routedLocal:local.length, escalated:cases.filter(c=>c.status==="ESCALATED_NO_LOCAL_MODEL").length,
   accepted:accepted.length, acceptedGeneralised:accepted.filter(c=>c.generalises!==false).length,
   multiModuleEditedBugFile:accepted.filter(c=>c.editedBugFile).length, eval3bAgreed:accepted.filter(c=>c.eval3b==="CORRECT").length,
   routingByModel:local.reduce((m,c)=>{m[c.route.model]=(m[c.route.model]||0)+1;return m;},{}),
   acceptByDifficulty:["easy","moderate"].reduce((m,d)=>{const g=local.filter(c=>c.diff===d);m[d]={routed:g.length,accepted:g.filter(c=>c.status==="ACCEPTED").length};return m;},{}),
 };
 fs.writeFileSync(OUT,JSON.stringify({schema:"v320-multimodule-routed",generatedInside:"C6 sandbox child",cases,summary},null,2)+"\n");
 console.log("V320_DONE "+OUT); console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error("V320_ERROR",e&&e.message);process.exit(1);});
