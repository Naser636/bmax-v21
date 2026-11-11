#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V92 §4/§5 — VPS READ-ONLY INVENTORY FICHE. Prepares the exact read-only inventory procedure to run WHEN
 * owner-gated VPS access becomes available — WITHOUT connecting now and WITHOUT inventing any environment fact. Each item
 * lists a generic read-only command (if the command form is known independent of the host), the expected evidence, the
 * risk, an availability status (OWNER_GATED — no access this cycle), and the reason. Secrets are presence-only (values
 * NEVER requested or shown). Also records the exact dependencies that remain to lift VPS_INVENTORY and complete
 * EXECUTABLE_DEPLOYMENT_PLAN. No remote connection. Writes docs/odg/V92_VPS_INVENTORY_FICHE.json. Run this file.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// each item: generic read-only command form (host-independent) OR NOT_MEASURED; never a host/service/path/secret invented.
const item = (name: string, cmd: string | null, evidence: string, risk: string, reason: string) => ({
  item: name, readOnlyCommand: cmd || "NOT_MEASURED (command form host-specific; fill after access)",
  expectedEvidence: evidence, risk, availability: "OWNER_GATED", reason: reason || "no VPS access this cycle (read-only access owner-gated)",
});

const inventory = [
  item("provider & instance", null, "provider + instance id/region", "none (read)", "host identity unknown until access"),
  item("OS & version", "cat /etc/os-release; uname -a", "distro + kernel version", "none", ""),
  item("resources & disk", "free -h; df -h; nproc", "memory/CPU/disk free", "none", ""),
  item("active services", "systemctl list-units --type=service --state=running", "running services (names)", "none", ""),
  item("processes & ports", "ps -eo pid,comm,args --sort=-%cpu | head; ss -tlnp", "process + listening ports", "may reveal service topology", ""),
  item("runtime & deps", "node -v; npm -v; which tsx", "runtime versions vs repo (node 22 per ci.yml)", "runtime drift vs repo", ""),
  item("application directories", null, "app deploy path + layout", "none", "path unknown until access"),
  item("config & env (NO values)", "printenv | sed 's/=.*/=<redacted>/' ; ls -la <app>/.env* 2>/dev/null", "variable NAMES present (values redacted locally)", "secret exposure IF values printed — command masks values", "names-only; values never read/shown"),
  item("databases & versions", null, "db engine + version (read-only)", "none (read)", "db identity unknown until access"),
  item("migrations & consistency", null, "migration ledger + applied state", "inconsistency risk", "db-specific; unknown until access"),
  item("certificates & TLS", "openssl x509 -enddate -noout -in <cert>  # path after access", "cert expiry/issuer", "none (read)", "cert path unknown until access"),
  item("reverse proxy & routing", "nginx -T 2>/dev/null | head  # if nginx", "proxy routes/upstreams", "config exposure", "proxy stack unknown until access"),
  item("backups & retention", null, "backup location + retention policy + last backup time", "none (read)", "backup policy unknown until access"),
  item("logs & monitoring", "journalctl -n 100 --no-pager  # or app log path", "recent logs + monitoring presence", "log content may contain data", ""),
  item("restart mechanism", "systemctl status <service>  # read-only", "restart unit + state", "none (read)", "unit name unknown until access"),
  item("rollback procedure", null, "documented rollback steps + prior artifact location", "none", "deploy mechanism unknown until access"),
  item("GitHub HEAD ↔ deployed version", null, "deployed commit sha vs repo HEAD (divergence check)", "repo↔target divergence", "deployed sha unknown until access"),
];

const knownCmd = inventory.filter((i) => !/^NOT_MEASURED/.test(i.readOnlyCommand)).length;

const out = {
  "//": "CTO V92 §4 — VPS read-only inventory FICHE. Prepared, NOT executed (no VPS access this cycle; no remote connection). No host/service/path/db/secret invented — unknown specifics are NOT_MEASURED/OWNER_GATED. Secrets presence-only (values never requested or shown). Preparing this fiche does NOT satisfy VPS_INVENTORY.",
  inventoryItems: inventory.length, itemsWithKnownReadOnlyCommand: knownCmd, connectionPerformed: false, secretsDisclosed: false,
  inventory,
  dependenciesToLift: {
    VPS_INVENTORY: { needs: ["owner-granted read-only access"], observedNow: [], unknown: inventory.filter((i) => /NOT_MEASURED/.test(i.readOnlyCommand)).map((i: any) => i.item), proofNeeded: "captured evidence per item during the real inventory", remainingValidation: "compare deployed version vs repo HEAD" },
    EXECUTABLE_DEPLOYMENT_PLAN: { githubVerified: "V91 GitHub/CI chain (real commands, push/PR/merge owner-gated) — kept, not redone", vpsDependent: "all 17 VPS steps + their real commands pending the inventory", stopCriteria: "any mismatch vs released version", rollback: "restore prior artifact/commit (owner-gated)", postDeployVerification: "health + connections + functional tests + independent validation" },
  },
  honestConclusion: `VPS inventory fiche prepared: ${inventory.length} items, ${knownCmd} with a generic host-independent read-only command, the rest NOT_MEASURED until access. NO connection performed, NO secret requested/shown (config read is names-only with values redacted). Preparing this fiche does NOT satisfy VPS_INVENTORY (that needs real observed data under owner-gated access). EXECUTABLE_DEPLOYMENT_PLAN's VPS-specific steps stay pending the inventory; the V91 GitHub chain is preserved.`,
  invariant: "fiche prepared not executed; no remote connection; nothing invented (unknown ⇒ NOT_MEASURED/OWNER_GATED); secrets presence-only values redacted; preparing a fiche ≠ performing an inventory.",
};
fs.writeFileSync(path.join(D, "V92_VPS_INVENTORY_FICHE.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ inventoryItems: inventory.length, itemsWithKnownReadOnlyCommand: knownCmd, connectionPerformed: false, secretsDisclosed: false }, null, 2) + "\n");
export {};
