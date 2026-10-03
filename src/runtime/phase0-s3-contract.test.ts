/*
 * S3 — CONTRACT outcome fields (definition_of_done / completion / verify) are carried verbatim
 * from the mission contract into the plan (wired into `npm test` via the src/runtime/*.test.ts
 * glob, exactly like S1/S2).
 *
 * Proves the loader transports the mission's CONTRACT outcomes — definitionOfDone (from
 * definition_of_done | definitionOfDone), completion, and verify (capability→evidence pairs) —
 * into plan.contract WITHOUT transformation, supports both the snake_case and camelCase DoD
 * keys, applies safe defaults ([] / [] / []) when the fields are absent and drops malformed
 * verify entries, and is deterministic. Transport only: no interpretation, no enforcement is
 * asserted here (DoD/completion are not gated; verify is not merged into step requirements).
 *
 * Hermetic: writes throwaway fixture contracts into an isolated temp missionsDir and removes
 * them afterwards, so it touches no repo contract and leaves git untouched.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/phase0-s3-contract.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MissionLoader, MissionContract } from "./mission-loader";
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

console.log("S3 — CONTRACT outcomes carried verbatim from the mission contract");

// Isolated temp missionsDir (defaults kept for projectContext/brain paths).
const dir = path.join(os.tmpdir(), "odg-s3-contract-fixtures");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

// Outcome payloads shared by the snake_case and camelCase fixtures.
const DOD = [
  "Objective satisfied strictly within the authorized scope.",
  "Validation Engine reports success.",
];
const COMPLETION = ["Release Manager decision is RELEASE."];
const VERIFY = [
  { capability: "Build gate", evidence: "build-green" },
  { capability: "TypeScript gate", evidence: "typescript-green" },
];

const fixtures: Record<string, unknown> = {
  // snake_case definition_of_done + full contract outcomes
  S3_FULL_SNAKE: {
    id: "S3_FULL_SNAKE",
    mode: "IMPLEMENT",
    definition_of_done: DOD,
    completion: COMPLETION,
    verify: VERIFY,
  },
  // camelCase definitionOfDone + full contract outcomes
  S3_FULL_CAMEL: {
    id: "S3_FULL_CAMEL",
    mode: "IMPLEMENT",
    definitionOfDone: DOD,
    completion: COMPLETION,
    verify: VERIFY,
  },
  // none of the outcome fields present → safe defaults expected
  S3_EMPTY: {
    id: "S3_EMPTY",
    mode: "IMPLEMENT",
  },
  // malformed verify entries must be dropped (transport keeps only well-formed pairs)
  S3_MALFORMED_VERIFY: {
    id: "S3_MALFORMED_VERIFY",
    mode: "IMPLEMENT",
    verify: [
      { capability: "Good gate", evidence: "good-evidence" },
      { capability: "missing evidence" },
      { evidence: "missing capability" },
      "not an object",
      { capability: 1, evidence: 2 },
    ],
  },
};
for (const [id, body] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(body, null, 2), "utf8");
}

const contractOf = (id: string): MissionContract => {
  const loader = new MissionLoader(undefined, undefined, dir);
  return new MissionOrchestrator(loader).buildPlan(id, id).contract;
};

try {
  // C1 — TRANSPORT: a full contract's outcomes land in plan.contract with all three fields.
  {
    const c = contractOf("S3_FULL_SNAKE");
    check(
      c !== undefined &&
        "definitionOfDone" in c &&
        "completion" in c &&
        "verify" in c,
      "full contract outcomes are transported into plan.contract (all three fields)",
    );
  }

  // C2 — NO TRANSFORMATION: values are conserved verbatim from the contract.
  {
    const c = contractOf("S3_FULL_SNAKE");
    check(eq(c.definitionOfDone, DOD), "definitionOfDone conserved verbatim");
    check(eq(c.completion, COMPLETION), "completion conserved verbatim");
    check(eq(c.verify, VERIFY), "verify (capability→evidence) conserved verbatim");
  }

  // C3 — KEY DUALITY: definition_of_done (snake) and definitionOfDone (camel) both honoured
  //      and yield the identical definitionOfDone value.
  {
    const snake = contractOf("S3_FULL_SNAKE");
    const camel = contractOf("S3_FULL_CAMEL");
    check(eq(snake.definitionOfDone, DOD), "definition_of_done (snake_case) is supported");
    check(eq(camel.definitionOfDone, DOD), "definitionOfDone (camelCase) is supported");
    check(eq(snake.definitionOfDone, camel.definitionOfDone), "both key spellings yield the same definitionOfDone");
  }

  // C4 — SAFE DEFAULTS: a mission without the outcome fields gets [] / [] / [];
  //      malformed verify entries are dropped, well-formed ones kept.
  {
    const c = contractOf("S3_EMPTY");
    check(eq(c.definitionOfDone, []), "missing definition of done → []");
    check(eq(c.completion, []), "missing completion → []");
    check(eq(c.verify, []), "missing verify → []");

    const m = contractOf("S3_MALFORMED_VERIFY");
    check(
      eq(m.verify, [{ capability: "Good gate", evidence: "good-evidence" }]),
      "malformed verify entries dropped; well-formed pair kept",
    );
  }

  // C5 — DETERMINISM: identical mission ⇒ identical contract transport.
  {
    check(eq(contractOf("S3_FULL_SNAKE"), contractOf("S3_FULL_SNAKE")), "deterministic for identical mission");
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL PASS — S3 CONTRACT PROVEN" : `\n${failures} FAILURE(S) — S3 NOT PROVEN`);
process.exit(failures === 0 ? 0 : 1);
