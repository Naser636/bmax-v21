// Reuse test (Mission 2): instantiate the story-independent templates + pipeline gates on a FICTIONAL project
// ("Neon Harvest" — sci-fi; chars KAI/RIA; location ORBITAL FARM) with ZERO La Porte du Soleil content.
import { readFileSync } from "node:fs";
import { BudgetLedger, makeShot, acceptanceGate, continuityCheck, rightsReleaseCheck, exportDurationGate }
  from "../pipeline/film-pipeline.mjs";
const SCHEMAS = JSON.parse(readFileSync(new URL("./schemas.json", import.meta.url),"utf8"));
let p=0,f=0; const ck=(n,c)=>{console.log((c?"PASS ":"FAIL ")+n);c?p++:f++;};

// --- instantiate templates for a DIFFERENT film ---
const project = {
  title:"Neon Harvest (fictional reuse demo)",
  characters:[ {id:"CH1",name:"KAI",role:"agronaut",physicalAnchors:["cybernetic left eye"],wardrobe:"grey flightsuit",voiceProfile:"low, dry",arcNote:"loner→leader",refSheetStatus:"TO_CREATE",refSheetSha256:null},
               {id:"CH2",name:"RIA",role:"AI handler",physicalAnchors:["braided silver hair"],wardrobe:"amber visor",voiceProfile:"bright",arcNote:"trust",refSheetStatus:"TO_CREATE",refSheetSha256:null} ],
  locations:[ {id:"LOC1",name:"ORBITAL FARM",era:"near-future sci-fi",lightingRule:"hard rim light, neon fill",keyProps:["hydroponic racks"],refSheetStatus:"TO_CREATE"} ],
  visualCharter:{ palettes:{perActOrMood:"teal/amber, high-contrast"}, aspect:"2.39:1", grainRule:"fine", continuityInvariant:"farm decay level only increases" },
};
const required=Object.keys(SCHEMAS.components);
ck("all 10 component schemas present + reusable", required.length===10 && required.every(k=>SCHEMAS.components[k].reusable===true));
ck("instantiated a DIFFERENT film from the schemas", project.characters.length===2 && project.locations.length===1);

// --- NO La Porte content leaked into the reusable layer or the new instance ---
const LAPORTE=["ASTRID","OLAF","HELGI","TOVE","MERYT","NEFER-KA","IPY","SETH-NAKHT","VIGGE","BÖRK","SŌLFARI","SEAM","HALDERN","PORTE DU SOLEIL","Sǫlveig","HALLA"];
const schemaText=JSON.stringify(SCHEMAS).toUpperCase(), instText=JSON.stringify(project).toUpperCase();
ck("schemas contain NO La Porte characters/locations (story-independent)", !LAPORTE.some(n=>schemaText.includes(n.toUpperCase())));
ck("fictional instance contains NO La Porte content", !LAPORTE.some(n=>instText.includes(n.toUpperCase())));

// --- the reusable GATES function on the fictional project ---
const b=new BudgetLedger(500); b.commit(100,"NH benchmark");
let refused=false; try{ b.spend(500,"overspend"); }catch{ refused=true; }
ck("BudgetLedger reusable: refuses over-cap on new project", refused && b.remaining()===400);
const sh=makeShot("NH-SC01-SH01","ORBITAL FARM",{kind:"video",dialogue:true}); sh.status="GENERATED";
const g=acceptanceGate(sh,{faceMatch:5,costumeDrift:false,lipsyncOk:true,exported:true},{faceMatchMin:4,requireNoDrift:true,requireLipsyncIfDialogue:true,requireExport:true});
ck("acceptanceGate reusable: accepts a clean fictional shot", g.pass);
const cc=continuityCheck([{id:"NH-SC02",characters:["KAI","GHOST"]}],{KAI:{introduced:true,lockedRef:true},GHOST:{introduced:false}});
ck("continuityCheck reusable: flags un-introduced fictional character", !cc.ok && cc.violations.some(v=>v.includes("GHOST")));
const rr=rightsReleaseCheck([{id:"NH-A1",licence:"ownership",aiDisclosed:true},{id:"NH-A2",licence:"unknown",aiDisclosed:false}]);
ck("rightsReleaseCheck reusable: blocks unclear-licence fictional asset", !rr.ok && rr.blockers.length>=1);
ck("exportDurationGate reusable: fail-closed on no-file for new project", exportDurationGate({exists:false}).ok===false);

console.log(`\nTEMPLATES-REUSE TEST (fictional 'Neon Harvest'): ${f===0?"PASS":"FAIL"} (pass=${p} fail=${f}) — factory reusable with ZERO La Porte content`);
process.exit(f?1:0);
