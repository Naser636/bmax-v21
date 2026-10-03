/*
 * Campaign 04 (Path B authoring) — OPTIONAL objective-level PROOF BINDING: transport test
 * (wired into `npm test` via the src/runtime/*.test.ts glob).
 *
 * Proves ONLY the authoring + transport of the new OPTIONAL `objectives[].proof` field — the NAME
 * of a probe already registered in capability-probes. It proves the field is INERT when absent
 * (null), transported VERBATIM when present, carried even for an UNKNOWN probe name WITHOUT ever
 * being turned into a pass/verdict (no lookup, no evaluation in the loader), deterministic, and
 * reachable on the plan via plan.mission.brain.objectiveSpecs.
 *
 * It explicitly does NOT consume the field as a gate, does NOT evaluate any probe, and does NOT use
 * done_when as a binding. Hermetic: throwaway fixtures in an isolated temp missionsDir, removed
 * afterwards; touches none of the 152 committed contracts.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/phase0-c04-proof-binding.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MissionLoader, ObjectiveSpec } from "./mission-loader";
import { MissionOrchestrator } from "./mission-orchestrator";

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`  PASS ${label}`);
  } else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

console.log("C04 — OPTIONAL objective-level PROOF BINDING (authoring + transport only)");

const dir = path.join(os.tmpdir(), "odg-c04-proof-fixtures");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const fixtures: Record<string, unknown> = {
  // objective declares a proof binding = a real registered probe name
  C04_PRESENT: {
    id: "C04_PRESENT",
    mode: "IMPLEMENT",
    objectives: [{ id: "OBJ-1", goal: "ship it", done_when: ["x"], proof: "build-green" }],
  },
  // objective declares an UNKNOWN probe name — must be carried verbatim, never a pass
  C04_UNKNOWN: {
    id: "C04_UNKNOWN",
    mode: "IMPLEMENT",
    objectives: [{ id: "OBJ-1", goal: "ship it", done_when: ["x"], proof: "totally-unknown-probe" }],
  },
  // objective declares NO proof — field must be inert (null)
  C04_ABSENT: {
    id: "C04_ABSENT",
    mode: "IMPLEMENT",
    objectives: [{ id: "OBJ-1", goal: "ship it", done_when: ["x"] }],
  },
  // non-string proof must normalize to null (never a verdict)
  C04_BADTYPE: {
    id: "C04_BADTYPE",
    mode: "IMPLEMENT",
    objectives: [{ id: "OBJ-1", goal: "ship it", done_when: ["x"], proof: 123 }],
  },
};
for (const [id, body] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(body, null, 2), "utf8");
}

const specsOf = (id: string): ObjectiveSpec[] =>
  new MissionLoader(undefined, undefined, dir).load(id, id).brain.objectiveSpecs;
// Transport to the plan: the orchestrator carries RuntimeMission verbatim, so the binding is
// reachable at plan.mission.brain.objectiveSpecs — with NO orchestrator/step change.
const planSpecsOf = (id: string): ObjectiveSpec[] =>
  new MissionOrchestrator(new MissionLoader(undefined, undefined, dir)).buildPlan(id, id)
    .mission.brain.objectiveSpecs;

try {
  // 1 — PRESENT: transported verbatim onto the objective spec.
  {
    const s = specsOf("C04_PRESENT")[0];
    check(s.proof === "build-green", "present proof is transported verbatim");
  }

  // 2 — ABSENT: inert (null), never undefined, never a verdict.
  {
    const s = specsOf("C04_ABSENT")[0];
    check(s.proof === null, "absent proof ⇒ null (inert)");
  }

  // 3 — non-string proof normalizes to null (no fabricated value).
  {
    const s = specsOf("C04_BADTYPE")[0];
    check(s.proof === null, "non-string proof ⇒ null");
  }

  // 4 — UNKNOWN probe name: carried verbatim but NEVER turned into a pass/verdict by the loader.
  {
    const s = specsOf("C04_UNKNOWN")[0];
    check(s.proof === "totally-unknown-probe", "unknown probe name is carried verbatim (opaque)");
    // The loader attaches NO evaluation/verdict — the spec exposes no ok/pass/verdict/satisfied field.
    const blob = JSON.stringify(s).toLowerCase();
    check(
      !blob.includes("\"ok\"") && !blob.includes("pass") && !blob.includes("verdict") && !blob.includes("satisfied") && !blob.includes("proven"),
      "unknown probe name never becomes a pass/verdict (no evaluation in the loader)",
    );
  }

  // 5 — reaches the PLAN via plan.mission.brain.objectiveSpecs (transport with no step change).
  {
    const p = planSpecsOf("C04_PRESENT")[0];
    const a = planSpecsOf("C04_ABSENT")[0];
    check(p.proof === "build-green" && a.proof === null, "proof binding reaches the plan (present verbatim; absent null)");
  }

  // 6 — done_when is NOT used as the binding (independent field; proof stays null when only done_when is set).
  {
    const s = specsOf("C04_ABSENT")[0];
    check(Array.isArray(s.doneWhen) && s.doneWhen.length === 1 && s.proof === null, "done_when present but proof null ⇒ done_when is not the binding");
  }

  // 7 — DETERMINISM: identical mission ⇒ identical objective specs (incl. proof).
  {
    check(eq(specsOf("C04_PRESENT"), specsOf("C04_PRESENT")), "deterministic objective specs for identical mission");
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL PASS — C04 PROOF-BINDING TRANSPORT PROVEN" : `\n${failures} FAILURE(S) — C04 PROOF-BINDING NOT PROVEN`);
process.exit(failures === 0 ? 0 : 1);
