/*
 * NL GOVERNED ENGINEERING EDIT — ODG-local, human-authorized, bounded source modification.
 *
 * Proves the seam that lets ODG execute a bounded engineering edit ITSELF, locally and deterministically
 * (no provider authoring): a human grant (scope = authorized_paths + the concrete edit) turns a natural
 * "edit the file" intent into a governed contract (authorized_paths + objective.patch + an action-contract
 * carrying the human authority); a mission that already carries its edits routes to the LOCAL pipeline
 * (deterministic apply under action-gate), never the provider. No grant / malformed grant ⇒ nothing bound
 * (fail-closed). The sentence NEVER produces the edit — the edit comes from the human grant scope.
 *
 * Run: node_modules/.bin/tsx src/runtime/nl-engineering-edit.test.ts
 */
import path from "node:path";
import { createRequire } from "node:module";
import { missionIsPreAuthoredEngineering } from "./mission-cli";

const require_ = createRequire(import.meta.url);
const REPO = process.cwd();
type Obj = { id: string; patch?: unknown; actionContract?: { authority?: { mission?: string; human?: boolean } } };
type Decision = { mission?: string; contract?: { objectives: Obj[]; authorized_paths?: string[]; requires_engineering?: boolean } };
const seam = require_(path.join(REPO, "runtime", "bin", "odg-objective.js")) as {
  decide: (raw: string) => Decision;
  applyAuthorization: (d: unknown, grant: unknown, now: number) => { authorizations: unknown[]; blockers: { code: string }[] };
  consequentialRequests: (d: unknown) => { capability: string }[];
};

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const NOW = 4_000_000_000_000;
const INTENT = "edit the file";
function grant(mission: string, over?: Record<string, unknown>) {
  return { capability: "Governed Source Edit", mission, scope: { authorized_paths: ["runtime/generated/exam-scratch"], edits: [{ target: "runtime/generated/exam-scratch/demo.txt", content: "hello\n" }] }, expiresAt: NOW + 60_000, execute: true, human: true, issuer: "akabi@algonaser.fr", ...(over || {}) };
}

console.log("NL GOVERNED ENGINEERING EDIT — HUMAN-AUTHORIZED LOCAL APPLY");

// === 1. Resolver recognizes an edit intent as the consequential Governed Source Edit capability. ===
{
  const d = seam.decide(INTENT);
  check(seam.consequentialRequests(d).some((r) => r.capability === "Governed Source Edit"), "edit intent ⇒ Governed Source Edit (consequential)");
}

// === 2. Valid human grant ⇒ governed engineering contract (paths + patch + authority). =============
{
  const d = seam.decide(INTENT);
  const res = seam.applyAuthorization(d, grant(d.mission as string), NOW);
  check(res.blockers.length === 0 && res.authorizations.length === 1, "valid grant ⇒ authorized, no blockers");
  check(JSON.stringify(d.contract!.authorized_paths) === JSON.stringify(["runtime/generated/exam-scratch"]), "authorized_paths come from the human grant scope");
  check(d.contract!.requires_engineering === true, "contract is engineering-class");
  const o = d.contract!.objectives[0];
  check(Array.isArray(o.patch) && (o.patch as unknown[]).length === 1, "the concrete edit (from the grant, not the sentence) is on the objective");
  check(!!o.actionContract && o.actionContract.authority?.mission === d.mission && o.actionContract.authority?.human === true, "an action-contract carries the mission-bound human authority (enforced at apply)");
}

// === 3. Pre-authored engineering mission routes to the LOCAL pipeline (ODG apply, not provider). ===
{
  check(missionIsPreAuthoredEngineering({ authorized_paths: ["runtime/generated/exam-scratch"], objectives: [{ id: "O1", patch: { target: "runtime/generated/exam-scratch/a.txt", content: "x" } }] }) === true, "authorized_paths + concrete edit ⇒ LOCAL pipeline route");
  check(missionIsPreAuthoredEngineering({ authorized_paths: ["x"], objectives: [{ id: "O1" }] }) === false, "authorized_paths but NO edit ⇒ not this route (provider authors)");
  check(missionIsPreAuthoredEngineering({ objectives: [{ id: "O1", patch: { target: "y", content: "x" } }] }) === false, "edit but NO authorized_paths ⇒ not this route");
  check(missionIsPreAuthoredEngineering(null) === false, "no spec ⇒ fail closed");
}

// === 4. No grant / malformed grant ⇒ fail-closed (nothing bound, not executed). ===================
{
  const d1 = seam.decide(INTENT);
  const r1 = seam.applyAuthorization(d1, null, NOW);
  check(r1.authorizations.length === 0 && r1.blockers.some((b) => b.code === "NO_AUTHORIZATION"), "no grant ⇒ NO_AUTHORIZATION, nothing bound");
  check(!d1.contract!.authorized_paths || d1.contract!.authorized_paths.length === 0, "no grant ⇒ no authorized_paths (never executed locally)");

  const d2 = seam.decide(INTENT);
  const r2 = seam.applyAuthorization(d2, grant(d2.mission as string, { scope: { authorized_paths: ["runtime/generated/exam-scratch"], edits: [] } }), NOW);
  check(r2.blockers.some((b) => b.code === "NO_SCOPE" || b.code === "MALFORMED_EDIT_GRANT"), "grant with no concrete edit ⇒ fail-closed");

  const d3 = seam.decide(INTENT);
  const r3 = seam.applyAuthorization(d3, grant("SOME_OTHER_MISSION"), NOW);
  check(r3.blockers.some((b) => b.code === "MISSION_MISMATCH"), "grant bound to another mission ⇒ MISSION_MISMATCH (no transfer)");
}

console.log(failures === 0 ? "ALL PASS — NL GOVERNED ENGINEERING EDIT" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
