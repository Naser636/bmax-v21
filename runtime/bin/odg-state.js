#!/usr/bin/env node
/**
 * odg state — Runtime State Builder.
 *
 * The single WRITER that materialises the coherent Runtime model (runtime/core/runtime-model.js)
 * into the artefacts the Dashboard, `odg status` and the autonomy readers consume. Before this
 * command existed nothing produced runtime-state.json (→ Pipeline/Brain UNKNOWN) or
 * runtime-mission-queue.json (→ Next Mission stuck on SYSTEM_READY), and capability-registry.json
 * carried an incoherent per-mission view.
 *
 * It writes ONLY derived state from artefacts that already exist; it never invents runtime data and
 * never runs a mission. Running it is idempotent: the same repo state yields the same output (the
 * only non-deterministic field is `generatedAt`, isolated here — the model itself is timestamp-free).
 *
 * Consumed by:
 *   - runtime/bin/odg-health.js   (reads runtime-state.json / capability-registry.json / queue)
 *   - runtime/bin/odg-status.js   (reads runtime-status.json / capability-registry.json / queue)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { computeRuntimeModel } = require("../core/runtime-model");

const ROOT = path.resolve(__dirname, "..", "..");
const GEN = path.join(ROOT, "runtime", "generated");

function write(name, value) {
  fs.mkdirSync(GEN, { recursive: true });
  fs.writeFileSync(path.join(GEN, name), JSON.stringify(value, null, 2));
}

function main() {
  const model = computeRuntimeModel(ROOT);
  const generatedAt = new Date().toISOString();

  // Headline runtime state (the artefact the Dashboard reads for Pipeline / Brain).
  write("runtime-state.json", {
    generatedAt,
    status: model.status,
    runtime: model.runtime,
    converged: model.converged,
    foundation: model.foundation,
    pipeline: model.pipeline,
    brain: model.brain,
    lastMission: model.lastMission,
    nextMission: model.nextMission,
    outstanding: model.outstanding,
  });

  // Legacy status artefact — now carries a REAL nextMission instead of a hard-coded SYSTEM_READY.
  write("runtime-status.json", {
    runtime: model.runtime,
    foundation: model.foundation,
    nextMission: model.nextMission,
  });

  // The mission queue: ONLY executable (contract + objectives) and not-yet-proven missions.
  write("runtime-mission-queue.json", {
    generatedAt,
    queue: model.queue,
  });

  // Coherent GLOBAL capability registry (proven missions vs executable forward work).
  write("capability-registry.json", {
    generatedAt,
    status: model.runtime,
    capabilities: model.capabilities,
    missingCapabilities: model.missingCapabilities,
  });

  // Full contract scan (audit): incomplete / broken / orphan contracts, never proposed as runnable.
  write("mission-scan.json", { generatedAt, ...model.scan });

  // Human-readable evidence of the contract scan — the "preuve" for every SKIPPED / NEEDS_CONTRACT
  // disposition (a contract that cannot be auto-completed is documented, not silently dropped).
  const R = [];
  R.push("# Runtime Contract Scan Report");
  R.push("");
  R.push(`- Generated: ${generatedAt}`);
  R.push(`- Missions on disk: ${model.scan.totalMissions}`);
  R.push(`- Executable contracts: ${model.scan.executable}`);
  R.push(`- Proven capabilities: ${model.scan.proven}`);
  R.push(`- Executable & not yet proven (queue): ${model.queue.length}`);
  R.push("");
  R.push(`- Outstanding gaps (queue empty but work remains): ${model.outstanding.length}`);
  R.push(`- Converged: ${model.converged ? "YES" : "NO"}`);
  R.push("");
  R.push("## Executable mission queue (deterministic order)");
  if (model.queue.length === 0) {
    R.push(model.converged ? "- (none — converged)" : "- (none runnable — see outstanding gaps below)");
  }
  for (const q of model.queue) {
    R.push(`- **${q.mission}** — ${q.goal ?? ""}${q.requiresEngineering ? "  _(requires provider)_" : ""}`);
  }
  R.push("");
  R.push("## Outstanding gaps (work remaining, not yet runnable)");
  if (model.outstanding.length === 0) R.push("- (none)");
  for (const o of model.outstanding) {
    R.push(`- **${o.mission}** — ${o.reason}${o.repairNominated ? "  _(repair nominated)_" : ""}`);
  }
  R.push("");
  R.push("## Incomplete / non-executable contracts");
  if (model.scan.incompleteContracts.length === 0) R.push("- (none)");
  for (const c of model.scan.incompleteContracts) {
    R.push(`- **${c.mission}** → \`${c.disposition}\` — ${c.reason}${c.proven ? " _(already proven)_" : ""}`);
  }
  if (model.scan.brokenContracts.length > 0) {
    R.push("");
    R.push("## Broken contracts (invalid JSON)");
    for (const b of model.scan.brokenContracts) R.push(`- **${b.mission}** — ${b.reason}`);
  }
  R.push("");
  const reportsDir = path.join(GEN, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, "contract-scan-report.md"), R.join("\n"));

  const banner = [
    "======================================",
    "ODG RUNTIME STATE BUILDER",
    "======================================",
    `Runtime      : ${model.runtime}`,
    `Pipeline     : ${model.pipeline}`,
    `Brain        : ${model.brain}`,
    `Capabilities : ${model.capabilities.length} proven`,
    `Queue        : ${model.queue.length} executable / ${model.scan.incompleteContracts.length} incomplete`,
    `Outstanding  : ${model.outstanding.length} gap(s)  (converged: ${model.converged ? "YES" : "NO"})`,
    `Next Mission : ${model.nextMission}`,
    "======================================",
  ];
  console.log(banner.join("\n"));
}

main();
