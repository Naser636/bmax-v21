#!/usr/bin/env node
"use strict";
/*
 * V192 §2 — network-viability review of the V190 isolation launchSpec. PURE, READ-ONLY, deterministic.
 *
 * CRITICAL FINDING (proven by real bwrap probes 2026-11-13): the V190 launchSpec uses `--unshare-all`, which tears down
 * the NETWORK namespace. A non-interactive batch build needs no network, but a LIVE Claude Code provider session needs
 * network egress to its provider API to authenticate and operate — so it CANNOT run under `--unshare-all`. This records
 * the two usable confinement modes + the honest recommendation (an egress ALLOWLIST to the provider API only is the
 * secure target, but it is a harness/system network-policy change ⇒ OWNER_GATED). No security config was modified.
 */

const { ALWAYS_PROTECTED } = require("./odg-provider-session-isolation.js");

// REAL probe evidence (subprocess bwrap; changed neither this session nor any security config).
const PROBE = Object.freeze({
  date: "2026-11-13",
  variantA_unshareAll: { netNonLoopbackIfaces: 0, canonicalVisible: "NO", conclusion: "network namespace torn down — NO egress" },
  variantB_fsConfinedNetPreserved: { resolvConf: "present", canonicalVisible: "NO", canonicalWrite: "BLOCKED", conclusion: "filesystem confined (canonical not visible/writable) WITH host network path inherited" },
});

const FINDING = Object.freeze({
  decisive: "the V190 `--unshare-all` launchSpec kills the network — a LIVE Claude Code session cannot authenticate/operate under it. It is valid ONLY for a non-interactive batch build that needs no network.",
  forLiveSession: "filesystem confinement WITHOUT `--unshare-net` keeps the network reachable AND still blocks the canonical repo (canonical-visible=NO, write=BLOCKED). But without an egress filter this grants GENERAL network access, which the directive wants to avoid.",
  secureTarget: "filesystem confinement (no canonical mount) + an egress ALLOWLIST restricted to the provider API host only (e.g. slirp4netns with an allowlist, or a netns + nftables egress rule). This needs a harness/system network-policy change ⇒ OWNER_GATED; the provider cannot configure it and must not modify security config.",
});

// two usable modes today + the gated secure target.
const MODES = Object.freeze([
  { id: "A_batch_no_net", net: "NONE (--unshare-all)", useFor: "non-interactive batch build (no live model); maximal isolation", liveSessionViable: false, note: "proven: no egress, canonical not visible" },
  { id: "B_live_fs_confined_general_net", net: "GENERAL (no --unshare-net)", useFor: "a LIVE provider session that must authenticate; filesystem still confined (no canonical mount)", liveSessionViable: true, note: "proven: canonical not visible/writable, network inherited; general egress — acceptable only if the owner accepts general egress", ownerGated: true },
  { id: "C_live_fs_confined_allowlisted_net", net: "ALLOWLIST (provider API only)", useFor: "the SECURE target for a live session", liveSessionViable: true, note: "requires an owner/harness egress filter (slirp allowlist / nftables) — OWNER_GATED; NOT self-applicable", ownerGated: true },
]);

/* liveSessionLaunchSpec — the corrected spec for a LIVE provider session: filesystem-confined, network PRESERVED,
 * canonical repo + .git NEVER mounted. (Mode B; the owner should add an egress allowlist for Mode C.) */
function liveSessionLaunchSpec(opts: any): any {
  const o = opts || {};
  const workCopy = o.workCopyDir || "<WORKCOPY>";
  const providerCmd = Array.isArray(o.providerCmd) && o.providerCmd.length ? o.providerCmd : ["<claude-session-cmd>"];
  const argv = Object.freeze([
    "bwrap", "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--die-with-parent",
    "--ro-bind", "/usr", "/usr", "--ro-bind", "/bin", "/bin", "--ro-bind", "/lib", "/lib", "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf", "--ro-bind", "/etc/ssl", "/etc/ssl",
    "--proc", "/proc", "--dev", "/dev",
    "--bind", workCopy, "/work", "--chdir", "/work",
    "--", ...providerCmd,
  ]);
  return Object.freeze({
    argv, networkPreserved: true, noNetUnshare: true, noCanonicalMount: true, noCanonicalGit: true, noSecrets: true,
    note: "network preserved (NOT --unshare-all) so the live session can authenticate; canonical repo + .git NEVER mounted; TLS roots bound read-only. Owner should add an egress allowlist (Mode C) to restrict to the provider API.",
  });
}

const ISOLATION_NETWORK_REVIEW_CONTRACT = Object.freeze({
  id: "V192-ISOLATION-NETWORK-REVIEW",
  purpose: "§2 — verify the V190 launchSpec network viability; give a live-session-compatible spec + the owner-gated secure target",
  invariants: Object.freeze([
    "proven: --unshare-all tears down the network ⇒ a LIVE session cannot authenticate (batch-build-only)",
    "live-session spec confines the filesystem (no canonical repo/.git mount) WITHOUT killing the network",
    "restricting egress to the provider API only is the secure target but is a harness/system change ⇒ OWNER_GATED",
    "no secrets exposed; no general network opened by the provider; no security config modified",
    "SESSION_OS_ISOLATION stays OWNER_GATED until a real isolated session is launched + proven; deterministic; read-only",
  ]),
});

module.exports = { PROBE, FINDING, MODES, liveSessionLaunchSpec, ALWAYS_PROTECTED, ISOLATION_NETWORK_REVIEW_CONTRACT };
export {};
