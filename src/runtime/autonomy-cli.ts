/*
 * Runtime Autonomy — CLI entrypoint (`odg autonomy`)
 *
 * The single new command required by the mission. It is pure wiring: it composes the EXISTING
 * autonomous Mission Selector + Autonomy Cycle Controller (src/core/runtime-autonomy.ts) with the
 * EXISTING Runtime adapter (src/runtime/autonomy-runtime-adapter.ts) and prints the outcome.
 *
 * It adds no logic of its own:
 *   - the next mission is chosen by the existing selector from the Master Plan + Mission Ledger,
 *   - the existing pipeline (runtime/bin/odg-run.js) is launched UNCHANGED via the adapter,
 *   - the loop (select → contract → pipeline → evidence → Release Manager → archive → advance) is
 *     the core's own loop; it runs until the Master Plan is exhausted (PLAN_COMPLETE) or a blocking
 *     gate halts it (BLOCKED / etc.).
 *
 * No foundation, no Constitution, no pipeline business logic is touched here.
 */

import fs from "node:fs";

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import { AUTONOMY_CONTRACT_VERSION } from "@/contracts/runtime-autonomy";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";

const CHECKPOINT = "runtime/generated/autonomy-checkpoint.json";

/** Read the resume checkpoint left by a prior (possibly interrupted) run, if any. */
function readCheckpoint(): { lastReleased?: string; resumeAfter?: string } | null {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT, "utf8"));
  } catch {
    return null;
  }
}

function main(): number {
  const autonomy = new RuntimeAutonomy();
  const ports = new AutonomyRuntimeAdapter();

  autonomy.initialize();
  const desc = autonomy.describe();

  console.log("======================================");
  console.log("ODG RUNTIME AUTONOMY");
  console.log("======================================");
  console.log("Capability :", `${desc.name} (${desc.class})`);
  console.log("Owner      :", desc.owner);
  console.log("Contract   :", desc.autonomyContractVersion);
  // Resume context: proven missions are excluded from re-selection by the ledger, so the loop
  // continues EXACTLY where a prior interrupted run stopped. Surface where that was.
  const prior = readCheckpoint();
  if (prior && prior.resumeAfter) {
    console.log("Resume     :", `after ${prior.resumeAfter} (previous session checkpoint)`);
  }
  console.log("--------------------------------------");

  // The Autonomy Cycle Controller loops internally until PLAN_COMPLETE or a halt (design §3).
  const result = autonomy.run(
    { autonomyContractVersion: AUTONOMY_CONTRACT_VERSION },
    ports,
  );

  console.log("--------------------------------------");
  console.log("Status     :", result.status);
  console.log("Cycles     :", result.cycles);
  console.log(
    "Released   :",
    result.completed.length > 0
      ? result.completed.map((c) => c.mission).join(", ")
      : "(none)",
  );
  if (result.halt) {
    console.log("Halt on    :", result.halt.mission ?? "(plan)");
    console.log("Reason     :", result.halt.reason);
    console.log("Detail     :", result.halt.message);
  }
  console.log("======================================");

  // Write a terminal checkpoint so a follow-up run (or a human) sees exactly where this run ended —
  // the status, cycle count, what released, and any halt. Best-effort; never fails the run.
  try {
    fs.mkdirSync("runtime/generated", { recursive: true });
    fs.writeFileSync(
      CHECKPOINT,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          status: result.status,
          cycles: result.cycles,
          releasedThisSession: result.completed.map((c) => c.mission),
          lastReleased: result.completed.at(-1)?.mission ?? prior?.lastReleased ?? null,
          resumeAfter: result.completed.at(-1)?.mission ?? prior?.resumeAfter ?? null,
          haltOn: result.halt?.mission ?? null,
          haltReason: result.halt?.reason ?? null,
        },
        null,
        2,
      ),
    );
  } catch {
    /* best-effort */
  }

  // Terminal outcomes (design §3):
  //   PLAN_COMPLETE → clean success (0)
  //   BLOCKED       → Release Manager NO_RELEASE, human decision required (2)
  //   any other halt→ operational failure (1)
  if (result.status === "PLAN_COMPLETE") return 0;
  if (result.status === "BLOCKED") return 2;
  return 1;
}

process.exit(main());
