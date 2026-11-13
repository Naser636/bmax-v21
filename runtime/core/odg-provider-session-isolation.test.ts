#!/usr/bin/env node
"use strict";
/* V190 — provider-session isolation launch spec + handoff. Proves: confinement DEMONSTRATED (real probe evidence);
 * spec mounts no canonical repo/.git, no net; does NOT claim the current session is isolated (activation OWNER_GATED);
 * DIFF import ODG-only (accept ⊆ write-set & ∉ protected); reuses existing primitives. */
const I = require("./odg-provider-session-isolation.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // real probe evidence
  check("confinement DEMONSTRATED by real probe: canonical NOT visible + write BLOCKED + home NOT visible", I.PROBE_EVIDENCE.canonicalRepoVisible === "NO" && I.PROBE_EVIDENCE.canonicalWrite === "BLOCKED" && I.PROBE_EVIDENCE.homeVisible === "NO" && I.PROBE_EVIDENCE.verdict === "CONFINEMENT_DEMONSTRATED");
  check("probe changed neither the session nor the security config", I.PROBE_EVIDENCE.changedThisSessionOrSecurityConfig === false);

  // launch spec
  const s = I.launchSpec({ workCopyDir: "/tmp/wc", providerCmd: ["claude"] });
  check("spec uses bwrap --unshare-all (no network) + die-with-parent", s.argv[0] === "bwrap" && s.argv.includes("--unshare-all") && s.argv.includes("--die-with-parent") && s.noNetwork === true);
  check("spec binds the work copy rw at /work, chdir /work", s.argv.includes("--bind") && s.argv.includes("/tmp/wc") && s.argv.includes("/work") && s.argv.includes("--chdir"));
  check("spec mounts NO canonical repo and NO canonical .git", s.noCanonicalMount === true && s.noCanonicalGit === true && !s.argv.includes("/home/ubuntu/bmax-v21") && /NEVER mounted/.test(s.note));
  check("spec binds only ro system code dirs", s.argv.includes("--ro-bind") && s.argv.includes("/usr"));

  // honesty: current session NOT isolated; activation owner-gated
  const h = I.handoff();
  check("handoff activation is OWNER_GATED (owner launches; Claude Code cannot relaunch itself)", /OWNER_GATED/.test(h.activation) && /cannot relaunch itself/.test(h.activation) && /must not modify the harness/.test(h.activation));
  check("exact launch command provided + prerequisites + pre/post checks + proofs", /bwrap --unshare-all/.test(h.exactCommand) && h.prerequisites.length >= 2 && h.preLaunch.length >= 3 && h.postLaunch.length >= 4 && h.proofs.verdict === "CONFINEMENT_DEMONSTRATED");
  check("post-launch checks assert canonical NOT visible + write fails + no net", h.postLaunch.some((p: any) => /canonical repo NOT visible/.test(p.expect)) && h.postLaunch.some((p: any) => /no net/.test(p.expect)));

  // DIFF import gate — ODG only
  check("import ACCEPT when changed ⊆ write-set and non-protected", I.importGate(["runtime/core/x.ts"], ["runtime/core/x.ts"]).decision === "ACCEPT_IMPORT");
  check("import REJECT when a changed path is out of write-set", I.importGate(["runtime/core/other.ts"], ["runtime/core/x.ts"]).decision === "REJECT_IMPORT" && I.importGate(["runtime/core/other.ts"], ["runtime/core/x.ts"]).outOfWriteSet.includes("runtime/core/other.ts"));
  check("import REJECT when a changed path is ALWAYS_PROTECTED", I.importGate(["runtime/governance/ROADMAP.json"], ["runtime/governance/ROADMAP.json"]).decision === "REJECT_IMPORT");
  check("import is ODG-only (provider never imports)", I.importGate(["runtime/core/x.ts"], ["runtime/core/x.ts"]).importedBy === "ODG");

  // contract + determinism
  check("contract: confinement demonstrated, current session NOT isolated, DIFF import ODG-only, no 2nd mechanism", I.PROVIDER_SESSION_ISOLATION_CONTRACT.invariants.some((i: string) => /DEMONSTRATED by a real subprocess probe/.test(i)) && I.PROVIDER_SESSION_ISOLATION_CONTRACT.invariants.some((i: string) => /does NOT isolate the CURRENT session/.test(i)) && I.PROVIDER_SESSION_ISOLATION_CONTRACT.invariants.some((i: string) => /DIFF import is ODG-only/.test(i)));
  check("deterministic + frozen", JSON.stringify(I.launchSpec({ workCopyDir: "/tmp/wc", providerCmd: ["claude"] }).argv) === JSON.stringify(s.argv) && Object.isFrozen(s) && Object.isFrozen(I.PROBE_EVIDENCE));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — provider-session-isolation (V190: confinement DEMONSTRATED by real bwrap probe [canonical NOT visible/writable, no net]; reproducible launch spec mounts no canonical repo/.git; current session NOT claimed isolated — activation OWNER_GATED; DIFF import ODG-only [⊆write-set & ∉protected]; reuses existing primitives)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
