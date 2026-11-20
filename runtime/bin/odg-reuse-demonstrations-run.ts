#!/usr/bin/env node
"use strict";
/*
 * V327 §7/§9 — REUSE DEMONSTRATIONS RUN (runtime entry). Makes the two reuse/learning DEMONSTRATORS REACHABLE on demand —
 * their real "consumer" is a run invocation (they are reproducible proofs, not library helpers), so a bin is the honest
 * way to consume them (same pattern as odg-intelligent-native-run #789 / odg-hypothesis-mission-run #793). It runs:
 *   - learning-reuse-proof.runExperiment  — the full RECORDED→RETRIEVED→REUSED→EFFECTIVE lifecycle + controls
 *     (out-of-domain / stale / tampered), with a file-backed store so persistence survives process termination;
 *   - odg-capability-reuse-path.demonstrateCapabilityReusePath — ODG SELECTS→DISCOVERS→ROUTES→USES an existing capability
 *     end-to-end (read-only composition).
 * Pure composition of EXISTING modules; it builds nothing new, lowers no gate. Local only; writes only to the OS temp dir.
 *
 * Usage: npx tsx runtime/bin/odg-reuse-demonstrations-run.ts
 */
const path = require("path");
const os = require("os");
const ROOT = path.join(__dirname, "..", "..");
const LRP = require(path.join(ROOT, "runtime", "core", "learning-reuse-proof.js"));
const CRP = require(path.join(ROOT, "runtime", "core", "odg-capability-reuse-path.js"));

function run(): void {
  const out: any = { ran: "reuse-demonstrations" };

  // (1) learning-reuse-proof — file-backed so the RECORDED→…→EFFECTIVE chain is cross-process durable (temp dir only).
  try {
    const storePath = path.join(os.tmpdir(), `odg-learning-reuse-store-${process.pid}.json`);
    const exp = LRP.runExperiment({ storePath });
    out.learningReuseProof = { ok: exp.ok === true, verdict: exp.proof ? exp.proof.verdict : null, store: storePath };
  } catch (e: any) { out.learningReuseProof = { ok: false, error: String((e && e.message) || e) }; }

  // (2) odg-capability-reuse-path — end-to-end "ODG SELECTS→DISCOVERS→ROUTES→AUTHORIZES→USES an existing capability".
  // It writes an evidence artifact relative to cwd, so run it inside a throwaway temp dir (no repo pollution).
  try {
    const fs = require("fs");
    const input = {
      missions: [{ id: "M-LOW", deps: [], strategicImportance: 0.2 }, { id: "M-REUSE", deps: [], strategicImportance: 0.95, immediatelyExecutable: true }],
      acceptedIds: [], manifestMissions: [],
      registerItems: [{ id: "cap-precedent", program: "P1", status: "ACCEPTED", evidence: "runtime/generated/precedent-consultation.json", deps: [] }],
      capabilityId: "cap-precedent", objectiveId: "PRECEDENT_CONSULT_E2E", goal: "zzz-no-rule-match-nonsense-goal", localModelAvailable: false,
    };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "odg-reuse-demo-"));
    const prev = process.cwd();
    let demo: any;
    try { process.chdir(tmp); fs.mkdirSync(path.join(tmp, "runtime", "generated"), { recursive: true }); demo = CRP.demonstrateCapabilityReusePath(input); } finally { process.chdir(prev); }
    out.capabilityReusePath = { ok: !!(demo && demo.ok && demo.selection && demo.selection.selectedMissionId === "M-REUSE"), verdict: demo ? demo.verdict : null, selected: demo && demo.selection ? demo.selection.selectedMissionId : null, used: demo ? demo.used === true : null };
  } catch (e: any) { out.capabilityReusePath = { ok: false, error: String((e && e.message) || e) }; }

  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
  const bothOk = out.learningReuseProof.ok === true && out.capabilityReusePath.ok === true;
  process.stdout.write(bothOk ? "\nOK — both reuse demonstrations ran (learning lifecycle proven + capability-reuse-path traced)\n" : "\nPARTIAL — see per-demonstration status above\n");
}

run();
export {};
