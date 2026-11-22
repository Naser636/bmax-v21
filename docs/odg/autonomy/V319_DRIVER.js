#!/usr/bin/env node
"use strict";
/*
 * V319 P0 — harder native-autonomy battery, run INSIDE the certified C6 sandbox.
 * ODG's path authors fixes (generative-repair-adapter → ollama-provider[7b] → repair-workflow): multi-module,
 * failing-stack-trace diagnosis, and a larger novel corpus → accept/abstain rate. Claude Code wrote ONLY this
 * harness + buggy fixtures + acceptance tests — never the fix. SEPARATION: generator = qwen2.5-coder:7b;
 * independent LLM evaluator = qwen2.5-coder:3b (DISTINCT model); deterministic node --test = primary gate;
 * adversarial edge re-tests (not a model). Exact rollback proven. Fail-closed; no false success.
 */
const fs = require("fs"); const path = require("path"); const crypto = require("crypto");
const http = require("http"); const { spawnSync } = require("child_process");
const B = require("./genrepair-bundle.js");
const ROOT = "/work/mission-v319/ws"; const OUT = "/work/mission-v319/evidence.json";
const GEN_MODEL = "qwen2.5-coder:7b"; const EVAL_MODEL = "qwen2.5-coder:3b";

function hashTree(dir){const fsx=[];(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);e.isDirectory()?w(p):fsx.push(p);}})(dir);fsx.sort();const h=crypto.createHash("sha256");for(const f of fsx){h.update(path.relative(dir,f));h.update(fs.readFileSync(f));}return h.digest("hex");}
function mat(id,files,testBody){const dir=path.join(ROOT,id);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(path.join(dir,"src"),{recursive:true});fs.mkdirSync(path.join(dir,"test"),{recursive:true});for(const[rel,c]of Object.entries(files))fs.writeFileSync(path.join(dir,rel),c);fs.writeFileSync(path.join(dir,"test/acc.test.js"),`const t=require("node:test");const a=require("node:assert");t("acc",()=>{ ${testBody} });\n`);return dir;}
function runNodeTest(dir){const r=spawnSync("node",["--test"],{cwd:dir,timeout:60000,encoding:"utf8"});return{ok:r.status===0,out:((r.stdout||"")+(r.stderr||"")).slice(0,1200)};}
function ollamaJudge(model,instruction,code){ // independent LLM evaluator (distinct model) — judge CORRECT/INCORRECT
  return new Promise((resolve)=>{const prompt="You are an INDEPENDENT reviewer (do NOT write code). Task spec: "+instruction+"\nImplementation:\n"+code+"\nReply ONE line: VERDICT=CORRECT or VERDICT=INCORRECT, then ' because <reason>'.";
  const body=JSON.stringify({model,prompt,stream:false,options:{temperature:0,num_predict:80}});
  const req=http.request({host:"127.0.0.1",port:11434,path:"/api/generate",method:"POST",headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(body)},timeout:120000},(res)=>{let d="";res.on("data",c=>d+=c);res.on("end",()=>{try{resolve((JSON.parse(d).response||"").trim());}catch(e){resolve("ERROR:"+e.message);}});});
  req.on("error",e=>resolve("ERROR:"+e.message));req.on("timeout",()=>req.destroy(new Error("timeout")));req.write(body);req.end();});}
function verdict(t){return /VERDICT\s*=\s*CORRECT/i.test(t)&&!/INCORRECT/i.test(t)?"CORRECT":/INCORRECT/i.test(t)?"INCORRECT":"UNCLEAR";}

const CASES = [
  { id:"multimodule", mode:"multi",
    files:{ "src/util.js":"module.exports.pct = (part, whole) => part / whole;\n",   // BUG: should be *100 for a percentage
            "src/main.js":"const {pct}=require('./util.js');module.exports=(part,whole)=>Math.round(pct(part,whole));\n" },
    allowed:["src/"], editTargetHint:"the bug is in the helper src/util.js, not src/main.js",
    instruction:"src/main.js returns the integer PERCENTAGE that `part` is of `whole` (e.g. part=1,whole=4 -> 25). Fix ONLY the helper src/util.js so main returns the correct percentage; do not change src/main.js's contract.",
    acc:"const fn=require('../src/main.js');a.strictEqual(fn(1,4),25);a.strictEqual(fn(1,2),50);a.strictEqual(fn(3,4),75);",
    adv:"const fn=require('../src/main.js');a.strictEqual(fn(0,5),0);a.strictEqual(fn(5,5),100);" },
  { id:"stacktrace", mode:"stack",
    files:{ "src/f.js":"module.exports = (arr) => arr.reduce((s,x)=>s+x.value);\n" }, // BUG: no init ⇒ throws on [1 elt]? and x.value on numbers
    allowed:["src/"],
    instruction:"The exported function must return the SUM of the numeric `value` field across an array of {value:number} objects; empty array -> 0.",
    acc:"const fn=require('../src/f.js');a.strictEqual(fn([{value:2},{value:3}]),5);a.strictEqual(fn([]),0);a.strictEqual(fn([{value:7}]),7);",
    adv:"const fn=require('../src/f.js');a.strictEqual(fn([{value:-1},{value:1}]),0);" },
  { id:"parse-duration", mode:"single", files:{ "src/f.js":"module.exports = (s) => parseInt(s);\n" },
    allowed:["src/"], instruction:"Parse a duration string like '1h30m','45m','2h','90s' into total SECONDS (h=3600,m=60,s=1); components may be omitted but appear in h,m,s order.",
    acc:"const fn=require('../src/f.js');a.strictEqual(fn('1h30m'),5400);a.strictEqual(fn('45m'),2700);a.strictEqual(fn('2h'),7200);a.strictEqual(fn('90s'),90);",
    adv:"const fn=require('../src/f.js');a.strictEqual(fn('1h1m1s'),3661);a.strictEqual(fn('0s'),0);" },
  { id:"balanced-parens", mode:"single", files:{ "src/f.js":"module.exports = (s) => s.length % 2 === 0;\n" },
    allowed:["src/"], instruction:"Return true iff the string of brackets among ()[]{} is correctly balanced and nested; other chars ignored.",
    acc:"const fn=require('../src/f.js');a.strictEqual(fn('([]{})'),true);a.strictEqual(fn('([)]'),false);a.strictEqual(fn('(('),false);a.strictEqual(fn(''),true);",
    adv:"const fn=require('../src/f.js');a.strictEqual(fn('a(b)c'),true);a.strictEqual(fn('}'),false);" },
  { id:"group-by", mode:"single", files:{ "src/f.js":"module.exports = (arr, key) => arr;\n" },
    allowed:["src/"], instruction:"Group an array of objects by the value of object[key], returning an object mapping each distinct key-value to the array of matching objects (input order preserved).",
    acc:"const fn=require('../src/f.js');const r=fn([{t:'a',n:1},{t:'b',n:2},{t:'a',n:3}],'t');a.deepStrictEqual(r,{a:[{t:'a',n:1},{t:'a',n:3}],b:[{t:'b',n:2}]});",
    adv:"const fn=require('../src/f.js');a.deepStrictEqual(fn([],'t'),{});" },
  { id:"roman-to-int", mode:"single", files:{ "src/f.js":"module.exports = (s) => s.length;\n" },
    allowed:["src/"], instruction:"Convert a Roman numeral string (I,V,X,L,C,D,M; subtractive like IV=4, IX=9, MCMXCIV=1994) to its integer value.",
    acc:"const fn=require('../src/f.js');a.strictEqual(fn('IV'),4);a.strictEqual(fn('MCMXCIV'),1994);a.strictEqual(fn('XLII'),42);",
    adv:"const fn=require('../src/f.js');a.strictEqual(fn('MMXXIII'),2023);a.strictEqual(fn('III'),3);" },
];

async function runCase(c){
  const dir=mat(c.id,c.files,c.acc);
  const initialHash=hashTree(dir);
  let instruction=c.instruction+(c.editTargetHint?(" Note: "+c.editTargetHint+".") : "");
  if(c.mode==="stack"){ const base=runNodeTest(dir); instruction+=" The current test FAILS with:\n"+base.out.slice(0,400); }
  const res=await B.runGenerativeRepair({workspaceDir:dir,instruction,allowedFiles:c.allowed,acceptanceCommand:["node","--test"],currentFiles:c.files,model:GEN_MODEL,timeoutMs:180000});
  const out={id:c.id,mode:c.mode,status:res.status,model:res.model||null,edits:res.proposalEdits||null};
  if(res.status==="ACCEPTED"){
    const target=(res.proposalEdits&&res.proposalEdits[0])||Object.keys(c.files)[0];
    out.producedCode=fs.readFileSync(path.join(dir,target),"utf8").trim();
    out.editedExpectedFile=(c.mode==="multi")?(res.proposalEdits||[]).some(p=>/util\.js$/.test(p)):true;
    // INDEPENDENT adversarial edge re-test (deterministic, not a model)
    const adv=mat(c.id+"-adv", Object.fromEntries(Object.keys(c.files).map(k=>[k, fs.readFileSync(path.join(dir,k),"utf8")])), c.adv);
    out.adversarialEdgePass=runNodeTest(adv).ok; fs.rmSync(adv,{recursive:true,force:true});
    // INDEPENDENT LLM evaluator — DISTINCT model (3b) judges the 7b-generated fix
    const j=await ollamaJudge(EVAL_MODEL,c.instruction,out.producedCode);
    out.independentModelEval={model:EVAL_MODEL,verdict:verdict(j),raw:j.slice(0,160)};
  } else { out.restoredExactly=hashTree(dir)===initialHash; }
  fs.rmSync(dir,{recursive:true,force:true}); return out;
}

function rollbackProof(){ const c=CASES[2]; const dir=mat("rollback",c.files,c.acc); const h0=hashTree(dir);
  const prep=B.prepareProposalContract({workspaceDir:dir,instruction:c.instruction,allowedFiles:c.allowed,acceptanceCommand:["node","--test"]});
  const wrong={edits:[{path:"src/f.js",content:"module.exports = (s) => 0;\n"}]};
  const res=B.applyProposal(prep.contract,wrong,{workspaceDir:dir}); const h1=hashTree(dir);
  const out={status:res.status,restoredExactly:h0===h1}; fs.rmSync(dir,{recursive:true,force:true}); return out; }

async function main(){
  fs.mkdirSync(ROOT,{recursive:true});
  const cases=[]; for(const c of CASES){ try{cases.push(await runCase(c));}catch(e){cases.push({id:c.id,status:"ERROR",error:String(e&&e.message)});} }
  const rollback=rollbackProof();
  const accepted=cases.filter(c=>c.status==="ACCEPTED");
  const reachable=cases.filter(c=>c.status!=="BLOCKED").length;
  const summary={
    total:cases.length, accepted:accepted.length, abstained:cases.filter(c=>c.status==="ABSTAINED").length,
    rejected:cases.filter(c=>c.status==="REJECTED").length,
    acceptRate:reachable>0?Number((accepted.length/reachable).toFixed(3)):null,
    acceptedGeneralised:accepted.filter(c=>c.adversarialEdgePass).length,
    multimoduleEditedCorrectFile:(cases.find(c=>c.id==="multimodule")||{}).editedExpectedFile||false,
    independentModelAgreedCorrect:accepted.filter(c=>c.independentModelEval&&c.independentModelEval.verdict==="CORRECT").length,
    abstainRestoredExactly:cases.filter(c=>c.status!=="ACCEPTED").every(c=>c.restoredExactly!==false),
    rollbackProof:rollback, generator:GEN_MODEL, independentEvaluator:EVAL_MODEL,
  };
  fs.writeFileSync(OUT,JSON.stringify({schema:"v319-harder-battery",generatedInside:"C6 sandbox child (/work)",cases,rollback,summary},null,2)+"\n");
  console.log("V319_DONE "+OUT); console.log(JSON.stringify(summary));
}
main().catch(e=>{console.error("V319_ERROR",e&&e.message);process.exit(1);});
