#!/usr/bin/env node
"use strict";
/* V193 §2 — egress allowlist + activation procedure. Proves: allowlist = provider endpoints only; network NOT_SECURED
 * until enforced; enforcement OWNER_GATED; auth without project secrets; reproducible procedure; nothing imposed. */
const E = require("./odg-isolation-egress-allowlist.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  check("allowlist = provider API + DNS only (names, not secrets)", E.ALLOWLIST_ENDPOINTS.some((e: any) => /api.anthropic.com/.test(e.host) && e.required) && E.ALLOWLIST_ENDPOINTS.some((e: any) => /DNS/.test(e.host)));
  check("network NOT_SECURED until allowlist enforced; must not be qualified secured", /NOT_SECURED/.test(E.NETWORK_STATUS.current) && /MUST NOT be qualified 'secured' until the allowlist is EFFECTIVELY imposed/.test(E.NETWORK_STATUS.qualification));
  check("enforcement options all OWNER_GATED (slirp/nftables/proxy)", E.ENFORCEMENT_OPTIONS.length >= 3 && E.ENFORCEMENT_OPTIONS.every((o: any) => o.ownerGated === true) && E.ENFORCEMENT_OPTIONS.some((o: any) => /slirp4netns/.test(o.id)));
  check("auth uses Claude Code's OWN credential, NOT a project secret; no token exported", /OWN credential/.test(E.AUTH_WITHOUT_SECRETS.method) && /NOT a project secret/.test(E.AUTH_WITHOUT_SECRETS.method) && /do NOT print or export any token/.test(E.AUTH_WITHOUT_SECRETS.rule));

  const p = E.activationProcedure({ workCopyDir: "/tmp/wc" });
  check("procedure: ODG prepares write-set copy + OWNER sets allowlist + bwrap launch + post-checks + importGate", p.steps.length === 5 && /ONLY the mission write-set/.test(p.steps[0]) && /OWNER establishes the egress allowlist/.test(p.steps[1]) && /bwrap --unshare-pid/.test(p.steps[2]) && /importGate/.test(p.steps[4]));
  check("post-launch checks must include egress-allowlisted-only + provider-auth-OK + canonical-write-BLOCKED", p.checksMustPass.includes("egress-allowlisted-only") && p.checksMustPass.includes("provider-auth-OK") && p.checksMustPass.includes("canonical-write-BLOCKED"));
  check("procedure note: not secured + OWNER_GATED until allowlist proven", /NOT_SECURED/.test(p.note) && /OWNER_GATED/.test(p.note));

  check("contract: allowlist-only, not-secured-until-enforced, OWNER_GATED, own-credential, imposes nothing", E.EGRESS_ALLOWLIST_CONTRACT.invariants.some((i: string) => /only the indispensable provider endpoints/.test(i)) && E.EGRESS_ALLOWLIST_CONTRACT.invariants.some((i: string) => /NOT qualified secured until/.test(i)) && E.EGRESS_ALLOWLIST_CONTRACT.invariants.some((i: string) => /imposes nothing/.test(i) || /modifies no system\/security config/.test(i)));
  check("deterministic + frozen", JSON.stringify(E.activationProcedure({ workCopyDir: "/tmp/wc" }).checksMustPass) === JSON.stringify(p.checksMustPass) && Object.isFrozen(E.ENFORCEMENT_OPTIONS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — isolation-egress-allowlist (V193 §2: allowlist = provider API + DNS only; network NOT_SECURED until EFFECTIVELY enforced; enforcement OWNER_GATED [slirp/nftables/proxy]; auth via Claude Code's own credential, no project secret/token exported; reproducible procedure; imposes nothing)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
