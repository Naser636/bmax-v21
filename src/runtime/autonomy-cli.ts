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

import { RuntimeAutonomy } from "@/core/runtime-autonomy";
import { AUTONOMY_CONTRACT_VERSION } from "@/contracts/runtime-autonomy";
import { AutonomyRuntimeAdapter } from "@/runtime/autonomy-runtime-adapter";

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

  // Terminal outcomes (design §3):
  //   PLAN_COMPLETE → clean success (0)
  //   BLOCKED       → Release Manager NO_RELEASE, human decision required (2)
  //   any other halt→ operational failure (1)
  if (result.status === "PLAN_COMPLETE") return 0;
  if (result.status === "BLOCKED") return 2;
  return 1;
}

process.exit(main());
