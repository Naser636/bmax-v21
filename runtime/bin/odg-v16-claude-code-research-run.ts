#!/usr/bin/env node
"use strict";
/* V16 §8 — Claude Code ecosystem research run (EXISTING Radar controls; see runtime/core/odg-v16-claude-code-research.ts).
 * DEFAULT DRY: lists the planned URLs and validates each through the real governor (+ per-run quota) and the real
 * bounded-http-client.validateUrl — NO egress. ODG_RADAR_LIVE=1 ⇒ owner-authorized bounded fetch (kill-switch enforced in
 * bounded-http-client as well). Output goes to stdout only; a live collection must then be pinned in
 * docs/odg/evidence/COLLECTION_REGISTRY.json before any finding is reused.
 *
 * Usage: npx tsx runtime/bin/odg-v16-claude-code-research-run.ts                     (DRY)
 *        ODG_RADAR_LIVE=1 npx tsx runtime/bin/odg-v16-claude-code-research-run.ts    (LIVE — owner-gated) */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const R = require(path.join(ROOT, "runtime", "core", "odg-v16-claude-code-research.js"));

(async () => {
  const grant = JSON.parse(fs.readFileSync(path.join(ROOT, R.GRANT_PATH), "utf8")).grant;
  const live = process.env.ODG_RADAR_LIVE === "1";
  const now = Date.now();
  const out = await R.runResearch(R.TARGETS, grant, now, live);
  process.stdout.write(JSON.stringify({
    ran: "v16-claude-code-research", grant: R.GRANT_PATH, expiresIso: grant.expiresIso, killSwitch: live ? "ON (ODG_RADAR_LIVE=1)" : "OFF (DRY — no egress)",
    mode: out.mode, egress: out.egress, allowed: out.allowed, denied: out.denied,
    plan: out.plan.map((p: any) => ({ decision: p.decision, url: p.url, contentTypes: p.contentTypes.join(","), reasons: p.reasons })),
    results: out.results,
  }, null, 2) + "\n");
  process.exit(out.denied === 0 ? 0 : 2);
})().catch((e) => { process.stderr.write("v16 research run error: " + ((e && e.message) || e) + "\n"); process.exit(1); });
export {};
