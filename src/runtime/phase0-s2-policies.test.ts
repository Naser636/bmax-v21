/*
 * S2 — GOVERNANCE (policies) is carried verbatim from the mission contract into the plan
 * (wired into `npm test` via the src/runtime/*.test.ts glob, exactly like S1).
 *
 * Proves the loader transports the mission's governance — policies / permissions /
 * authorized_paths|authorizedPaths / executionPolicy — into plan.policies WITHOUT
 * transformation, supports both the snake_case and camelCase authorized-paths keys,
 * applies safe defaults ([] / null) when the fields are absent, and is deterministic.
 * Transport only: no interpretation, no enforcement is asserted here.
 *
 * Hermetic: writes throwaway fixture contracts into an isolated temp missionsDir and
 * removes them afterwards, so it touches no repo contract and leaves git untouched.
 *
 * Run directly: node_modules/.bin/tsx src/runtime/phase0-s2-policies.test.ts
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MissionLoader } from "./mission-loader";
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

console.log("S2 — GOVERNANCE carried verbatim from the mission contract");

// Isolated temp missionsDir (defaults kept for projectContext/brain paths).
const dir = path.join(os.tmpdir(), "odg-s2-policies-fixtures");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

// Governance payloads shared by the snake_case and camelCase fixtures (all-string arrays,
// so a verbatim transport is a byte-for-byte identity — nothing to filter out).
const POLICIES = ["LOCAL_FIRST", "CLEAN_TREE_REQUIRED"];
const PERMISSIONS = { read: ["src/**"], write: ["src/runtime/**"], network: false };
const AUTHORIZED = ["src/runtime/mission-loader.ts", "src/runtime/mission-orchestrator.ts"];
const EXECUTION = { mode: "ENGINEERING", requireProof: true, maxAttempts: 3 };

const fixtures: Record<string, unknown> = {
  // snake_case authorized_paths + full governance
  S2_FULL_SNAKE: {
    id: "S2_FULL_SNAKE",
    mode: "IMPLEMENT",
    policies: POLICIES,
    permissions: PERMISSIONS,
    authorized_paths: AUTHORIZED,
    executionPolicy: EXECUTION,
  },
  // camelCase authorizedPaths + full governance
  S2_FULL_CAMEL: {
    id: "S2_FULL_CAMEL",
    mode: "IMPLEMENT",
    policies: POLICIES,
    permissions: PERMISSIONS,
    authorizedPaths: AUTHORIZED,
    executionPolicy: EXECUTION,
  },
  // none of the governance fields present → safe defaults expected
  S2_EMPTY: {
    id: "S2_EMPTY",
    mode: "IMPLEMENT",
  },
};
for (const [id, body] of Object.entries(fixtures)) {
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(body, null, 2), "utf8");
}

const policiesOf = (id: string): any => {
  const loader = new MissionLoader(undefined, undefined, dir);
  return new MissionOrchestrator(loader).buildPlan(id, id).policies;
};

try {
  // 1 — TRANSPORT: a full contract's governance lands in plan.policies with all four fields.
  {
    const p = policiesOf("S2_FULL_SNAKE");
    check(
      p !== undefined &&
        "policies" in p &&
        "permissions" in p &&
        "authorizedPaths" in p &&
        "executionPolicy" in p,
      "full contract governance is transported into plan.policies (all four fields)",
    );
  }

  // 2 — NO TRANSFORMATION: values are conserved verbatim from the contract.
  {
    const p = policiesOf("S2_FULL_SNAKE");
    check(eq(p.policies, POLICIES), "policies conserved verbatim");
    check(eq(p.permissions, PERMISSIONS), "permissions conserved verbatim");
    check(eq(p.authorizedPaths, AUTHORIZED), "authorizedPaths conserved verbatim");
    check(eq(p.executionPolicy, EXECUTION), "executionPolicy conserved verbatim");
  }

  // 3 — BOTH KEYS: authorized_paths (snake) and authorizedPaths (camel) are both honoured
  //     and yield the identical authorizedPaths value.
  {
    const snake = policiesOf("S2_FULL_SNAKE");
    const camel = policiesOf("S2_FULL_CAMEL");
    check(eq(snake.authorizedPaths, AUTHORIZED), "authorized_paths (snake_case) is supported");
    check(eq(camel.authorizedPaths, AUTHORIZED), "authorizedPaths (camelCase) is supported");
    check(eq(snake.authorizedPaths, camel.authorizedPaths), "both key spellings yield the same authorizedPaths");
  }

  // 4 — SAFE DEFAULTS: a mission without the governance fields gets [] / null.
  {
    const p = policiesOf("S2_EMPTY");
    check(eq(p.policies, []), "missing policies → []");
    check(eq(p.authorizedPaths, []), "missing authorized paths → []");
    check(p.permissions === null, "missing permissions → null");
    check(p.executionPolicy === null, "missing executionPolicy → null");
  }

  // 5 — DETERMINISM: identical mission ⇒ identical governance transport.
  {
    check(eq(policiesOf("S2_FULL_SNAKE"), policiesOf("S2_FULL_SNAKE")), "deterministic for identical mission");
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(failures === 0 ? "\nALL PASS — S2 GOVERNANCE PROVEN" : `\n${failures} FAILURE(S) — S2 NOT PROVEN`);
process.exit(failures === 0 ? 0 : 1);
