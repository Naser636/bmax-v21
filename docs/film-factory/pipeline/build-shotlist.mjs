// Build a traceable SHOT-LIST for all 49 F7 scenes. Zero-cost PREP: prompts + plans, NOT media.
// Never invents a visual-reference link — every ref is marked TO_CREATE. Costs are ESTIMATED (never MEASURED).
// Allocations reconcile to the €4,000 cap (allocation = plan, NOT committed/spent).
import { readFileSync, writeFileSync } from "node:fs";
const F = readFileSync(new URL("../25_SCREENPLAY_60MIN_F7.md", import.meta.url), "utf8").split("## Draft F7 status")[0];
const PRINCIPALS = ["ASTRID","OLAF","HELGI","TOVE","MERYT","NEFER-KA","IPY","SETH-NAKHT","VIGGE","BÖRK","WIDOW","ELDER"];
// set-piece sequences (premium video). key = scene-number prefix as in headings.
const SETPIECE = ["1.","3.","16.","17.","22.","23.","24.","28.","29.","30.","35.","36.","18B","14A","30A"];
const PALETTE = { I:"cold Norse steel-grey vs Egyptian gold/ochre", II:"bronze-green bleed creeping as desync grows", III:"blinding gold at convergence → calm single-sun dawn" };
// ESTIMATED unit costs (incl. retake allowance) — NON_VERIFIED, benchmark will replace
const COST = { PREMIUM_VIDEO: 4.0, STILL_ANIMATABLE: 0.35, AUDIO_LINE: 0.5, MUSIC_CUE: 3.0, SFX: 0.0 };
const CAP = 4000;

const parts = F.split(/^### /m).slice(1);
let act = "I"; const shots = []; let sc = 0;
const refSet = new Map(); // name -> {name,type,status}
const addRef = (name,type) => { const k=type+":"+name; if(!refSet.has(k)) refSet.set(k,{name,type,status:"TO_CREATE",note:"reference sheet not yet generated"}); return {ref:name,type,status:"TO_CREATE"}; };

for (const p of parts) {
  const head = p.split("\n")[0].trim();
  sc++;
  const scId = "SC" + String(sc).padStart(2,"0");
  // act tracking via preceding ACT markers in body order
  if (/^(28|29|30|31|32|33|34|35|36|37|38)/.test(head)) act="III";
  else if (/^(12|13|14|15|16|17|18|19|20|21|22|23|24|25|26|27)/.test(head)) act="II";
  else act="I";
  const loc = (head.match(/(?:EXT\.|INT\.)\s+([^—\-]+?)(?:—| -|$)/)||[,"UNSPECIFIED"])[1].trim();
  const isSet = SETPIECE.some(k=>head.startsWith(k));
  const present = PRINCIPALS.filter(n=>p.includes(n));
  const cues = (p.match(/^\*\*([A-ZÀ-Þ][A-ZÀ-Þ\- ]+?):\*\*/gm)||[]).map(m=>m.replace(/\*\*/g,"").replace(":","").trim());
  const actionBeats = (p.match(/^\*(?!\*)/gm)||[]).length;
  const func = (p.match(/\*Purpose:.*?\*/)||p.match(/\[MATRIX-NEW:[^\]]*\]/)||[head.slice(0,60)])[0].replace(/[*\[\]]/g,"").slice(0,90);
  const locRef = addRef(loc, "location");

  const mk = (k, cam, move, subj, dur, mediaCat, extraRefs=[]) => {
    const refs = [locRef, ...extraRefs];
    const cost = COST[mediaCat];
    shots.push({
      id: `${scId}-SH${String(k).padStart(2,"0")}`, scene: scId, sceneHead: head.slice(0,50),
      act, dramaticFunction: func, shotType: cam, movement: move, subjectAction: subj,
      setting: loc, era: "fantasy (Norse ∩ pharaonic, dramatized)", palette: PALETTE[act],
      continuityRefs: refs, targetSec: dur, mediaCategory: mediaCat,
      proposedPrompt: `${loc}, ${cam}${move?` (${move})`:""}: ${subj}. Cinematic, ${PALETTE[act]}. Consistent with refs: ${refs.map(r=>r.ref).join(", ")}. [prompt is a PLAN; not generated]`,
      acceptanceCriteria: mediaCat==="PREMIUM_VIDEO"
        ? ["face/costume identity ≥4/5 vs ref","no proportion/continuity drift","motion plausible","clean 1080p+"]
        : mediaCat==="AUDIO_LINE" ? ["intelligible","voice-consistent with character","lip-syncable"]
        : ["composition on-intent","identity ≥4/5 vs ref","exportable 1080p+ still"],
      rejectionReason: mediaCat==="PREMIUM_VIDEO" ? "identity/continuity drift, implausible motion, or artifacting"
        : mediaCat==="AUDIO_LINE" ? "unintelligible or inconsistent voice" : "off-composition or identity drift",
      costEurEstimated: cost, costUnit: "per usable shot (incl. retake allowance)", costStatus: "ESTIMATED",
      refusalRule: "REFUSE generation if committed+spent+costEur > €4000 (BudgetLedger enforces pre-spend)",
      status: "PLANNED"
    });
  };

  let k = 0;
  // 1 establishing shot per scene
  mk(++k, isSet?"PREMIUM_VIDEO-WIDE":"WIDE", isSet?"slow push-in":"static", `establishing — ${loc}`, isSet?6:3,
     isSet?"PREMIUM_VIDEO":"STILL_ANIMATABLE", present.slice(0,3).map(n=>addRef(n,"character")));
  // coverage: one shot per dialogue line (shot/reverse), still-animatable
  for (const sp of cues) mk(++k, "MED/CU coverage", "subtle", `${sp} — line coverage`, 4, "STILL_ANIMATABLE",
     present.filter(n=>n===sp).map(n=>addRef(n,"character")));
  // audio line per cue
  for (const sp of cues) mk(++k, "AUDIO", "n/a", `${sp} — dialogue VO`, 4, "AUDIO_LINE", [addRef(sp,"character")]);
  // action/VFX inserts: set-pieces get video action beats; others get a couple of still inserts
  const inserts = isSet ? Math.max(3, Math.round(actionBeats/2)) : Math.min(2, Math.round(actionBeats/3));
  for (let i=0;i<inserts;i++) mk(++k, isSet?"PREMIUM_VIDEO-INSERT":"INSERT", isSet?"handheld/whip":"static",
     isSet?`action/VFX beat ${i+1}`:`insert / visual business ${i+1}`, isSet?5:3,
     isSet?"PREMIUM_VIDEO":"STILL_ANIMATABLE", []);
  // music cue flag on set-pieces + key emotional scenes
  if (isSet || /OLAF|CAIRN|SEAL|CONFESSION/i.test(head)) mk(++k, "MUSIC", "n/a", "scored cue", 0, "MUSIC_CUE", []);
}

// budget reconciliation — ALLOCATION is a plan, not a spend
const alloc = Math.round(shots.reduce((a,s)=>a+s.costEurEstimated,0)*100)/100;
const byCat = {}; for(const s of shots){ byCat[s.mediaCategory]=(byCat[s.mediaCategory]||0); byCat[s.mediaCategory]+= s.costEurEstimated; }
Object.keys(byCat).forEach(k=>byCat[k]=Math.round(byCat[k]*100)/100);
const out = {
  generated: "F7 shot-list (PREP; prompts+plans, NOT media)", scenes: sc, totalShots: shots.length,
  byMediaCategory: Object.fromEntries(Object.entries(byCat).map(([k,v])=>[k,{count:shots.filter(s=>s.mediaCategory===k).length, allocEur:v}])),
  budget: { cap: CAP, allocatedEstimateEur: alloc, committedEur: 0, spentEur: 0, remainingEur: CAP,
    withinCap: alloc<=CAP, note: "allocatedEstimate is a PLAN (ESTIMATED); committed/spent are REAL and both 0; remaining = cap - committed - spent" },
  referencesToCreate: [...refSet.values()],
  reconciliation: "allocatedEstimate €"+alloc+" = the GENERATION-CREDIT component (video/stills/audio-lines/music gens). It is a COMPONENT of the fuller production budget in docs 09/14 (~€1,144 incl. subscriptions €360 + voice-minutes + reserve); both are ESTIMATES, not committed/spent, and both sit within the €4,000 cap. Allocation ≠ commitment ≠ spend.",
  shots
};
writeFileSync(new URL("./shot-list.json", import.meta.url), JSON.stringify(out,null,1));
console.log(`shot-list: ${sc} scenes, ${shots.length} shots | alloc €${alloc} (ESTIMATE) ≤ cap €${CAP}: ${alloc<=CAP}`);
console.log("by category:", JSON.stringify(out.byMediaCategory));
console.log(`refs TO_CREATE: ${refSet.size} (characters+locations; none invented as existing)`);
