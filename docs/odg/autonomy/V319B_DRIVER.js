#!/usr/bin/env node
"use strict";
/*
 * V319B_DRIVER.js — PROVENANCE ARTIFACT: the EXACT harness that produced docs/odg/autonomy/V319B_CORPUS_TAXONOMY_EVIDENCE.json
 * (8-case run, num_predict:1024). Committed for reproducibility because the live ~/odg-sandbox-work copy was later edited to a
 * 6-case variant for a (socket-refused) re-run. Ran INSIDE the certified C6 sandbox; generator = qwen2.5-coder:7b (via ODG's
 * generative-repair-adapter → ollama-provider → repair-workflow bundle); independent evaluator = qwen2.5-coder:3b (distinct);
 * primary gate = deterministic `node --test`; generator TEE'd so rolled-back abstains are diagnosable. Claude Code wrote only
 * this harness + buggy fixtures + acceptance tests — never a fix. Requires genrepair-bundle.js (esbuild bundle of the adapter).
 */
const fs=require("fs"),path=require("path"),crypto=require("crypto"),http=require("http"),{spawnSync}=require("child_process");
const B=require("./genrepair-bundle.js");
const ROOT="/work/mission-v319b/ws", OUT="/work/mission-v319b/evidence.json";
const GEN="qwen2.5-coder:7b", EVAL="qwen2.5-coder:3b";

function hashTree(d){const f=[];(function w(x){for(const e of fs.readdirSync(x,{withFileTypes:true})){const p=path.join(x,e.name);e.isDirectory()?w(p):f.push(p);}})(d);f.sort();const h=crypto.createHash("sha256");for(const x of f){h.update(path.relative(d,x));h.update(fs.readFileSync(x));}return h.digest("hex");}
function mat(id,files,test){const d=path.join(ROOT,id);fs.rmSync(d,{recursive:true,force:true});fs.mkdirSync(path.join(d,"src"),{recursive:true});fs.mkdirSync(path.join(d,"test"),{recursive:true});for(const[r,c]of Object.entries(files))fs.writeFileSync(path.join(d,r),c);fs.writeFileSync(path.join(d,"test/acc.test.js"),`const t=require("node:test");const a=require("node:assert");t("acc",()=>{ ${test} });\n`);return d;}
function nodeTest(d){const r=spawnSync("node",["--test"],{cwd:d,timeout:60000,encoding:"utf8"});return{ok:r.status===0,out:((r.stdout||"")+(r.stderr||"")).slice(0,800)};}
function post(model,prompt,np){return new Promise((res)=>{const body=JSON.stringify({model,prompt,stream:false,options:{temperature:0,num_predict:np||1024}});const req=http.request({host:"127.0.0.1",port:11434,path:"/api/generate",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)},timeout:180000},(r)=>{let d="";r.on("data",c=>d+=c);r.on("end",()=>{try{res(JSON.parse(d).response||"");}catch(e){res("ERROR:"+e.message);}});});req.on("error",e=>res("ERROR:"+e.message));req.on("timeout",()=>req.destroy(new Error("timeout")));req.write(body);req.end();});}
function verdict(t){return /VERDICT\s*=\s*CORRECT/i.test(t)&&!/INCORRECT/i.test(t)?"CORRECT":/INCORRECT/i.test(t)?"INCORRECT":"UNCLEAR";}

// 8 graded novel defects (none in prior V318/V319 corpora) — the exact set behind the committed evidence.
const CASES=[
 {id:"celsius-f",diff:"easy",files:{"src/f.js":"module.exports=(c)=>c;\n"},inst:"Convert Celsius to Fahrenheit: F = C*9/5 + 32.",acc:"const fn=require('../src/f.js');a.strictEqual(fn(0),32);a.strictEqual(fn(100),212);a.strictEqual(fn(-40),-40);",adv:"const fn=require('../src/f.js');a.strictEqual(fn(37),98.6);"},
 {id:"title-case",diff:"easy",files:{"src/f.js":"module.exports=(s)=>s;\n"},inst:"Title-case a space-separated string: uppercase the first letter of each word, lowercase the rest.",acc:"const fn=require('../src/f.js');a.strictEqual(fn('hello world'),'Hello World');a.strictEqual(fn('fOO bAr'),'Foo Bar');",adv:"const fn=require('../src/f.js');a.strictEqual(fn('a'),'A');a.strictEqual(fn(''),'');"},
 {id:"gcd",diff:"med",files:{"src/f.js":"module.exports=(a,b)=>a;\n"},inst:"Return the greatest common divisor of two positive integers (Euclid).",acc:"const fn=require('../src/f.js');a.strictEqual(fn(12,8),4);a.strictEqual(fn(17,5),1);a.strictEqual(fn(100,10),10);",adv:"const fn=require('../src/f.js');a.strictEqual(fn(1,1),1);a.strictEqual(fn(270,192),6);"},
 {id:"flatten",diff:"med",files:{"src/f.js":"module.exports=(arr)=>arr;\n"},inst:"Deeply flatten an arbitrarily-nested array of numbers into a single flat array (order preserved).",acc:"const fn=require('../src/f.js');a.deepStrictEqual(fn([1,[2,[3,[4]]]]),[1,2,3,4]);a.deepStrictEqual(fn([]),[]);",adv:"const fn=require('../src/f.js');a.deepStrictEqual(fn([[],[1],[[2]]]),[1,2]);"},
 {id:"iso-week",diff:"hard",files:{"src/f.js":"module.exports=(y,m,d)=>1;\n"},inst:"Return the ISO-8601 week number (1-53) for the given year, month (1-12), day.",acc:"const fn=require('../src/f.js');a.strictEqual(fn(2026,1,1),1);a.strictEqual(fn(2026,12,31),53);a.strictEqual(fn(2026,6,15),25);",adv:"const fn=require('../src/f.js');a.strictEqual(fn(2021,1,1),53);"},
 {id:"json-path",diff:"hard",files:{"src/f.js":"module.exports=(o,p)=>o;\n"},inst:"Get a value from a nested object by a dot-path string (e.g. 'a.b.c'); return undefined if any segment is missing.",acc:"const fn=require('../src/f.js');a.strictEqual(fn({a:{b:{c:5}}},'a.b.c'),5);a.strictEqual(fn({a:1},'a.b'),undefined);",adv:"const fn=require('../src/f.js');a.strictEqual(fn({x:{y:0}},'x.y'),0);"},
 {id:"debounce-pure",diff:"med",files:{"src/f.js":"module.exports=(nums)=>nums;\n"},inst:"Collapse consecutive duplicate numbers in an array into single occurrences (e.g. [1,1,2,2,2,3,1]->[1,2,3,1]).",acc:"const fn=require('../src/f.js');a.deepStrictEqual(fn([1,1,2,2,2,3,1]),[1,2,3,1]);a.deepStrictEqual(fn([]),[]);",adv:"const fn=require('../src/f.js');a.deepStrictEqual(fn([5,5,5]),[5]);"},
 {id:"base64-ish",diff:"hard",files:{"src/f.js":"module.exports=(s)=>s;\n"},inst:"Run-length encode a string: 'aaabbc' -> 'a3b2c1' (each run = char followed by its count).",acc:"const fn=require('../src/f.js');a.strictEqual(fn('aaabbc'),'a3b2c1');a.strictEqual(fn('x'),'x1');a.strictEqual(fn(''),'');",adv:"const fn=require('../src/f.js');a.strictEqual(fn('aa bb'),'a2 1b2');"},
];

async function runCase(c){
 const dir=mat(c.id,c.files,c.acc); const h0=hashTree(dir);
 let rawCapture=null;
 const generate=async(input)=>{ const txt=await post(input.model||GEN,input.prompt,1024); rawCapture=txt; return {ok:!String(txt).startsWith("ERROR:"),text:txt,model:input.model||GEN}; };
 const res=await B.runGenerativeRepair({workspaceDir:dir,instruction:c.inst,allowedFiles:["src/"],acceptanceCommand:["node","--test"],currentFiles:c.files,model:GEN,timeoutMs:180000},{generate});
 const out={id:c.id,diff:c.diff,status:res.status};
 if(res.status==="ACCEPTED"){
   out.producedCode=fs.readFileSync(path.join(dir,"src/f.js"),"utf8").trim();
   const adv=mat(c.id+"-adv",{"src/f.js":out.producedCode+"\n"},c.adv); out.generalises=nodeTest(adv).ok; fs.rmSync(adv,{recursive:true,force:true});
   out.eval3b=verdict(await post(EVAL,"Independent reviewer (no code). Spec: "+c.inst+"\nImpl:\n"+out.producedCode+"\nReply VERDICT=CORRECT or VERDICT=INCORRECT.",80));
 } else {
   out.restoredExactly=hashTree(dir)===h0;
   let fm="unknown";
   try{
     const parsed=/```/.test(rawCapture)?(rawCapture.match(/```(?:javascript|js)?\s*([\s\S]*?)```/)||[])[1]:rawCapture;
     if(!parsed||!/module\.exports/.test(String(parsed))) fm="malformed-or-no-export";
     else { const sc=mat(c.id+"-diag",{"src/f.js":String(parsed).trim()+"\n"},c.acc); const t=nodeTest(sc);
       fm = t.ok ? "passed-on-retry(nondeterministic)" : (/AssertionError|strictEqual|deepStrictEqual/.test(t.out)?"wrong-logic(assertion-failed)":/SyntaxError/.test(t.out)?"syntax-error":/TypeError|ReferenceError/.test(t.out)?"runtime-error":"other-failure");
       fs.rmSync(sc,{recursive:true,force:true}); }
   }catch(e){ fm="diag-error:"+e.message; }
   out.abstainFailureMode=fm; out.attemptSnippet=String(rawCapture||"").replace(/\s+/g," ").slice(0,160);
 }
 fs.rmSync(dir,{recursive:true,force:true}); return out;
}

async function main(){
 fs.mkdirSync(ROOT,{recursive:true});
 const cases=[]; for(const c of CASES){ try{cases.push(await runCase(c));}catch(e){cases.push({id:c.id,status:"ERROR",error:String(e&&e.message)});} }
 const acc=cases.filter(c=>c.status==="ACCEPTED");
 const taxonomy={}; cases.filter(c=>c.status==="ABSTAINED").forEach(c=>{taxonomy[c.abstainFailureMode]=(taxonomy[c.abstainFailureMode]||0)+1;});
 const byDiff={}; for(const d of ["easy","med","hard"]){const g=cases.filter(c=>c.diff===d);byDiff[d]={total:g.length,accepted:g.filter(c=>c.status==="ACCEPTED").length};}
 const summary={total:cases.length,accepted:acc.length,abstained:cases.filter(c=>c.status==="ABSTAINED").length,rejected:cases.filter(c=>c.status==="REJECTED").length,
   acceptRate:Number((acc.length/cases.length).toFixed(3)),acceptedGeneralised:acc.filter(c=>c.generalises).length,eval3bAgreed:acc.filter(c=>c.eval3b==="CORRECT").length,
   abstainRestoredExactly:cases.filter(c=>c.status!=="ACCEPTED").every(c=>c.restoredExactly!==false),acceptByDifficulty:byDiff,abstainFailureModes:taxonomy,generator:GEN,evaluator:EVAL};
 fs.writeFileSync(OUT,JSON.stringify({schema:"v319b-corpus-taxonomy",generatedInside:"C6 sandbox child",cases,summary},null,2)+"\n");
 console.log("V319B_DONE "+OUT); console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error("V319B_ERROR",e&&e.message);process.exit(1);});
