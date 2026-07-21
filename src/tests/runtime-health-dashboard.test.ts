import { RuntimeHealthDashboard } from "@/core/runtime-health-dashboard";
import {
  RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION,
  type RuntimeHealthInputs,
} from "@/contracts/runtime-health-dashboard";

const cap = new RuntimeHealthDashboard();

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS  ${label}`);
  else { failures++; console.error(`  FAIL  ${label}`); }
}

const d = cap.describe();
check(d.class === "capability" && d.owner === "Governance", "describe: capability owned by Governance");
check(cap.initialize().ready === true, "initialize ready");

const base = (components: RuntimeHealthInputs["components"]): RuntimeHealthInputs => ({
  runtimeHealthDashboardContractVersion: RUNTIME_HEALTH_DASHBOARD_CONTRACT_VERSION,
  components,
});

// the five industrialization components, all ready → HEALTHY
const allReady = base([
  { name: "Evidence Pack", ready: true },
  { name: "Constitution Compliance", ready: true },
  { name: "AI Evidence Guard", ready: true },
  { name: "Knowledge Promotion Gate", ready: true },
  { name: "Runtime Health Dashboard", ready: true },
]);
const rHealthy = cap.build(allReady);
check(rHealthy.ok === true && rHealthy.snapshot.overall === "HEALTHY" && rHealthy.snapshot.ready === 5 && rHealthy.snapshot.degraded.length === 0, "HEALTHY: all five components ready");

// one not ready → DEGRADED, degraded list names it
const rDeg = cap.build(base([
  { name: "Evidence Pack", ready: true },
  { name: "AI Evidence Guard", ready: false, detail: "adapter not wired" },
]));
check(rDeg.ok === true && rDeg.snapshot.overall === "DEGRADED" && rDeg.snapshot.degraded.includes("AI Evidence Guard"), "DEGRADED: a not-ready component degrades the runtime and is listed");

// none ready → DOWN
const rDown = cap.build(base([{ name: "Evidence Pack", ready: false }]));
check(rDown.ok === true && rDown.snapshot.overall === "DOWN", "DOWN: no component ready");

// empty → DOWN
const rEmpty = cap.build(base([]));
check(rEmpty.ok === true && rEmpty.snapshot.overall === "DOWN" && rEmpty.snapshot.total === 0, "DOWN: no components supplied");

// deterministic stable ordering by name
const rOrder = cap.build(base([
  { name: "Zeta", ready: true },
  { name: "Alpha", ready: true },
]));
check(rOrder.ok === true && rOrder.snapshot.components[0].name === "Alpha" && rOrder.snapshot.components[1].name === "Zeta", "order: components sorted by name for a stable render");

// determinism
const a = cap.build(allReady);
const b = cap.build(allReady);
check(a.ok && b.ok && JSON.stringify(a.snapshot) === JSON.stringify(b.snapshot), "determinism: identical inputs produce identical snapshot");

// duplicate names rejected / version
const rDup = cap.build(base([{ name: "X", ready: true }, { name: "X", ready: false }]));
check(rDup.ok === false && rDup.error.code === "INPUTS_MALFORMED", "malformed: duplicate component names rejected");
const rVer = cap.build({ ...allReady, runtimeHealthDashboardContractVersion: "5.0.0" });
check(rVer.ok === false && rVer.error.code === "RUNTIME_HEALTH_DASHBOARD_CONTRACT_INCOMPATIBLE", "version: major mismatch rejected");

if (failures > 0) { console.error(`\nRuntime Health Dashboard: ${failures} check(s) FAILED`); process.exit(1); }
console.log("\nRuntime Health Dashboard OK");
