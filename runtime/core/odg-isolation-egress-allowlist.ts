#!/usr/bin/env node
"use strict";
/*
 * V193 §2 — egress allowlist + reproducible activation procedure for the isolated provider session. PURE, deterministic.
 *
 * V192 proved: --unshare-all kills the network (live session can't auth); fs-confinement with general net keeps the
 * canonical repo blocked but opens GENERAL egress. The secure target is fs-confinement + an egress ALLOWLIST limited to
 * the provider's indispensable endpoints. This module records that allowlist + the auth-without-secrets procedure + the
 * reproducible launch + checks. It does NOT impose the allowlist (a harness/system network-policy change ⇒ OWNER_GATED)
 * and does NOT qualify the network as secured until the allowlist is EFFECTIVELY enforced.
 */

// the indispensable provider endpoints a live Claude Code session needs (names, not secrets).
const ALLOWLIST_ENDPOINTS = Object.freeze([
  { host: "api.anthropic.com", purpose: "Claude Code provider API (messages/auth)", required: true },
  { host: "<DNS resolver>", purpose: "name resolution for the above (system resolv.conf)", required: true },
]);

const NETWORK_STATUS = Object.freeze({
  current: "NOT_SECURED — no egress allowlist is enforced in this environment; the only proven modes are (A) --unshare-all = no net, or (B) general net. An allowlist-only live session is not yet achievable by the provider.",
  qualification: "the network MUST NOT be qualified 'secured' until the allowlist is EFFECTIVELY imposed (OWNER_GATED).",
});

/* enforcementOptions — how an owner could impose the allowlist (all OWNER_GATED; provider does not apply them). */
const ENFORCEMENT_OPTIONS = Object.freeze([
  { id: "slirp4netns_allowlist", how: "launch the isolated session in a user network namespace via slirp4netns with an outbound allowlist to api.anthropic.com only", ownerGated: true },
  { id: "nftables_egress", how: "owner/root nftables egress rule permitting only the allowlisted hosts/ports from the session's netns", ownerGated: true, needsRoot: true },
  { id: "http_proxy_allowlist", how: "run the session behind an owner-run forward proxy that only allows the allowlisted hosts; set HTTPS_PROXY in the session", ownerGated: true },
]);

const AUTH_WITHOUT_SECRETS = Object.freeze({
  method: "Claude Code reads its OWN credential from its user config (~/.claude or env the HARNESS provides) — that is the provider's own auth, NOT a project secret.",
  rule: "do NOT copy project secrets into the work copy; do NOT print or export any token; the work copy contains ONLY the mission write-set.",
});

/* activationProcedure — reproducible launch for the next isolated session (secure variant intent). */
function activationProcedure(opts: any): any {
  const o = opts || {};
  const workCopy = o.workCopyDir || "<WORKCOPY>";
  return Object.freeze({
    steps: Object.freeze([
      "1. ODG prepares <WORKCOPY> = disposable copy of ONLY the mission write-set (no canonical .git, no secrets)",
      "2. OWNER establishes the egress allowlist (one of ENFORCEMENT_OPTIONS) — OWNER_GATED",
      `3. OWNER launches the session: bwrap --unshare-pid --unshare-ipc --unshare-uts --die-with-parent --ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /lib /lib --ro-bind /lib64 /lib64 --ro-bind /etc/resolv.conf /etc/resolv.conf --ro-bind /etc/ssl /etc/ssl --proc /proc --dev /dev --bind ${workCopy} /work --chdir /work -- <claude-session-cmd>`,
      "4. post-launch checks (MUST pass): canonical repo not visible, canonical write BLOCKED, /work writable, egress reaches ONLY the allowlist (verify), provider auth succeeds",
      "5. provider works in /work only; exports git diff; ODG importGate validates (⊆ write-set & ∉ protected) + imports",
    ]),
    checksMustPass: Object.freeze(["canonical-not-visible", "canonical-write-BLOCKED", "work-writable", "egress-allowlisted-only", "provider-auth-OK"]),
    note: "until step 2 is done + step 4 proves allowlisted-only egress, the network is NOT_SECURED and SESSION_OS_ISOLATION stays OWNER_GATED.",
  });
}

const EGRESS_ALLOWLIST_CONTRACT = Object.freeze({
  id: "V193-ISOLATION-EGRESS-ALLOWLIST",
  purpose: "§2 — define the provider-endpoint egress allowlist + auth-without-secrets + reproducible activation; impose nothing",
  invariants: Object.freeze([
    "allowlist = only the indispensable provider endpoints (api.anthropic.com + DNS); names not secrets",
    "network is NOT qualified secured until the allowlist is EFFECTIVELY enforced (OWNER_GATED)",
    "enforcement options are all OWNER_GATED; the provider imposes nothing and modifies no system/security config",
    "auth uses Claude Code's OWN credential (not a project secret); no token exported; work copy = write-set only",
    "SESSION_OS_ISOLATION stays OWNER_GATED; deterministic; read-only",
  ]),
});

module.exports = { ALLOWLIST_ENDPOINTS, NETWORK_STATUS, ENFORCEMENT_OPTIONS, AUTH_WITHOUT_SECRETS, activationProcedure, EGRESS_ALLOWLIST_CONTRACT };
export {};
