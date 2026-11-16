#!/usr/bin/env node
"use strict";
/*
 * V215 §9 — SANDBOX-CERTIFICATION HARNESS (preparation only). PURE, deterministic, READ-ONLY. This consolidates the 8
 * required sandbox-certification tests into ONE honest artifact so the owner can run the final certification. It does NOT
 * certify the sandbox, does NOT launch anything, and does NOT execute untrusted code. It composes the ALREADY-PROVEN
 * evidence (V196 bwrap probes, V197 relay 9/9, V198 launcher patch 12/12) and marks precisely which tests have a
 * LOCALLY_PROVEN mechanism vs which REQUIRE the real isolated in-session launch (OWNER_GATED).
 *
 * HARD HONESTY: certification is declared ONLY when the 8 tests pass INSIDE the real isolated session the owner launches
 * (a running host agent cannot self-isolate — V196 root cause). A locally-proven MECHANISM is not an in-session PASS.
 */

// the 8 canonical certification tests + their current evidence status (no test is run here; statuses are references).
const TESTS = Object.freeze([
  { n: 1, test: "network isolation", mechanism: "LOCALLY_PROVEN", evidence: "V196 bwrap probe: --unshare-all netns has 0 non-lo interfaces; direct egress to 1.1.1.1:443 BLOCKED", inSession: "must re-confirm inside the real session" },
  { n: 2, test: "proxy allowlist", mechanism: "DESIGN_PROVEN", evidence: "launcher unix-socket CONNECT broker with ALLOWED={api.anthropic.com,platform.claude.com}; 403 otherwise", inSession: "REQUIRES real session + broker running", ownerGated: true },
  { n: 3, test: "Claude Max authentication (no ANTHROPIC_API_KEY)", mechanism: "DESIGN_PROVEN", evidence: "launcher --clearenv + env without ANTHROPIC_API_KEY; OAuth creds bind-mounted at /sandbox-home/.claude", inSession: "REQUIRES real session (auth not testable from host)", ownerGated: true },
  { n: 4, test: "real Claude Code invocation", mechanism: "NOT_RUN", evidence: "the inner interactive claude needs a TTY; exits on EOF in automation", inSession: "REQUIRES owner-attached interactive session", ownerGated: true },
  { n: 5, test: "Ollama access through the relay", mechanism: "RELAY_PROVEN", evidence: "V197 odg-ollama-relay.py 9/9 (routes allowlisted, pull 403); V198 netns e2e reached Ollama via bridge", inSession: "REQUIRES launcher wiring (V198 patch apply) + host relay under /run — OWNER_GATED", ownerGated: true },
  { n: 6, test: "real local Ollama generation", mechanism: "RELAY_PROVEN", evidence: "V198 netns e2e: real qwen2.5-coder:7b generation THROUGH the relay", inSession: "REQUIRES the wired launcher in-session", ownerGated: true },
  { n: 7, test: "/work persistence", mechanism: "LOCALLY_PROVEN", evidence: "V196 bwrap probe: /work bind-mounted + writable (touch/rm)", inSession: "must re-confirm inside the real session" },
  { n: 8, test: "no canonical-repository access", mechanism: "LOCALLY_PROVEN", evidence: "V196 bwrap probe: canonical repo + /home/ubuntu NOT visible (not mounted)", inSession: "must re-confirm inside the real session" },
]);

const OWNER_ACTIONS = Object.freeze([
  "install the V197 relay to ~/bin and start it under /run (odg-ollama-relay.py host)",
  "apply docs/odg/V198_launcher_ollama_integration.patch to $HOME/bin/odg-claude-sandbox",
  "launch the sandbox as the OUTER process from an owner TTY (a host agent cannot self-isolate)",
  "run the 8 tests INSIDE that real session and attach the evidence",
]);

/* certify() -> readiness view. NEVER returns CERTIFIED (the in-session tests are not run here). */
function certify(): any {
  const locallyProven = TESTS.filter((t: any) => t.mechanism === "LOCALLY_PROVEN").map((t: any) => t.n);
  const inSessionRequired = TESTS.filter((t: any) => t.ownerGated === true).map((t: any) => t.n);
  return Object.freeze({
    total: TESTS.length, tests: TESTS,
    locallyProvenMechanism: Object.freeze(locallyProven),        // mechanism proven by a real bwrap probe (not an in-session PASS)
    inSessionRequired: Object.freeze(inSessionRequired),         // require the owner-launched isolated session
    certified: false,
    certification: "NOT_CERTIFIED — the 8 tests have NOT been run inside the real isolated session; locally-proven mechanisms are NOT an in-session certification",
    v198Patch: "PREPARED+VALIDATED (12/12), host launcher NOT modified — apply is OWNER_GATED",
    ownerActions: OWNER_ACTIONS,
    honesty: "this harness PREPARES the certification — it runs nothing, launches nothing, certifies nothing; certification is declared ONLY when the 8 tests pass inside the owner-launched isolated session.",
  });
}

const SANDBOX_CERTIFICATION_HARNESS_CONTRACT = Object.freeze({
  id: "V215-SANDBOX-CERTIFICATION-HARNESS",
  purpose: "§9 — consolidate the 8 sandbox-certification tests into one honest preparation artifact; certify nothing",
  invariants: Object.freeze([
    "enumerates the 8 canonical tests with their real V196/V197/V198 evidence; runs nothing, launches nothing",
    "certified is ALWAYS false here — a locally-proven mechanism is NOT an in-session PASS; certification needs the real isolated session",
    "in-session tests (proxy/auth/claude-invocation/relay-generation) are OWNER_GATED; exact owner actions listed",
    "composes existing evidence — no new engine/primitive; deterministic; read-only",
  ]),
});

module.exports = { TESTS, OWNER_ACTIONS, certify, SANDBOX_CERTIFICATION_HARNESS_CONTRACT };
export {};
