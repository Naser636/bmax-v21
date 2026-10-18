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
const { buildAutonomyRate } = require("../core/autonomy-rate");
const { attributeObjectives } = require("../core/objective-attribution");

const ROOT = process.cwd(); // repo root (wrapper cwd) — robust from any dist depth (was __dirname → wrong under dist/bin)
const GEN = path.join(ROOT, "runtime", "generated");

function write(name: any, value: any): void {
  fs.mkdirSync(GEN, { recursive: true });
  fs.writeFileSync(path.join(GEN, name), JSON.stringify(value, null, 2));
}

// Fail-closed read of an already-produced generated artifact: a missing or malformed file is read as
// null (never a throw, never invented data) so the autonomy signal degrades honestly to not-measurable.
function readGen(name: any): any {
  try {
    return JSON.parse(fs.readFileSync(path.join(GEN, name), "utf8"));
  } catch {
    return null;
  }
}

function main(): void {
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
    lastRun: model.lastRun,
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

  // Governed autonomy signal (S1): an HONEST per-run ODG/provider/human attribution with an explicit
  // denominator, derived by REUSING the pure runtime/core/autonomy-measure.js over the already-produced
  // per-run artifacts. This writer invents nothing: absent/ambiguous inputs ⇒ measurable:false and a
  // null percentage (never a fabricated number), and provider/human work is never credited to ODG.
  const peName = "patch-execution.json";
  const mpName = "mission-plan.json";
  const oaName = "objective-attribution.json";
  const ppName = "patch-plan.json";
  const patchExecution = readGen(peName);
  const missionPlan = readGen(mpName);
  const patchPlan = readGen(ppName);

  // PERSIST objective-attribution.json (closes the autonomy chain). The objective-attribution.js
  // analyzer is a READ-ONLY core that writes nothing; this governed single writer REUSES its pure
  // attributeObjectives() over the already-produced per-run artifacts and persists the result so the
  // autonomy signal has a real verified-source. It fabricates nothing: a unit is `verified` only when
  // the analyzer returns verdict EVIDENCED (evidence present + non-empty); absent patch-plan/execution
  // ⇒ nothing persisted ⇒ attribution null ⇒ autonomy degrades honestly to numerator 0. The injected
  // evidenceProbe + probeCtx MIRROR the analyzer's own CLI exactly, so the persisted artifact equals
  // what `node runtime/core/objective-attribution.js` would print — no new logic, no gate touched.
  let attribution = null;
  if (patchPlan && patchExecution) {
    const evidenceProbe = (p: any) => {
      try { return typeof p === "string" && p.length > 0 && fs.statSync(p).size > 0; } catch { return false; }
    };
    const verify = readGen("runtime-verify.json");
    const probeCtx = { missionId: (missionPlan && missionPlan.mission) || (patchPlan && patchPlan.mission), verify };
    attribution = attributeObjectives(missionPlan, patchPlan, patchExecution, evidenceProbe, undefined, undefined, probeCtx);
    write(oaName, { generatedAt, ...attribution });
  }

  const autonomyRate = buildAutonomyRate({
    patchExecution,
    planObjectives: missionPlan && Array.isArray(missionPlan.objectives) ? missionPlan.objectives : null,
    attribution,
    sourceArtifacts: [
      { path: `runtime/generated/${peName}`, present: patchExecution != null },
      { path: `runtime/generated/${mpName}`, present: missionPlan != null },
      { path: `runtime/generated/${oaName}`, present: attribution != null },
    ],
  });
  write("autonomy-rate.json", { generatedAt, ...autonomyRate });

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
    `Autonomy     : ${autonomyRate.measure.measurable
      ? `${autonomyRate.measure.autonomyPercent}% (ODG verified ${autonomyRate.measure.numerator}/${autonomyRate.measure.denominator})`
      : `not measurable — ${autonomyRate.measure.reason}`}`,
    "======================================",
  ];
  console.log(banner.join("\n"));
}

main();

export {};
