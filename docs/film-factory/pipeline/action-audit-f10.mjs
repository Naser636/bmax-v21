// Action-time audit of F10 (enriched env-peril staging) (Mission 1 + Mission 4 register). Per scene: type, staged-min (mid of f8-timing band),
// actionFraction (judgement, documented), actionMin = staged×fraction. No double-count: each scene contributes
// its OWN action time once. Also isolates the "strong/intense action" subset and checks the 60-min total.
// TYPES: ENV_PERIL · ACTION_PHYSICAL · TACTICAL · ACTIVE_SUSPENSE · SPECTACLE · DIALOGUE · EMOTIONAL · TRANSITION
const SC = [
 // sc, tag, type, stagedMin(mid), actionFraction, strong?(intense climax-grade)
 ["1","storm","SPECTACLE/ENV_PERIL",3.0,0.90,true],
 ["2","deck","DIALOGUE",0.9,0.20,false],
 ["3","seam plunge","SPECTACLE/ENV_PERIL",1.7,0.90,true],
 ["4","shore","TRANSITION",0.8,0.10,false],
 ["5","patrol","DIALOGUE/TACTICAL",1.0,0.20,false],
 ["6","first tide rescue (F10)","ENV_PERIL",1.7,0.80,false],
 ["7","Seth arrives","DIALOGUE",1.0,0.15,false],
 ["7A","town fear","EMOTIONAL",0.8,0.10,false],
 ["8","council","DIALOGUE",0.9,0.0,false],
 ["9","rules","DIALOGUE",1.2,0.0,false],
 ["9A","guardian wall","EMOTIONAL",0.9,0.0,false],
 ["10","find the hand","DIALOGUE",1.0,0.0,false],
 ["10A","crew","DIALOGUE/EMOTIONAL",0.9,0.0,false],
 ["11","Olaf&Astrid","EMOTIONAL",1.8,0.0,false],
 ["12","leash terms","DIALOGUE",1.2,0.0,false],
 ["13","lesson failure (F10)","ACTIVE_SUSPENSE/ENV_PERIL",1.6,0.60,false],
 ["14","she learns","ACTIVE_SUSPENSE",0.8,0.30,false],
 ["14A","joint evacuation (F10)","ENV_PERIL",2.4,0.82,false],
 ["15","one band","DIALOGUE/EMOTIONAL",1.2,0.0,false],
 ["15A","Tove&Astrid","EMOTIONAL",1.0,0.0,false],
 ["16/17","market tide","SPECTACLE/ENV_PERIL",2.2,0.80,false],
 ["18","outmaneuver","TACTICAL/SUSPENSE",1.2,0.25,false],
 ["18A","bleed horror","ACTIVE_SUSPENSE",1.2,0.50,false],
 ["18B","bleed montage","ACTIVE_SUSPENSE/SPECTACLE",2.5,0.30,false],
 ["19","seizure","TACTICAL",1.3,0.20,false],
 ["20","guilt talk","DIALOGUE",0.9,0.0,false],
 ["21","brother shrine","EMOTIONAL",1.3,0.0,false],
 ["21A","Helgi before","EMOTIONAL",1.2,0.0,false],
 ["22","canyon traverse (F10, a death)","ENV_PERIL",2.1,0.70,false],
 ["23","canyon echo","ACTIVE_SUSPENSE",1.5,0.35,false],
 ["24","third tide / Helgi death","ENV_PERIL/ACTION_PHYSICAL",2.0,0.90,true],
 ["25","after Helgi","EMOTIONAL",1.0,0.0,false],
 ["26","confession","DIALOGUE",1.0,0.0,false],
 ["26A","Ipy&Meryt","EMOTIONAL",1.0,0.0,false],
 ["27","trap clear","TACTICAL/SUSPENSE",0.8,0.25,false],
 ["28","siege converge","TACTICAL/SUSPENSE",1.5,0.40,false],
 ["29","Astrid takes field","ACTION_PHYSICAL/SPECTACLE",3.0,0.90,true],
 ["30","Seth choice / Meryt disarm","ACTION_PHYSICAL",2.0,0.80,true],
 ["30A","cost of the line / Börk","ACTION_PHYSICAL/ENV_PERIL",1.2,0.85,true],
 ["31","two readers","DIALOGUE/SUSPENSE",1.0,0.10,false],
 ["32","Meryt refusal","EMOTIONAL",0.9,0.0,false],
 ["33","Olaf death","EMOTIONAL",1.8,0.0,false],
 ["34","Tove goodbye","EMOTIONAL",1.0,0.0,false],
 ["35","the close","SPECTACLE",1.0,0.70,false],
 ["36","seal interior","ACTIVE_SUSPENSE/SPECTACLE",3.0,0.60,false],
 ["37","suns part","SPECTACLE",0.6,0.40,false],
 ["38","cairn","EMOTIONAL",1.0,0.0,false],
 ["38A","river button","EMOTIONAL",0.6,0.0,false],
];
const r2=x=>Math.round(x*100)/100;
let totalStaged=0, totalAction=0, strongAction=0;
const rows=SC.map(([sc,tag,type,st,fr,strong])=>{const am=r2(st*fr);totalStaged+=st;totalAction+=am;if(strong)strongAction+=am;return{sc,tag,type,stagedMin:st,actionFraction:fr,actionMin:am,strong};});
totalStaged=r2(totalStaged);totalAction=r2(totalAction);strongAction=r2(strongAction);
console.log("sc     type                         staged actFrac actMin strong");
for(const r of rows) console.log(`${r.sc.padEnd(6)} ${r.type.padEnd(28)} ${String(r.stagedMin).padStart(5)} ${String(r.actionFraction).padStart(6)} ${String(r.actionMin).padStart(6)} ${r.strong?"★":""}`);
console.log(`\nTOTAL staged (sum of scene mids) = ${totalStaged} min  [f8-timing band 56.4–91.4; mid-sum is a point estimate within it]`);
console.log(`TOTAL ACTION (no double-count) ≈ ${totalAction} min   (target ~30)  → gap ${r2(30-totalAction)} min`);
console.log(`STRONG/INTENSE action (★ climax-grade) ≈ ${strongAction} min   (target ~7)  → ${strongAction>=6.5&&strongAction<=8?"~MET":"gap "+r2(7-strongAction)}`);
console.log(`strong set: ${rows.filter(r=>r.strong).map(r=>r.sc+"("+r.actionMin+")").join(" + ")}`);
// 60-min no-double-count check: sum of scene staged mids should be ~ the intended cut (±) — flag double count
console.log(`60-min check: staged-mid sum ${totalStaged} min vs 60 target → ${Math.abs(totalStaged-60)<=10?"within ±10 (edit dials to 60; no double-count: each scene counted once)":"OUT OF BAND"}`);
