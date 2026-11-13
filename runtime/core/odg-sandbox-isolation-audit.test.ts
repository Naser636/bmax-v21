#!/usr/bin/env node
"use strict";
/* V189 — sandbox-isolation audit. Proves the audit is HONEST: direct canonical write reported POSSIBLE; Claude Code's
 * own tools NOT confined; V188 enforced only for module-routed changes; OS session confinement BLOCKED/OWNER_GATED;
 * 11 métiers ≠ 12 missions; no isolation faked. */
const A = require("./odg-sandbox-isolation-audit.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const a = A.audit();

  // §2.5 decisive answer — honest
  check("decisive: direct write to canonical repo POSSIBLE; own tools NOT confined", A.FINDINGS.directWriteToCanonicalRepo === "POSSIBLE" && A.FINDINGS.claudeCodeOwnToolsConfined === false && /^YES/.test(A.DECISIVE_ANSWER.answer));
  check("decisive consequence: V188 controls enforce only module-routed changes, not direct tool access", /ROUTED THROUGH odg-sovereign-delegation/.test(A.DECISIVE_ANSWER.consequence) && /DECLARATIVE/.test(A.DECISIVE_ANSWER.consequence));

  // §2 findings — isolation primitives present but for provider-delivered code, not Claude Code itself
  check("isolation primitives present (delegate-isolation/provider-sandbox/frontier-sandbox) + bwrap/unshare", A.FINDINGS.isolationPrimitivesPresent.length === 3 && A.FINDINGS.isolationPrimitivesPresent.some((x: string) => /delegate-isolation/.test(x)) && A.FINDINGS.osToolsAvailable.includes("bwrap"));
  check("V188 module is pure-logic — does NOT intercept Claude Code's direct tool calls", /PURE LOGIC/.test(A.FINDINGS.v188Module) && /does NOT intercept/.test(A.FINDINGS.v188Module));

  // §4 control classification
  const byStatus = (s: string) => A.CONTROL_CLASSIFICATION.filter((c: any) => c.status === s);
  check("ENFORCED: module-routed write-set + authority + delegate-flow bwrap", byStatus("ENFORCED").length >= 3);
  check("NON_ENFORCED: Claude Code's own tool writes (discipline-only)", byStatus("NON_ENFORCED").some((c: any) => /OWN tool writes/.test(c.control) && /discipline-only/.test(c.note)));
  check("BLOCKED: OS confinement of the live session (harness change, OWNER_GATED)", byStatus("BLOCKED").some((c: any) => /OS-level confinement/.test(c.control) && /OWNER_GATED/.test(c.note) && /must not alter security config to fake it/.test(c.note)));

  // §3 proposed mechanism — owner-gated, reuses existing, not self-applied
  check("proposed mechanism reuses delegate-isolation+bwrap (no 2nd orchestrator), status OWNER_GATED", /delegate-isolation/.test(A.PROPOSED_MECHANISM.reuses) && /NO second orchestrator/.test(A.PROPOSED_MECHANISM.reuses) && A.PROPOSED_MECHANISM.status === "OWNER_GATED");
  check("compensating controls listed while isolation is owner-gated", A.PROPOSED_MECHANISM.compensatingControlsMeanwhile.some((x: string) => /ALWAYS_PROTECTED/.test(x)) && A.PROPOSED_MECHANISM.compensatingControlsMeanwhile.some((x: string) => /diff review/.test(x)));

  // §5 reconciliation — 11 vs 12, HEAD, register
  check("11 remaining MÉTIERS ≠ 12 open MISSIONS (no contradiction)", /NO CONTRADICTION/.test(A.RECONCILIATION.elevenVsTwelve) && /11 = remaining MÉTIERS/.test(A.RECONCILIATION.elevenVsTwelve) && /12 = open MISSIONS/.test(A.RECONCILIATION.elevenVsTwelve));
  check("register 427 / open 12 / @V123; HEAD 01184cf gate 625", /427 total/.test(A.RECONCILIATION.register) && /openCount 12/.test(A.RECONCILIATION.register) && /01184cf/.test(A.RECONCILIATION.head) && /625/.test(A.RECONCILIATION.head));
  check("reconciliation carries extension PARKED + prepared improvements + radar egress NOT_MEASURED", /PARKED/.test(A.RECONCILIATION.extension) && /PREPARED/.test(A.RECONCILIATION.preparedImprovements) && /NOT_MEASURED/.test(A.RECONCILIATION.radar));

  // honesty + contract + determinism
  check("audit honesty: declarative discipline NOT presented as technical protection; no security config modified", /NOT presented as a technical protection/.test(a.honesty) && /no security configuration was modified/.test(a.honesty));
  check("contract invariants: honest decisive, module-routed-only, OS-confinement BLOCKED, 11≠12", A.SANDBOX_ISOLATION_AUDIT_CONTRACT.invariants.some((i: string) => /CAN write the canonical repo directly/.test(i)) && A.SANDBOX_ISOLATION_AUDIT_CONTRACT.invariants.some((i: string) => /BLOCKED\/OWNER_GATED/.test(i)) && A.SANDBOX_ISOLATION_AUDIT_CONTRACT.invariants.some((i: string) => /11 remaining MÉTIERS ≠ 12/.test(i)));
  check("deterministic + frozen", JSON.stringify(A.audit().decisive) === JSON.stringify(a.decisive) && Object.isFrozen(a) && Object.isFrozen(A.CONTROL_CLASSIFICATION));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — sandbox-isolation-audit (V189: decisive answer = Claude Code CAN write canonical repo directly [own tools NOT OS-confined]; V188 ENFORCED only for module-routed changes, direct tool use NON_ENFORCED; OS session confinement BLOCKED/OWNER_GATED [not faked]; real mechanism proposed via delegate-isolation+bwrap; 11 métiers ≠ 12 missions reconciled)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
