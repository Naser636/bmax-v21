#!/usr/bin/env node
const fs=require("fs");
const cp=require("child_process");

const verify={
generatedAt:new Date().toISOString(),
build:true,
typescript:true,
gitClean:true
};

try{
cp.execSync("npm run build",{stdio:"ignore"});
}catch{
verify.build=false;
}

try{
cp.execSync("npx tsc --noEmit",{stdio:"ignore"});
}catch{
verify.typescript=false;
}

// gitClean — HONEST working-tree check, scoped to the SAME Runtime-owned artifact paths the
// local fallback engine excludes from its governance gate (runtime/bin/odg-fallback.sh).
// Those directories hold per-mission evidence the Runtime regenerates on EVERY run (passport, report,
// certificate, generated JSON, history log) and are git-ignored — so they must never count as "dirty".
// Any change OUTSIDE them is real source/business work and legitimately makes the tree unclean.
// This replaces a former `gitClean = true` hard-code that masked the tree state unconditionally.
const ARTIFACT_EXCLUDES = [
  ":(exclude)runtime/missions/*.evidence.md",
];
try {
  const porcelain = cp
    .execSync(`git status --porcelain -- ${ARTIFACT_EXCLUDES.map((p) => `'${p}'`).join(" ")}`, {
      encoding: "utf8",
    })
    .trim();
  verify.gitClean = porcelain.length === 0;
} catch {
  // If git is unavailable the tree cannot be proven clean — fail closed.
  verify.gitClean = false;
}

// documentationProofPresent — the derived Release gate (src/core/release-manager.ts:367-369).
// It is NOT a shell check like build/typescript; the Release Manager sets it true when the
// mission's DocumentationProof carries a non-empty inputsHash, and that proof is built by
// AutonomyRuntimeAdapter.buildDocumentationProof from a mission-scoped artifact. Mirror that
// exact acceptance here so the persisted evidence reflects the gate:
//   present iff runtime/generated/mission-artifacts/generated/<mission>.json exists
//           OR  runtime/generated/mission-report.json is mission-matched + validated + SUCCESS
// (identical to documentableArtifacts + RootCauseEngine.observeDocumentationProof).
function resolveMission(){
// Prefer an explicit arg, then the active corrective mission, then the current mission.
if(process.argv[2])return process.argv[2];
for(const p of [
"runtime/generated/corrective-mission.json",
"runtime/generated/current-mission.json"
]){
try{
const m=JSON.parse(fs.readFileSync(p,"utf8")).mission;
if(typeof m==="string"&&m.length>0)return m;
}catch{}
}
return null;
}

function documentationProofPresent(mission){
if(!mission)return false;
if(fs.existsSync(`runtime/generated/mission-artifacts/generated/${mission}.json`))return true;
try{
const r=JSON.parse(fs.readFileSync("runtime/generated/mission-report.json","utf8"));
return r&&r.mission===mission&&r.validated===true&&r.status==="SUCCESS";
}catch{
return false;
}
}

const mission=resolveMission();
verify.mission=mission;
verify.documentationProofPresent=documentationProofPresent(mission);

fs.writeFileSync(
"runtime/generated/runtime-verify.json",
JSON.stringify(verify,null,2)
);

console.log("VERIFY :",verify);
