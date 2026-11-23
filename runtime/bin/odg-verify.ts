#!/usr/bin/env node
/* TS port → runtime/dist/bin/odg-verify.js (DEFAULT); runtime/bin/odg-verify.js = ODG_RUNTIME=js rollback. */
const fs=require("fs");
const cp=require("child_process");

// gitClean — HONEST working-tree check, scoped to the SAME Runtime-owned artifact paths the
// local execution pipeline excludes from its governance gate (runtime/bin/odg-local-pipeline.sh).
// Those directories hold per-mission evidence the Runtime regenerates on EVERY run (passport, report,
// certificate, generated JSON, history log) and are git-ignored — so they must never count as "dirty".
// Any change OUTSIDE them is real source/business work and legitimately makes the tree unclean.
// This replaces a former `gitClean = true` hard-code that masked the tree state unconditionally.
// Factory-generated mission contracts (Contract On Demand / DYNAMIC_MISSION_CONTRACT_FACTORY) are
// Runtime-regenerated bookkeeping: idempotent, stamped `generatedBy: "mission-contract-factory"`, and
// already certified structurally valid below by the generatedContractsValid gate. Like the evidence
// files above they must never count as a "dirty" tree — otherwise the factory re-materialises them on
// EVERY run, churning runtime/missions/, so gitClean can never be true and the Release Manager returns
// NO_RELEASE for every contract-on-demand mission (the structural contradiction this resolves).
// Excluded by CONTENT stamp only, so a hand-authored contract or any real source change still makes the
// tree unclean and is judged honestly.
function generatedContractExcludes(): any {
  const out: string[] = [];
  let files: string[] = [];
  try { files = fs.readdirSync("runtime/missions").filter((f: any) => f.endsWith(".json")).sort(); }
  catch { return out; }
  for (const f of files) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(`runtime/missions/${f}`, "utf8")); } catch { continue; }
    if (raw && raw.generatedBy === "mission-contract-factory") out.push(`:(exclude)runtime/missions/${f}`);
  }
  return out;
}

// gitClean exclude pathspecs — the paths that must NOT, by themselves, count as a dirty tree:
//  - runtime-regenerated per-mission bookkeeping (evidence.md; factory-generated contracts) — existing rationale;
//  - the operational COMPASS `ODG_PROJECT_STATE.md`: a NON-authoritative navigation checkpoint the Runtime
//    UPDATES every mission (the same regenerated-bookkeeping rationale) and that the CTO mandate explicitly
//    PRESERVES uncommitted — so it must never, on its own, block a release;
//  - `docs/market-research/`: untracked, non-mission material the CTO mandate PRESERVES (never commit/delete).
// This SCOPES the gate; it does NOT weaken it: any OTHER change — a modified/staged TRACKED source file, or any
// other untracked file — is still reported by `git status --porcelain --` and still makes gitClean=false (proven
// by odg-verify-gitclean.test.ts). It therefore cannot let a mission RELEASE with real uncommitted work.
function gitCleanExcludes(): string[] {
  return [
    ":(exclude)runtime/missions/*.evidence.md",
    ":(exclude)ODG_PROJECT_STATE.md",
    ":(exclude)docs/market-research/",
    ...generatedContractExcludes(),
  ];
}

// documentationProofPresent — the derived Release gate (src/core/release-manager.ts:367-369).
// It is NOT a shell check like build/typescript; the Release Manager sets it true when the
// mission's DocumentationProof carries a non-empty inputsHash, and that proof is built by
// AutonomyRuntimeAdapter.buildDocumentationProof from a mission-scoped artifact. Mirror that
// exact acceptance here so the persisted evidence reflects the gate:
//   present iff runtime/generated/mission-artifacts/generated/<mission>.json exists
//           OR  runtime/generated/mission-report.json is mission-matched + validated + SUCCESS
// (identical to documentableArtifacts + RootCauseEngine.observeDocumentationProof).
function resolveMission(explicit: any): any {
// Prefer an explicit arg, then the active corrective mission, then the current mission.
if(explicit)return explicit;
for(const p of [
"runtime/generated/corrective-mission.json",
"runtime/generated/current-mission.json"
]){
try{
const m=JSON.parse(fs.readFileSync(p,"utf8")).mission;
if(typeof m==="string"&&m.length>0)return m;
}catch {}
}
return null;
}

function documentationProofPresent(mission: any): any {
if(!mission)return false;
if(fs.existsSync(`runtime/generated/mission-artifacts/generated/${mission}.json`))return true;
try{
const r=JSON.parse(fs.readFileSync("runtime/generated/mission-report.json","utf8"));
return r&&r.mission===mission&&r.validated===true&&r.status==="SUCCESS";
}catch {
return false;
}
}

// generatedContracts — Verify the contracts the Mission Contract Factory produced (Contract On
// Demand / DYNAMIC_MISSION_CONTRACT_FACTORY). Every contract stamped `generatedBy:
// "mission-contract-factory"` must satisfy the SAME structural guard the Mission Loader enforces
// (reused from mission-synthesizer.isValidContract — no re-derivation), so an auto-generated
// contract can never slip an invalid definition into the pipeline. Purely additive evidence: it
// never weakens the build/typescript/gitClean gates the Release Manager reads.
function verifyGeneratedContracts(): any {
  const out: any={total:0,valid:0,invalid:[]};
  let synth: any;
  try{synth=require("../core/mission-synthesizer");}catch {return out;}
  let files=[];
  try{files=fs.readdirSync("runtime/missions").filter((f: any)=>f.endsWith(".json")).sort();}catch {return out;}
  for(const f of files){
    let raw;
    try{raw=JSON.parse(fs.readFileSync(`runtime/missions/${f}`,"utf8"));}catch {continue;}
    if(!raw||raw.generatedBy!=="mission-contract-factory")continue;
    out.total+=1;
    if(synth.isValidContract(raw))out.valid+=1;
    else out.invalid.push(f.replace(/\.json$/,""));
  }
  return out;
}

// V16.1 — DELEGATED-PATCH gitClean (odg-delegate only). odg-delegate observes the provider's UNCOMMITTED patch ONCE
// (scope-observer.gitChangedPathsChecked), proves EVERY observed path in-scope (scopeClean) and outside every protected
// root (protectedClean) on that SAME observation, and only then hands verify that exact path list
// (`--delegated-path=<p>`, one per path). Here gitClean is judged on the SAME porcelain surface as the default gate
// (same artifact excludes) but NUL-delimited with untracked files expanded (so a new file can never hide behind a
// collapsed directory entry), and a dirty entry is tolerated ONLY when it is EXACTLY one of those proven paths (both
// sides of a rename/copy must be). Anything else dirty ⇒ gitClean=false; a git error ⇒ false; an empty/invalid list is
// never "tolerate everything" (it tolerates nothing). Without the flag (Release Manager, local pipeline, adapter
// refresh, every other caller) runVerify takes the UNCHANGED default branch below — byte-identical behaviour.
function delegatedGitClean(porcelainZ: string, provenInScope: string[]): { gitClean: boolean; residual: string[] } {
  const proven = new Set((Array.isArray(provenInScope) ? provenInScope : []).filter((p) => typeof p === "string" && p.length > 0));
  const fields = String(porcelainZ || "").split("\0");
  const residual: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const rec = fields[i];
    if (!rec) continue;
    if (rec.length < 4) { residual.push(rec); continue; }   // unparseable record ⇒ never tolerated (fail-closed)
    const xy = rec.slice(0, 2);
    const paths = [rec.slice(3)];
    if (/[RC]/.test(xy) && i + 1 < fields.length && fields[i + 1]) { paths.push(fields[i + 1]); i++; }
    for (const p of paths) if (!proven.has(p)) residual.push(p);
  }
  return { gitClean: residual.length === 0, residual };
}

// Run the full verification and return the computed `verify` object. Side-effect: spawns
// `npm run build` and `npx tsc --noEmit` and reads the working tree — so it is ONLY ever called
// from the CLI entrypoint below (never on `require`, which must stay side-effect-free for tests).
function runVerify(explicitMission?: any, opts?: { delegatedPaths?: string[] }): any {
  const verify: any={
    generatedAt:new Date().toISOString(),
    build:true,
    typescript:true,
    gitClean:true
  };

  try{
    cp.execSync("npm run build",{stdio:"ignore"});
  }catch {
    verify.build=false;
  }

  try{
    cp.execSync("npx tsc --noEmit",{stdio:"ignore"});
  }catch {
    verify.typescript=false;
  }

  const ARTIFACT_EXCLUDES = gitCleanExcludes();
  const delegatedPaths = opts && Array.isArray(opts.delegatedPaths) ? opts.delegatedPaths : null;
  if (delegatedPaths) {
    try {
      const z = cp.execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...ARTIFACT_EXCLUDES], { encoding: "utf8" });
      const d = delegatedGitClean(String(z), delegatedPaths);
      // #922 inspection MED: the PERSISTED gitClean keeps its default meaning (the tree is NOT clean while the delegated
      // patch is uncommitted) because other consumers (acceptance-facts → mechanical-acceptance, stage-build-ts-evidence)
      // read only `gitClean`. The delegated verdict is a SEPARATE field; only verifyExitCode in delegated mode uses it.
      verify.gitClean = false;
      verify.delegatedPatchClean = d.gitClean;
      verify.gitCleanScope = { mode: "DELEGATED_PATCH", provenInScope: delegatedPaths.slice().sort(), residualDirty: d.residual, note: "gitClean=false is the tree state; delegatedPatchClean is the delegate's verdict (exact proven paths only)" };
    } catch {
      verify.gitClean = false;   // git unavailable ⇒ the tree cannot be proven clean — fail closed (same as default)
      verify.delegatedPatchClean = false;
      verify.gitCleanScope = { mode: "DELEGATED_PATCH", provenInScope: delegatedPaths.slice().sort(), residualDirty: ["<git status failed>"] };
    }
  } else try {
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

  const mission=resolveMission(explicitMission);
  verify.mission=mission;
  verify.documentationProofPresent=documentationProofPresent(mission);

  const generatedContracts=verifyGeneratedContracts();
  verify.generatedContracts=generatedContracts;
  verify.generatedContractsValid=generatedContracts.invalid.length===0;

  return verify;
}

// Truthful exit status for the ALREADY-COMPUTED verification result — the single source of truth is
// the `verify` object this process just wrote; this never recomputes or invents a second verdict.
// A red build, a failed TypeScript gate, or a dirty/unprovable working tree (the three shell gates the
// Release Manager and odg-local-pipeline.sh gate on) is a FAILED verification and must exit non-zero;
// a genuinely green tree exits 0. documentationProofPresent and generatedContractsValid are additive
// evidence (the former is legitimately absent when no mission context is active) and are NOT turned
// into a non-zero exit here. `--report-only` (used by odg-local-pipeline.sh's pre-flight, which does
// its OWN content gating and deliberately tolerates a dirty tree for FINALIZE_*/CLOSEOUT_* missions)
// generates the evidence file without propagating the exit code, preserving that pipeline exactly.
// `--delegated-path=<p>` (repeatable) — ONLY odg-delegate passes it. null when absent ⇒ the default gate, unchanged.
function parseDelegatedPaths(argv: string[]): string[] | null {
  const pre = "--delegated-path=";
  const list = (Array.isArray(argv) ? argv : []).filter((a) => typeof a === "string" && a.startsWith(pre)).map((a) => a.slice(pre.length));
  return list.length ? list : null;
}

function verifyExitCode(verify: any, reportOnly?: any): number {
  if(reportOnly)return 0;
  // delegated mode (gitCleanScope.mode === DELEGATED_PATCH): the clean verdict is delegatedPatchClean; default: gitClean.
  const clean = verify && verify.gitCleanScope && verify.gitCleanScope.mode === "DELEGATED_PATCH" ? verify.delegatedPatchClean === true : verify && verify.gitClean === true;
  const green = !!verify && verify.build===true && verify.typescript===true && clean;
  return green?0:1;
}

module.exports = { verifyExitCode, runVerify, gitCleanExcludes, delegatedGitClean, parseDelegatedPaths };

export {};

if(require.main===module){
  const args=process.argv.slice(2);
  const reportOnly=args.includes("--report-only");
  const explicitMission=args.find((a)=>!a.startsWith("--"));
  const delegatedPaths=parseDelegatedPaths(args);

  const verify=delegatedPaths?runVerify(explicitMission,{delegatedPaths}):runVerify(explicitMission);

  fs.writeFileSync(
    "runtime/generated/runtime-verify.json",
    JSON.stringify(verify,null,2)
  );

  console.log("VERIFY :",verify);
  process.exit(verifyExitCode(verify,reportOnly));
}
