#!/usr/bin/env node
"use strict";
/*
 * V189 §2/§3/§4/§5 — sandbox-isolation forensic audit + Boussole reconciliation. PURE, READ-ONLY, deterministic.
 *
 * Records the VERIFIED forensic findings (gathered by read-only shell probes on 2026-11-13) about whether Claude Code
 * is really OS-isolated from the canonical repo, classifies each V188 control as ENFORCED / NON_ENFORCED / NOT_MEASURED
 * / BLOCKED, gives the decisive answer, proposes the (owner-gated) real-isolation mechanism, and reconciles the
 * "11 vs 12" count. It does NOT claim isolation that does not exist and does NOT modify any security configuration.
 */

// VERIFIED findings (read-only probes): process = ubuntu/uid1000; repo is directly writable; sandbox primitives exist
// but confine PROVIDER-DELIVERED code, not Claude Code's own Edit/Write/Bash tools.
const FINDINGS = Object.freeze({
  processIdentity: "ubuntu (uid 1000)",
  canonicalRepo: "/home/ubuntu/bmax-v21 (drwxrwxr-x ubuntu)",
  directWriteToCanonicalRepo: "POSSIBLE",                       // write-probe succeeded
  claudeCodeOwnToolsConfined: false,                            // Edit/Write/Bash are NOT inside any sandbox
  isolationPrimitivesPresent: Object.freeze([
    "delegate-isolation.ts — OPT-IN, FAIL-CLOSED bwrap: gives a provider a disposable COPY of ONLY authorized files, no .git/network/secrets; output observed as a DIFF (PROVIDER_ISOLATION_E1_E4)",
    "provider-sandbox.ts — bwrap profile for an out-of-band local MODEL binary (ODG_LOCAL_MODEL_CMD), argv-only, minimal FS",
    "frontier-sandbox.ts — bwrap confinement for untrusted compilers/external research",
  ]),
  osToolsAvailable: Object.freeze(["bwrap", "unshare"]),
  v188Module: "odg-sovereign-delegation.ts — PURE LOGIC (no fs/child_process): enforces write-set/protected-path ONLY for changes routed through execute(); it does NOT intercept Claude Code's direct tool calls",
});

/* §2.5 — the decisive question, answered honestly. */
const DECISIVE_ANSWER = Object.freeze({
  question: "Can Claude Code write the canonical repo directly, outside a sandbox?",
  answer: "YES — in this session Claude Code (uid 1000) has direct write access to /home/ubuntu/bmax-v21 via its Edit/Write/Bash tools. There is NO OS-level sandbox confining Claude Code's OWN tool use.",
  consequence: "the V188 write-set/protected-path controls are ENFORCED only for changes ROUTED THROUGH odg-sovereign-delegation.execute(); they are NOT a technical confinement of Claude Code's direct tool access — that remains DECLARATIVE discipline (the provider contract + Truth-Lock + git-diff review).",
});

/* §4 — classify each control. */
const CONTROL_CLASSIFICATION = Object.freeze([
  { control: "write-set / protected-path for module-routed changes", status: "ENFORCED", by: "odg-sovereign-delegation.execute() (V188)" },
  { control: "authority separation (provider cannot authorize/accept/close)", status: "ENFORCED", by: "V188 actor checks" },
  { control: "provider-DELIVERED code runs in a real bwrap sandbox (delegate flow)", status: "ENFORCED", by: "delegate-isolation.ts (opt-in, fail-closed)" },
  { control: "Claude Code's OWN tool writes confined to a sandbox", status: "NON_ENFORCED", note: "direct repo write possible; discipline-only (provider contract + Truth-Lock + diff review)" },
  { control: "OS-level confinement of the running Claude Code session", status: "BLOCKED", note: "requires a HARNESS/ENVIRONMENT change (run the session inside delegate-isolation's bwrap worktree or a container). Claude Code cannot reconfigure the harness that runs it, and must not alter security config to fake it — OWNER_GATED." },
]);

/* §3 — proposed real-isolation mechanism (prepared, owner-gated; not self-applied). */
const PROPOSED_MECHANISM = Object.freeze({
  mechanism: "route provider edits through delegate-isolation.ts: give Claude Code a disposable git worktree/copy of ONLY the contract write-set (no .git of the canonical repo, no network, no secrets); observe output as a DIFF; ODG validates each changed path and imports it into the canonical repo.",
  reuses: "delegate-isolation.ts + bwrap (both present) + odg-sovereign-delegation.ts contract — NO second orchestrator",
  status: "OWNER_GATED",
  reason: "applying this to the LIVE Claude Code session is a harness-level decision (the owner must launch the provider inside the sandbox). The building blocks exist; the activation is not something the provider may self-grant.",
  compensatingControlsMeanwhile: Object.freeze(["V188 in-code enforcement for module-routed work", "ALWAYS_PROTECTED paths (ROADMAP.json, closure-register.json) never edited without owner authorization", "git diff review before every merge", "Truth-Lock + reconcile-before-resume", "provider contract accepted each session"]),
});

/* §5 — reconcile the "11 vs 12". */
const RECONCILIATION = Object.freeze({
  elevenVsTwelve: "NO CONTRADICTION — two different dimensions: 11 = remaining MÉTIERS to study in the 20-métier campaign (P6/P7/P8/P12/P13/P14/P15 + M1/M3/M4/M5, per V187); 12 = open MISSIONS in closure-register.json (6 BLOCKED + 3 IN_PROGRESS + 3 DEFERRED). Métiers ≠ closure-register missions.",
  register: "427 total (415 ACCEPTED / 6 BLOCKED / 3 IN_PROGRESS / 3 DEFERRED); openCount 12; byte-identical @V123",
  head: "01184cf (main @ V188); PR #557 merged; gate 625/625",
  roadmapJson: "11 governed missions; @V123; PROTECTED — untouched",
  extension: "V12.4 extension PARKED (started=false)",
  preparedImprovements: "P1/P3/P5/P9/P11 PREPARED, not built",
  radar: "collection via V187 adapter (injected authorized provider); autonomous radar egress NOT_MEASURED/OWNER_GATED",
  simultaneity: "real 5-way parallel NOT_MEASURED",
  independentReview: "distinct model reviewer NOT_AVAILABLE (evaluator-independence = deterministic checks)",
});

function audit(): any {
  return Object.freeze({
    oldSandbox: "FOUND (isolation primitives present) BUT NOT applied to Claude Code's own session",
    findings: FINDINGS, decisive: DECISIVE_ANSWER, controls: CONTROL_CLASSIFICATION,
    proposedMechanism: PROPOSED_MECHANISM, reconciliation: RECONCILIATION,
    honesty: "a declarative discipline is NOT presented as a technical protection; no security configuration was modified; direct-write capability is reported as-is; OS confinement of the live session is BLOCKED/OWNER_GATED.",
  });
}

const SANDBOX_ISOLATION_AUDIT_CONTRACT = Object.freeze({
  id: "V189-SANDBOX-ISOLATION-AUDIT",
  purpose: "§2/§3/§4/§5 — forensic sandbox audit + control classification + proposed mechanism + Boussole reconciliation",
  invariants: Object.freeze([
    "decisive answer honest: Claude Code CAN write the canonical repo directly; its own tools are NOT OS-confined",
    "V188 write-set/protected-path is ENFORCED only for module-routed changes; direct tool use is NON_ENFORCED (declarative)",
    "OS confinement of the live session is BLOCKED/OWNER_GATED (harness change) — not self-applied, not faked",
    "11 remaining MÉTIERS ≠ 12 open closure-register MISSIONS (no contradiction)",
    "no security config modified; no isolation claimed that does not exist; deterministic; read-only",
  ]),
});

module.exports = { FINDINGS, DECISIVE_ANSWER, CONTROL_CLASSIFICATION, PROPOSED_MECHANISM, RECONCILIATION, audit, SANDBOX_ISOLATION_AUDIT_CONTRACT };
export {};
