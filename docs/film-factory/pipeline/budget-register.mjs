// €2,000 centralized budget register (Phase 4). Distinguishes ceiling / allocatedEstimate / committed / spent.
// Envelopes are HYPOTHESES (modifiable), NOT obligations. BudgetLedger(2000) arms the hard cap. Zero spend.
import { readFileSync, writeFileSync } from "node:fs";
import { BudgetLedger } from "./film-pipeline.mjs";
const CAP = 2000;
const shotlist = JSON.parse(readFileSync(new URL("./shot-list.json", import.meta.url),"utf8"));
const byCat = shotlist.byMediaCategory;
// envelopes: ceiling + an allocatedEstimate drawn from the shot-list where applicable (ESTIMATE, not spend)
const env = [
  { id:"benchmark_tool_select", ceiling:250, allocatedEstimate:250, note:"benchmark+tool selection; ≤€250 (was €350 under the old €4k cap — revised down)" },
  { id:"video_generation",      ceiling:550, allocatedEstimate:byCat.PREMIUM_VIDEO.allocEur, note:"selected premium-video gens (shot-list est)" },
  { id:"images_refs_visual",    ceiling:200, allocatedEstimate:byCat.STILL_ANIMATABLE.allocEur, note:"stills + reference sheets (shot-list est)" },
  { id:"voice_music_sfx",       ceiling:250, allocatedEstimate:Math.round((byCat.AUDIO_LINE.allocEur+byCat.MUSIC_CUE.allocEur)*100)/100, note:"voice lines + music cues + SFX (shot-list est)" },
  { id:"edit_sound_review",     ceiling:350, allocatedEstimate:0, note:"targeted human edit+sound review (DaVinci/ffmpeg free; this is review time/service IF used)" },
  { id:"storage_misc",          ceiling:100, allocatedEstimate:0, note:"storage + misc" },
  { id:"conditional_reserve",   ceiling:300, allocatedEstimate:0, note:"reserve; spend only on demonstrated need" },
];
const sumCeil = env.reduce((a,e)=>a+e.ceiling,0);
const sumAlloc = Math.round(env.reduce((a,e)=>a+e.allocatedEstimate,0)*100)/100;
// arm the ledger (nothing committed/spent)
const ledger = new BudgetLedger(CAP);
const out = {
  cap: CAP, note: "Envelopes are modifiable HYPOTHESES, not obligations. allocatedEstimate=plan(ESTIMATE); committed=0; spent=0. Unused budget stays in budget. No spend is authorized; the €2000 cap is NOT a spend authorization.",
  envelopes: env.map(e=>({ ...e, committedEur:0, spentEur:0, costStatus:"ESTIMATED", withinCeiling: e.allocatedEstimate<=e.ceiling })),
  totals: { ceilingsSum: sumCeil, allocatedEstimateSum: sumAlloc, committedEur:0, spentEur:0,
    remainingEur: ledger.remaining(), ceilingsWithinCap: sumCeil<=CAP, allocWithinCap: sumAlloc<=CAP },
  checksToVerify: ["commercial licence per tool", "taxes/VAT", "recurring fees", "expiring credits", "cancellation terms"],
};
writeFileSync(new URL("./budget-register.json", import.meta.url), JSON.stringify(out,null,1));
console.log(`€2000 register: ceilings sum €${sumCeil} (≤cap ${sumCeil<=CAP}) | allocatedEstimate €${sumAlloc} (≤cap ${sumAlloc<=CAP}) | committed €0 | spent €0 | remaining €${ledger.remaining()}`);
env.forEach(e=>console.log(`  ${e.id.padEnd(22)} ceiling €${String(e.ceiling).padStart(4)}  allocEst €${e.allocatedEstimate}  within:${e.allocatedEstimate<=e.ceiling}`));
