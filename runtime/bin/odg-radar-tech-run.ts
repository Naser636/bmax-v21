#!/usr/bin/env node
"use strict";
/*
 * V360 §2/§6 — RADAR TECH SOURCES RUN (arXiv + GitHub). Runs the owner-authorized tech-source collection→qualification on
 * demand. DEFAULT DRY (no egress); ODG_RADAR_LIVE=1 performs the bounded, read-only, allowlisted collection. Topics are
 * V360-gap-relevant (agent memory, autonomous software engineering). Produces PROPOSALS only (mission creation owner-gated).
 *
 * Usage: npx tsx runtime/bin/odg-radar-tech-run.ts                      (DRY)
 *        ODG_RADAR_LIVE=1 npx tsx runtime/bin/odg-radar-tech-run.ts     (LIVE — owner-authorized bounded fetch)
 */
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const TECH = require(path.join(ROOT, "runtime", "core", "odg-radar-tech-sources.js"));

const enabled = process.env.ODG_RADAR_LIVE === "1";
const jobs = [
  { source: "arxiv", topic: "cat:cs.AI AND abs:agent memory" },
  { source: "github", topic: "llm agent memory language:python" },
];

(async () => {
  const results: any[] = [];
  for (const j of jobs) {
    const r = await TECH.collectTechSource(j.source, j.topic, { enabled, baseline: { focusAreas: ["memory", "agent", "reasoning"], crossChecked: true }, odgBaseline: { capabilities: [] }, now: new Date().toISOString() });
    results.push({ source: j.source, host: r.host, decision: r.decision, signals: r.signalCount ?? 0, proposals: (r.proposals || []).length, quarantined: r.quarantined ?? 0, provenanceHost: r.provenance ? r.provenance.host : null });
  }
  process.stdout.write(JSON.stringify({ ran: "radar-tech", killSwitch: enabled ? "ON (ODG_RADAR_LIVE=1)" : "OFF (DRY — no egress)", results }, null, 2) + "\n");
  if (!enabled) { process.stdout.write("\nDRY — no egress. arXiv + GitHub endpoints validated. ODG_RADAR_LIVE=1 ⇒ owner-authorized bounded collection.\n"); process.exit(0); }
  const collected = results.filter((r) => r.decision === "QUALIFIED").length;
  process.stdout.write(`\nLIVE — ${collected}/${results.length} tech sources qualified (bounded, read-only, allowlisted; injection⇒quarantine; proposals are PROPOSALS, mission creation owner-gated).\n`);
  process.exit(0);
})();
export {};
