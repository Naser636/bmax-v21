#!/usr/bin/env node
"use strict";
/* V287 Lot 1 — E2E proof that ODG SELECTS a mission, DISCOVERS an existing capability, ROUTES, AUTHORIZES and actually
 * USES it (real executor run → evidence artifact), over the EXISTING canonical components (no 2nd engine). Uses the
 * observational "Decision Precedent Consultation" executor (read-only; MISS is a valid outcome) so the run is
 * deterministic + side-effect-contained; evidence is written into an ISOLATED temp cwd (runtime/generated there, not
 * the real repo). Also proves the SAFE REFUSAL path (unmatched objective ⇒ nothing executed) and that external AI is
 * only the last resort. Real components throughout; the only mock is the isolated cwd for evidence. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("./odg-capability-reuse-path.js");
let f = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) f++; }

// Controlled fixtures.
const missions = [
  { id: "M-LOW", deps: [], strategicImportance: 0.2 },
  { id: "M-REUSE", deps: [], strategicImportance: 0.95, immediatelyExecutable: true },  // highest ⇒ ODG selects this
];
const registerItems = [
  { id: "cap-precedent", program: "P1", status: "ACCEPTED", evidence: "runtime/generated/precedent-consultation.json", deps: [] },
  { id: "cap-other", program: "P2", status: "ACCEPTED" },   // no evidence ⇒ excluded (not a real capability)
];
const baseInput = {
  missions, acceptedIds: [], registerItems, manifestMissions: [],
  capabilityId: "cap-precedent",
  objectiveId: "PRECEDENT_CONSULT_E2E",   // matches the Decision Precedent Consultation executor
  goal: "zzz-no-rule-match-nonsense-goal",
  localModelAvailable: false,
};

function inCwd(dir: string, fn: () => void) { const prev = process.cwd(); try { process.chdir(dir); fn(); } finally { process.chdir(prev); } }

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-e2e-"));
  let r: any;
  inCwd(tmp, () => { r = P.demonstrateCapabilityReusePath(baseInput); });

  // 1. SELECT — ODG picked the highest-priority mission itself.
  check("ODG SELECTED the mission via its own selector (highest priority, not hand-picked)", r.ok && r.selection.selectedMissionId === "M-REUSE" && /ODG selected 'M-REUSE'/.test(r.selection.justification));
  // 2. DISCOVER — the capability map found the real (ACCEPTED+evidence) capability with honest maturity.
  check("ODG DISCOVERED the existing capability in its own map (L2_INTEGRATED, ACCEPTED+evidence)", r.discovery.found === true && r.discovery.maturity === "L2_INTEGRATED");
  // 3. ROUTE — external AI is the flagged last resort; with no local model + no rule match it is chosen last.
  check("ROUTE: external AI present only as the flagged LAST RESORT", r.route.externalIsLastResort === true);
  // 4. AUTHORIZE — the matched capability is registered + governed (observational).
  check("AUTHORIZATION: resolved capability is registered+governed (observational effect)", r.authorization && r.authorization.ok === true && r.authorization.effect === "observational");
  // 5+6. USE + EVIDENCE — a REAL executor ran and produced a verifiable evidence artifact for THIS objective.
  check("ODG USED the capability: real executor ran (Decision Precedent Consultation)", r.resolverCapability === "Decision Precedent Consultation" && r.execSummary && r.execSummary.capability === "Decision Precedent Consultation");
  check("verdict CAPABILITY_USED_EVIDENCED + evidence artifact verified for the objective (USE, not name-only)", r.verdict === "CAPABILITY_USED_EVIDENCED" && r.used === true && r.evidenceVerified === true);
  check("evidence artifact physically exists in the isolated workspace", (() => { try { const ev = JSON.parse(fs.readFileSync(path.join(tmp, r.evidencePath), "utf8")); return ev.objective === "PRECEDENT_CONSULT_E2E"; } catch { return false; } })());

  // ROUTE prefers LOCAL when a local model is available (external never preferred over local).
  let rLocal: any; inCwd(tmp, () => { rLocal = P.demonstrateCapabilityReusePath({ ...baseInput, localModelAvailable: true }); });
  check("ROUTE prefers a LOCAL tier when a local model is available (external not chosen)", rLocal.route.chosenSource === "LOCAL" && rLocal.route.usesExternalAI === false);

  // SAFE REFUSAL — an unmatched objective resolves to no capability ⇒ nothing executed.
  let rRefuse: any; inCwd(tmp, () => { rRefuse = P.demonstrateCapabilityReusePath({ ...baseInput, objectiveId: "UNKNOWN_OBJECTIVE_E2E" }); });
  check("SAFE REFUSAL: unmatched objective ⇒ REFUSED_NO_CAPABILITY, used=false, nothing executed", rRefuse.verdict === "REFUSED_NO_CAPABILITY" && rRefuse.used === false && rRefuse.resolverCapability === null && rRefuse.execSummary === null);

  // DISCOVERY absence surfaced honestly (a non-real capability id).
  let rAbsent: any; inCwd(tmp, () => { rAbsent = P.demonstrateCapabilityReusePath({ ...baseInput, capabilityId: "cap-other" }); });
  check("DISCOVERY: a capability without evidence is NOT found (honest absence, not fabricated)", rAbsent.discovery.found === false && /not an ACCEPTED/.test(rAbsent.discovery.absentReason));

  // No eligible mission ⇒ fail-closed.
  check("no eligible mission ⇒ NO_ELIGIBLE_MISSION (fail-closed)", P.demonstrateCapabilityReusePath({ missions: [], objectiveId: "PRECEDENT_CONSULT_E2E" }).verdict === "NO_ELIGIBLE_MISSION");

  // Determinism on the refusal path (no execution ⇒ no volatile evidence timestamp) + freeze + contract.
  let rRefuse2: any; inCwd(tmp, () => { rRefuse2 = P.demonstrateCapabilityReusePath({ ...baseInput, objectiveId: "UNKNOWN_OBJECTIVE_E2E" }); });
  check("deterministic on the refusal path (byte-identical trace)", JSON.stringify(rRefuse) === JSON.stringify(rRefuse2));
  check("result frozen", Object.isFrozen(r) && Object.isFrozen(rRefuse));
  check("contract: composition-only (no 2nd registry/router), USED≠named, deny-by-default, external-last-resort, provider-authored", P.CAPABILITY_REUSE_PATH_CONTRACT.invariants.some((x: string) => /no 2nd capability-map\/router/.test(x)) && P.CAPABILITY_REUSE_PATH_CONTRACT.invariants.some((x: string) => /name-only ≠ used/.test(x)) && P.CAPABILITY_REUSE_PATH_CONTRACT.invariants.some((x: string) => /deny-by-default/.test(x)) && P.CAPABILITY_REUSE_PATH_CONTRACT.invariants.some((x: string) => /authored by Claude Code/.test(x)));

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.stdout.write("\n" + (f === 0 ? "ALL PASS — odg-capability-reuse-path (V287 Lot 1 E2E: ODG selects mission → discovers existing capability [L2] → routes [external last-resort, local preferred] → authorizes [deny-by-default] → USES it [real Decision Precedent Consultation executor → verified evidence artifact, not name-only] → safe refusal on unmatched/unauthorized/absent; composes EXISTING canonical components, no 2nd engine; evidence isolated to temp cwd)" : f + " FAIL") + "\n");
  process.exit(f === 0 ? 0 : 1);
}
main();
export {};
