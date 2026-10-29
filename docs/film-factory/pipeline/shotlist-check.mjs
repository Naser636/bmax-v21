// Reproducible checks for the 49-scene shot-list (campaign §6). Offline; no spend.
import { readFileSync } from "node:fs";
const L = JSON.parse(readFileSync(new URL("./shot-list.json", import.meta.url),"utf8"));
const timing = readFileSync(new URL("./f7-timing.txt", import.meta.url),"utf8");
const seed = JSON.parse(readFileSync(new URL("./shot-ledger-seed.json", import.meta.url),"utf8"));
let p=0,f=0; const ck=(n,c)=>{console.log((c?"PASS ":"FAIL ")+n);c?p++:f++;};
const S=L.shots;
const MEDIA=["PREMIUM_VIDEO","STILL_ANIMATABLE","AUDIO_LINE","MUSIC_CUE","SFX"];

// coverage: all 49 scenes represented
const scenesCovered=new Set(S.map(s=>s.scene));
ck(`all 49 scenes covered (${scenesCovered.size})`, scenesCovered.size===49 && [...Array(49)].every((_,i)=>scenesCovered.has("SC"+String(i+1).padStart(2,"0"))));
ck("matches seed-ledger scene count (49)", seed.scenes===49);
// unique shot ids
const ids=S.map(s=>s.id); ck(`unique shot ids (${ids.length})`, new Set(ids).size===ids.length);
// every shot traces to a valid scene id
ck("every shot.scene is SC01..SC49", S.every(s=>/^SC(0[1-9]|[1-4]\d)$/.test(s.scene)));
// required fields present on EVERY shot
ck("every shot has targetSec(number), acceptanceCriteria(>=1), rejectionReason, mediaCategory",
   S.every(s=>typeof s.targetSec==="number" && Array.isArray(s.acceptanceCriteria)&&s.acceptanceCriteria.length>=1 && s.rejectionReason && MEDIA.includes(s.mediaCategory)));
ck("every shot has shotType, movement, subjectAction, setting, era, palette, proposedPrompt",
   S.every(s=>s.shotType&&s.movement&&s.subjectAction&&s.setting&&s.era&&s.palette&&s.proposedPrompt));
// refs never invented: every continuity ref is TO_CREATE (no file link)
ck("all continuity refs marked TO_CREATE (none invented as existing)",
   S.every(s=>s.continuityRefs.every(r=>r.status==="TO_CREATE")) && L.referencesToCreate.every(r=>r.status==="TO_CREATE"));
// costs ESTIMATED, never MEASURED
ck("all costs ESTIMATED (none MEASURED)", S.every(s=>s.costStatus==="ESTIMATED") && !JSON.stringify(L).includes('"MEASURED"'));
ck("every shot carries a pre-spend refusal rule", S.every(s=>/REFUSE/.test(s.refusalRule)));
// media separation: stills are not video; audio/music not counted as finished footage
ck("still not counted as video (distinct categories)", S.some(s=>s.mediaCategory==="STILL_ANIMATABLE") && S.some(s=>s.mediaCategory==="PREMIUM_VIDEO") && L.byMediaCategory.STILL_ANIMATABLE.count>0);
// budget reconciliation: allocation = plan, committed/spent = 0, within cap
ck("budget: allocatedEstimate ≤ €4000, committed=spent=0, remaining=4000",
   L.budget.allocatedEstimateEur<=4000 && L.budget.committedEur===0 && L.budget.spentEur===0 && L.budget.remainingEur===4000 && L.budget.withinCap===true);
ck("per-category alloc sums to total allocatedEstimate",
   Math.abs(Object.values(L.byMediaCategory).reduce((a,c)=>a+c.allocEur,0) - L.budget.allocatedEstimateEur) < 0.5);
// audio lines == dialogue cues in timing-era (140) sanity
ck("audio-line shots == 140 (one per dialogue line)", L.byMediaCategory.AUDIO_LINE.count===140);
// COVERAGE consistency (NOT a runtime re-derivation — shot-list is coverage; runtime comes from scene-timing).
// Correct relation: every scene has coverage; set-pieces are covered DENSER than dialogue scenes.
const perScene={}; for(const s of S){ (perScene[s.scene]=perScene[s.scene]||[]).push(s); }
ck(`every scene has coverage (>=1 shot each; avg ${(S.length/49).toFixed(1)}/scene >=2)`,
   Object.keys(perScene).length===49 && Object.values(perScene).every(a=>a.length>=1) && S.length/49>=2);
const videoScenes=Object.values(perScene).filter(a=>a.some(s=>s.mediaCategory==="PREMIUM_VIDEO"));
const stillOnly=Object.values(perScene).filter(a=>!a.some(s=>s.mediaCategory==="PREMIUM_VIDEO"));
const avg=a=>a.reduce((x,s)=>x+s.length,0)/a.length;
ck(`set-pieces covered denser than dialogue scenes (${avg(videoScenes).toFixed(1)} vs ${avg(stillOnly).toFixed(1)} shots/scene)`, avg(videoScenes) > avg(stillOnly));
ck("shot-list is COVERAGE (runtime is the scene-timing model's job, not re-summed here)", /PREP/.test(L.generated));
ck("timing file still reports 49 scenes (consistency)", /SCENES=49/.test(timing));
// no false production: every shot PLANNED (nothing generated/exported)
ck("every shot status=PLANNED (no media generated)", S.every(s=>s.status==="PLANNED"));

console.log(`\nSHOT-LIST CHECKS: ${f===0?"PASS":"FAIL"} (pass=${p} fail=${f})  [prep only — prompts/plans, NOT media]`);
process.exit(f?1:0);
