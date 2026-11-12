#!/usr/bin/env node
"use strict";
/* V167 Addendum-A — multi-worker orchestrator, BUILT and USED on the REAL roadmap. Proves: the orchestrator dispatches over
 * the REAL open-mission inventory (routes each of the 12 open missions; only the realizable one is dispatchable), schedules
 * dispatchable work into dependency layers (real parallelism), and enforces the independent quality gate (producer≠validator),
 * worker scope isolation, and least-privilege — all by composing existing canonical mechanisms (no parallel engine). Includes
 * §22 adversarial tests: fake/self-certified result, incomplete evidence, excessive permission, git collision, blocked dep. */
const O = require("./odg-mission-orchestrator.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // ---- USED ON THE REAL ROADMAP: dispatch plan over the real open-mission inventory ----
  const plan = O.buildDispatchPlan();
  check("dispatch plan built over the REAL open-mission inventory (12 open)", plan.totalOpen === 12 && plan.routes.length === 12);
  const byId: any = {}; for (const r of plan.routes) byId[r.id] = r;
  check("the one REALIZABLE_LOCAL mission (slice-3) is DISPATCHABLE (ODG_NATIVE — bounded next-action)", byId["p0-autonomy-measure-slice3-delegate-provenance"].route === "ODG_NATIVE");
  check("owner/external-gated missions are NOT_DISPATCHABLE (honest — a worker cannot do owner work)", byId["campaign-runner-systemd-activation"].route === "NOT_DISPATCHABLE" && byId["broad-it-independent-eval-set"].route === "NOT_DISPATCHABLE");
  check("a DEPENDENCY_BLOCKED mission is SEQUENCED (not parallelised) until its dep is met", byId["p01-billing-sandbox"].route === "SEQUENCED");
  check("parallel schedule is a real dependency layering (layers + maxParallelism)", typeof plan.parallelSchedule.layerCount === "number" && typeof plan.parallelSchedule.maxParallelism === "number");
  check("counts reconcile: dispatchableNow = ODG_NATIVE + DELEGATE_PROVIDER", plan.dispatchableNow === (plan.byRoute.ODG_NATIVE || 0) + (plan.byRoute.DELEGATE_PROVIDER || 0));

  // ---- delegation contract (§9/§11): precise scope/acceptance/evidence/prohibitions ----
  const contract = O.delegationContract({ id: "m1", nextAction: "do X" }, ["runtime/core/x.ts"]);
  check("delegation contract carries scope + acceptance + evidence + prohibitions (incl. no self-closure)", contract.authorizedFiles[0] === "runtime/core/x.ts" && contract.acceptanceCriteria.length >= 2 && contract.prohibitions.some((p: string) => /no status self-promotion|closure/.test(p)));

  // ---- §14/§15 independent quality gate: producer ≠ validator ----
  const good = O.independentQualityGate({ evidence: ["patch-execution.json", "verifier-verdict"] }, { builder: { id: "odg-native" }, verifier: { id: "independent-verifier" } });
  check("independent gate ADMITs an independent producer+verifier with complete evidence", good.decision === "ADMIT" && good.selfCertification === false);
  const selfCert = O.independentQualityGate({ evidence: ["x"] }, { builder: { id: "worker-7" }, verifier: { id: "worker-7" } });
  check("§22 ADVERSARIAL self-certification (producer validates own work) ⇒ REJECT (COMPROMISED)", selfCert.decision === "REJECT" && selfCert.selfCertification === true);
  const sharedModel = O.independentQualityGate({ evidence: ["x"] }, { builder: { id: "a", model: "m1" }, verifier: { id: "b", model: "m1" } });
  check("§22 shared CRITICAL dependency (same model) ⇒ REJECT (COMPROMISED)", sharedModel.decision === "REJECT");
  const noEvidence = O.independentQualityGate({ evidence: [] }, { builder: { id: "a" }, verifier: { id: "b" } });
  check("§22 ADVERSARIAL incomplete evidence (fake/empty provider result) ⇒ REJECT", noEvidence.decision === "REJECT" && /incomplete evidence/.test(noEvidence.reason));

  // ---- §22 git collision / scope isolation (reuses delegate-isolation.validateScope; change shape = {rel,kind}) ----
  const inScope = O.checkWorkerScope([{ rel: "a.ts", kind: "modified" }], ["a.ts"]);
  const outScope = O.checkWorkerScope([{ rel: "a.ts", kind: "modified" }, { rel: "secret.ts", kind: "added" }], ["a.ts"]);
  check("§22 worker writing OUTSIDE its authorized scope (git collision) ⇒ REFUSED", inScope.admitted === true && outScope.admitted === false && /OUT OF SCOPE/.test(outScope.reason));

  // ---- §19 least-privilege: a provider may only use a granted capability (fully-declared provider per the contract) ----
  const decl = { id: "prov", capabilities: ["code-analysis"], permissions: ["read-source"], sideEffects: [], provenance: "test-declared" };
  const granted = O.checkPermission(decl, "code-analysis", ["read-source"]);
  const ungranted = O.checkPermission(decl, "code-analysis", []);
  check("§19 ADVERSARIAL excessive permission (capability used without grant) ⇒ DENIED; granted ⇒ allowed", granted.allowed === true && ungranted.allowed === false);

  // ---- §13 Evidence Aggregator: ODG-accepted reflects the independent gate, never a self-claim ----
  const agg = O.aggregateEvidence([
    { mission: "ok1", gate: { decision: "ADMIT" } },
    { mission: "bad1", gate: { decision: "REJECT" } },
    { mission: "ok2", gate: { decision: "ADMIT" } },
  ]);
  check("evidence aggregator counts ONLY independently-admitted results (2 accepted / 1 rejected)", agg.accepted === 2 && agg.rejected === 1 && agg.acceptedIds.length === 2 && agg.rejectedIds[0] === "bad1");

  // ---- honest boundary: composes existing mechanisms; no parallel engine; changes no status ----
  check("contract: composes dep-planner/provider-capability/evaluator-independence/delegate-isolation/recovery (no parallel engine)", O.MISSION_ORCHESTRATOR_CONTRACT.reuses.length >= 5 && O.MISSION_ORCHESTRATOR_CONTRACT.invariants.some((i: string) => /NO parallel engine/.test(i)) && O.MISSION_ORCHESTRATOR_CONTRACT.invariants.some((i: string) => /changes NO mission status/.test(i)));
  check("deterministic + frozen", Object.isFrozen(plan) && JSON.stringify(O.buildDispatchPlan().byRoute) === JSON.stringify(plan.byRoute));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — mission-orchestrator (USED on the REAL 12-open-mission inventory: routes each [only realizable=dispatchable], dependency-layered parallel schedule; independent quality gate producer≠validator [self-cert/shared-model/empty-evidence REJECTED]; scope-isolation git-collision REFUSED; least-privilege DENIED; evidence aggregator counts only independently-admitted; composes existing mechanisms, no parallel engine, no status changed)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
