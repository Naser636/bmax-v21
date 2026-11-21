#!/usr/bin/env node
"use strict";
/*
 * V360 §6 — RADAR LIVE COLLECTION RUN (runtime entry, governed). Connects the governed live-collection path to a real,
 * repeatable entry. DEFAULT DRY: it egresses ONLY when ODG_RADAR_LIVE=1 (kill-switch) — otherwise it validates the
 * allowlisted public-source URLs and reports, with NO network call (safe for CI/build/accidental runs). When enabled it
 * performs a bounded, read-only, allowlisted, size/timeout-capped collection via odg-radar-live-collect → fr07-live-collection
 * → bounded-http-client, and reports per-URL decision + provenance. Public free French open-data sources only
 * (bounded-http-client.ALLOWLIST: data.economie.gouv.fr, BOAMP); no auth/secrets, no purchase/signup, no crawling, no deploy.
 *
 * Usage: npx tsx runtime/bin/odg-radar-live-collect-run.ts            (DRY — validates only, no egress)
 *        ODG_RADAR_LIVE=1 npx tsx runtime/bin/odg-radar-live-collect-run.ts   (LIVE — bounded egress, owner-authorized §6)
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const LC = require(path.join(ROOT, "runtime", "core", "odg-radar-live-collect.js"));

const enabled = process.env.ODG_RADAR_LIVE === "1"; // kill-switch
// allowlisted public free open-data endpoints (read-only, anonymous, JSON).
const urls = [
  "https://data.economie.gouv.fr/api/datasets/1.0/search/?rows=1",
  "https://boamp-datadila.opendatasoft.com/api/datasets/1.0/search/?rows=1",
];

(async () => {
  const r = await LC.governedLiveCollect({ urls, title: "radar-live" }, { enabled, maxRequests: 2, now: new Date().toISOString() });
  process.stdout.write(JSON.stringify({ ran: "radar-live-collect", killSwitch: enabled ? "ON (ODG_RADAR_LIVE=1)" : "OFF (DRY — no egress)", quota: r.quota, allowlist: r.allowlist, results: r.results, note: r.note }, null, 2) + "\n");
  if (!enabled) { process.stdout.write("\nDRY — no network egress. Allowlisted URLs validated. Set ODG_RADAR_LIVE=1 to perform the owner-authorized bounded collection (§6).\n"); process.exit(0); }
  const collected = r.results.filter((x: any) => x.decision === "COLLECTED").length;
  const quarantined = r.results.filter((x: any) => x.decision === "QUARANTINE").length;
  process.stdout.write(`\nLIVE — bounded collection done: ${collected} COLLECTED, ${quarantined} QUARANTINE, ${r.results.length - collected - quarantined} rejected/failed. Allowlisted, read-only, size/timeout-capped, provenance recorded.\n`);
  process.exit(0);
})();
export {};
