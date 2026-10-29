import { readFileSync, writeFileSync } from "node:fs";
import { makeShot, BudgetLedger } from "./film-pipeline.mjs";
const d = readFileSync(new URL("../25_SCREENPLAY_60MIN_F7.md", import.meta.url),"utf8").split("## Draft F7 status")[0];
const SET = ["1.","3.","16.","17.","22.","23.","24.","28.","29.","30.","35.","36.","18B","14A"];
const scenes = d.split(/^### /m).slice(1).map(p=>p.split("\n")[0].trim());
const ledger = scenes.map((h,i)=>{
  const setp = SET.some(k=>h.startsWith(k));
  const s = makeShot("SC"+String(i+1).padStart(2,"0"), h.split(/[—\[]/)[0].trim().slice(0,40), {kind:setp?"video":"still"});
  s.setpiece = setp; s.status="PLANNED"; return s;
});
const budget = new BudgetLedger(4000);
writeFileSync(new URL("./shot-ledger-seed.json", import.meta.url),
  JSON.stringify({generated:"F7 pre-production seed", scenes:ledger.length,
    setpieceScenes:ledger.filter(s=>s.setpiece).length, stillScenes:ledger.filter(s=>!s.setpiece).length,
    budget:budget.snapshot(), ledger},null,1));
console.log("seeded scene-ledger: "+ledger.length+" scenes ("+ledger.filter(s=>s.setpiece).length+" video set-pieces, "+ledger.filter(s=>!s.setpiece).length+" still) — all status=PLANNED, budget cap €4000 armed");
