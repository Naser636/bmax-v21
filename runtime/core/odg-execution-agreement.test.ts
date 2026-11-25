#!/usr/bin/env node
"use strict";
/* Spec tests for odg-execution-agreement (written by the provider BEFORE the native attempt; identical semantics to the bwrap-run spec test). */
const assert=require("assert");const M=require("./odg-execution-agreement.ts");let ok=0; const fail: string[]=[];
function t(n: string,f: () => void){try{f();ok++}catch(e: any){fail.push(n+": "+e.message)}}
t("probe string",()=>assert.deepStrictEqual(M.deriveProbeInputs([["ab"]]),[[""],[" "],["a"],["abab"]]));
t("probe number+array",()=>assert.deepStrictEqual(M.deriveProbeInputs([[5,[1,2]]]),[[0,[1,2]],[-1,[1,2]],[6,[1,2]],[5,[]],[5,[1]]]));
t("probe dedup+exclude visible",()=>assert.deepStrictEqual(M.deriveProbeInputs([["a"],[""]]),[[" "],["aa"]].concat([])) );
t("probe other types untouched",()=>assert.deepStrictEqual(M.deriveProbeInputs([[true,null]]),[]));
t("probe cap 16",()=>{const v: any[]=[];for(let i=0;i<10;i++)v.push([String.fromCharCode(97+i)+"z"]);assert.strictEqual(M.deriveProbeInputs(v).length,16)});
t("sig throw",()=>assert.strictEqual(M.outputSignature({threw:true,value:1}),"T"));
t("sig value",()=>assert.strictEqual(M.outputSignature({threw:false,value:[1,{a:2}]}),'V:[1,{"a":2}]'));
t("sig undefined",()=>assert.strictEqual(M.outputSignature({threw:false,value:undefined}),"V:undefined"));
t("select empty",()=>assert.deepStrictEqual(M.selectByAgreement([]),{chosen:null,clusters:[],eligible:0,decidedBy:"none"}));
t("select majority",()=>{const r=M.selectByAgreement([{id:"C1",visiblePasses:3,signatures:["T","V:1"]},{id:"C2",visiblePasses:3,signatures:["V:[]","V:1"]},{id:"C3",visiblePasses:3,signatures:["V:[]","V:1"]},{id:"C4",visiblePasses:2,signatures:["V:[]","V:1"]}]);assert.strictEqual(r.chosen,"C2");assert.strictEqual(r.eligible,3);assert.strictEqual(r.decidedBy,"agreement");assert.deepStrictEqual(r.clusters.map((c: any)=>[c.members,c.size]),[[["C2","C3"],2],[["C1"],1]]);assert.strictEqual(r.clusters[0].key,"V:[]|V:1")});
t("select tie",()=>{const r=M.selectByAgreement([{id:"C9",visiblePasses:1,signatures:["T"]},{id:"C3",visiblePasses:1,signatures:["V:0"]}]);assert.strictEqual(r.chosen,"C3");assert.strictEqual(r.decidedBy,"tie-break")});
t("select single cluster",()=>{const r=M.selectByAgreement([{id:"B",visiblePasses:0,signatures:[]},{id:"A",visiblePasses:0,signatures:[]}]);assert.strictEqual(r.chosen,"A");assert.strictEqual(r.decidedBy,"agreement");assert.deepStrictEqual(r.clusters[0].members,["A","B"])});
for (const f of fail) console.log("NOT OK - "+f);
console.log(fail.length?fail.length+" failure(s)":"all odg-execution-agreement tests pass ("+ok+")");process.exit(fail.length?1:0);
export {};

