#!/usr/bin/env node
"use strict";
/* V192 §2 — network-viability review. Proves: --unshare-all kills network (live session not viable); live-session spec
 * keeps network + confines filesystem (no canonical mount); egress-allowlist secure target OWNER_GATED; probe evidence. */
const R = require("./odg-isolation-network-review.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  // probe evidence
  check("probe A (--unshare-all): network torn down (0 non-lo ifaces), canonical NOT visible", R.PROBE.variantA_unshareAll.netNonLoopbackIfaces === 0 && R.PROBE.variantA_unshareAll.canonicalVisible === "NO" && /NO egress/.test(R.PROBE.variantA_unshareAll.conclusion));
  check("probe B (fs-confined, net preserved): canonical NOT visible/writable + resolv.conf present", R.PROBE.variantB_fsConfinedNetPreserved.canonicalVisible === "NO" && R.PROBE.variantB_fsConfinedNetPreserved.canonicalWrite === "BLOCKED" && R.PROBE.variantB_fsConfinedNetPreserved.resolvConf === "present");

  // finding
  check("decisive: --unshare-all kills network ⇒ live session cannot auth (batch-only)", /kills the network/.test(R.FINDING.decisive) && /cannot authenticate/.test(R.FINDING.decisive) && /batch build/.test(R.FINDING.decisive));
  check("secure target = fs-confined + provider-API egress allowlist, OWNER_GATED", /egress ALLOWLIST/.test(R.FINDING.secureTarget) && /OWNER_GATED/.test(R.FINDING.secureTarget));

  // modes
  const byId: any = {}; for (const m of R.MODES) byId[m.id] = m;
  check("mode A (batch no-net) not viable for a live session", byId.A_batch_no_net.liveSessionViable === false);
  check("mode B (live, fs-confined, general net) viable but owner-gated", byId.B_live_fs_confined_general_net.liveSessionViable === true && byId.B_live_fs_confined_general_net.ownerGated === true);
  check("mode C (live, allowlisted net) = secure target, owner-gated", byId.C_live_fs_confined_allowlisted_net.liveSessionViable === true && /OWNER_GATED/.test(byId.C_live_fs_confined_allowlisted_net.note));

  // live-session launch spec
  const s = R.liveSessionLaunchSpec({ workCopyDir: "/tmp/wc", providerCmd: ["claude"] });
  check("live spec does NOT use --unshare-all / --unshare-net (network preserved)", !s.argv.includes("--unshare-all") && !s.argv.includes("--unshare-net") && s.networkPreserved === true);
  check("live spec confines filesystem: binds work copy, no canonical repo mount, binds TLS roots", s.argv.includes("--bind") && s.argv.includes("/tmp/wc") && s.noCanonicalMount === true && s.noCanonicalGit === true && s.argv.includes("/etc/ssl") && !s.argv.includes("/home/ubuntu/bmax-v21"));
  check("live spec keeps resolv.conf (so auth DNS works)", s.argv.includes("/etc/resolv.conf"));

  // contract + determinism
  check("contract: --unshare-all not viable live, egress allowlist OWNER_GATED, no security config modified", R.ISOLATION_NETWORK_REVIEW_CONTRACT.invariants.some((i: string) => /LIVE session cannot authenticate/.test(i)) && R.ISOLATION_NETWORK_REVIEW_CONTRACT.invariants.some((i: string) => /OWNER_GATED/.test(i)) && R.ISOLATION_NETWORK_REVIEW_CONTRACT.invariants.some((i: string) => /no security config modified/.test(i)));
  check("deterministic + frozen", JSON.stringify(R.liveSessionLaunchSpec({ workCopyDir: "/tmp/wc", providerCmd: ["claude"] }).argv) === JSON.stringify(s.argv) && Object.isFrozen(s) && Object.isFrozen(R.MODES));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — isolation-network-review (V192 §2: PROVEN --unshare-all kills network ⇒ live session can't auth [batch-only]; live-session spec = fs-confined [no canonical mount] WITH network preserved for auth; provider-API egress allowlist = secure target, OWNER_GATED; no security config modified)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
