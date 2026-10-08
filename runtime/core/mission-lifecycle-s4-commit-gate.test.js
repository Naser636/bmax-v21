#!/usr/bin/env node
"use strict";

/*
 * S4 (review N4 remediation) — mission-lifecycle reconciles RELEASED with the real HUMAN commit state.
 * An engineering mission (authorized_paths) whose in-scope deliverable is APPLIED but NOT committed must
 * cap at VERIFIED (release PENDING the human commit gate — ODG never auto-commits), NOT RELEASED. Once the
 * deliverable is COMMITTED, the SAME evidence legitimately reaches RELEASED. Proven end-to-end against the
 * REAL computeLifecycle in a throwaway git sandbox — both directions, so the gate neither under- nor
 * over-caps.
 *
 * Run: node runtime/core/mission-lifecycle-s4-commit-gate.test.js
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const M = "S4_PROBE";
let failures = 0;
function check(c, n) { if (c) console.log("  ok -", n); else { failures++; console.log("  FAIL -", n); } }
function wj(p, o) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
function cp(sb, rel) { const d = path.join(sb, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(REPO, rel), d); }
function git(sb, args) { execFileSync("git", args, { cwd: sb, stdio: "ignore" }); }

const sb = fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-s4-"));
const cwd0 = process.cwd();
try {
  cp(sb, "runtime/governance/state-machine.json");
  cp(sb, "runtime/constitution/runtime-constitution.json");
  cp(sb, "runtime/policies/runtime-policies.json");
  // Engineering contract: declares authorized_paths (⇒ the commit gate applies).
  wj(path.join(sb, `runtime/missions/${M}.json`), { mission: M, authorized_paths: ["src/app"], objectives: [{ id: "o1", done_when: "probe" }] });
  const G = (f) => path.join(sb, "runtime/generated", f);
  wj(G("mission-plan.json"), { mission: M, objectives: [{ id: "o1" }] });
  wj(G("decision.json"), { decision: "PROCEED" });
  wj(G("patch-plan.json"), { status: "READY", patches: [{ objectiveId: "o1" }] });
  wj(G("patch-execution.json"), { executed: [{ objectiveId: "o1", status: "APPLIED", files: [{ target: "src/app/x.ts", mode: "content" }] }] });
  wj(G("mission-report.json"), { mission: M, validated: true, status: "PROVEN" });

  // Real git repo with a seed commit, then an UNCOMMITTED in-scope deliverable.
  git(sb, ["init", "-q"]); git(sb, ["config", "user.email", "t@t.t"]); git(sb, ["config", "user.name", "t"]);
  fs.writeFileSync(path.join(sb, "README.md"), "seed\n");
  git(sb, ["add", "-A"]); git(sb, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "seed"]);
  fs.mkdirSync(path.join(sb, "src/app"), { recursive: true });
  fs.writeFileSync(path.join(sb, "src/app/x.ts"), "export const x = 1;\n"); // in-scope, UNCOMMITTED

  process.chdir(sb);
  const LC = require("./mission-lifecycle");

  // Case 1 — applied but UNCOMMITTED in-scope deliverable ⇒ VERIFIED, not RELEASED.
  const pending = LC.computeLifecycle(M);
  check(pending.achieved === "VERIFIED", "uncommitted in-scope deliverable ⇒ achieved=VERIFIED (not RELEASED)  got=" + pending.achieved);
  check(pending.achieved !== "RELEASED", "RELEASED is NOT claimed for an uncommitted engineering deliverable");

  // Case 2 — COMMIT the same deliverable ⇒ SAME evidence now legitimately reaches RELEASED (no over-cap).
  git(sb, ["add", "-A"]); git(sb, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "deliverable"]);
  const released = LC.computeLifecycle(M);
  check(released.achieved === "RELEASED", "committed in-scope deliverable ⇒ achieved=RELEASED  got=" + released.achieved);
} finally {
  process.chdir(cwd0);
  fs.rmSync(sb, { recursive: true, force: true });
}
console.log(failures === 0 ? "ALL PASS — S4 COMMIT-GATE RECONCILIATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
