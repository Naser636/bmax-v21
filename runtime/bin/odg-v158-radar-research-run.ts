#!/usr/bin/env node
"use strict";
/* V15.8 §3 — multi-source Radar research run over the V158 ADMITTED sources, through the EXISTING Radar controls.
 * Reuses runtime/core/odg-v16-claude-code-research.js planRun/runResearch UNCHANGED (research-budget.governWithBudget →
 * research-governor.govern [authorized, unexpired, EXACT host, path prefix] + per-run quota; bounded-http-client.validateUrl
 * + get [ODG_RADAR_LIVE kill-switch, REDIRECT_BLOCKED, size cap, per-call content types]; stampFinding/sanitizeExternal).
 * No Radar code, governor, transport or canonical ALLOWLIST is modified; only the grant file differs (V158, admission-built).
 *
 * DEFAULT DRY (no egress). ODG_RADAR_LIVE=1 ⇒ bounded live fetch. --evidence writes the result to
 * docs/odg/evidence/V158_RADAR_LIVE_RUN.json (content is NEVER stored: only status, type, bytes, sha256, sanitized title).
 * A live collection must then be pinned in docs/odg/evidence/COLLECTION_REGISTRY.json before any finding is reused.
 * Usage: npx tsx runtime/bin/odg-v158-radar-research-run.ts [--evidence]
 *        ODG_RADAR_LIVE=1 npx tsx runtime/bin/odg-v158-radar-research-run.ts --evidence */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const R = require(path.join(ROOT, "runtime", "core", "odg-v16-claude-code-research.js"));

const GRANT_PATH = "docs/odg/V158_RESEARCH_GRANT_GLOBAL_RADAR.json";
const EVIDENCE_PATH = "docs/odg/evidence/V158_RADAR_LIVE_RUN.json";
// ≤ 10 concrete pages, at least one per admitted host, chosen for ODG engineering relevance and small responses.
const TARGETS = Object.freeze([
  { url: "https://code.claude.com/docs/en/sandboxing.md", topics: ["egress control", "agent isolation"] },
  { url: "https://csrc.nist.gov/pubs/ai/100/2/e2025/final", topics: ["adversarial ML taxonomy", "prompt injection"] },
  { url: "https://huggingface.co/api/daily_papers?limit=5", topics: ["research discovery", "AI papers"] },
  { url: "https://huggingface.co/api/models?search=qwen2.5-coder&limit=5", topics: ["local models", "model registry"] },
  { url: "https://registry.npmjs.org/next/latest", topics: ["dependency intelligence", "Next.js release"] },
  { url: "https://registry.npmjs.org/react/latest", topics: ["dependency intelligence", "React release"] },
  { url: "https://www.postgresql.org/docs/current/explicit-locking.html", topics: ["locking", "concurrency"] },
  { url: "https://www.sqlite.org/docs.html", topics: ["embedded storage", "documentation index"] },
]);

/** summarize(out, live): PURE verdict over a runResearch() result — never a false success.
 *  DENIED (exit 2): a planned target was refused by governor/quota/transport. LIVE_NO_RESPONSE (exit 3): live run, zero
 *  responses received. LIVE_PARTIAL (exit 4): live, some targets unavailable (403/429/5xx/timeout/redirect blocked…).
 *  LIVE_OK / DRY_OK (exit 0). Per-host attribution and failure counts by transport code are always reported. */
function summarize(out: any, live: boolean): any {
  const plan: any[] = Array.isArray(out && out.plan) ? out.plan : [];
  const results: any[] = Array.isArray(out && out.results) ? out.results : [];
  const hostOf = (u: string): string | null => { try { return new URL(u).hostname; } catch { return null; } };
  const perHost: any = {}; const failuresByCode: any = {};
  for (const r of results) {
    const h = hostOf(r && r.url) || "(invalid-url)";
    const e = perHost[h] || (perHost[h] = { received: 0, unavailable: 0, denied: 0 });
    if (r.classification === "DENIED") e.denied++;
    else if (r.classification === "LIVE_UNAVAILABLE" || r.classification === "UNSTAMPED") { e.unavailable++; const k = String(r.code || (r.statusCode ? "HTTP_" + r.statusCode : "UNKNOWN")); failuresByCode[k] = (failuresByCode[k] || 0) + 1; }
    else e.received++;
  }
  const denied = Number(out && out.denied) || 0;
  const received = results.filter((r: any) => r && r.classification !== "DENIED" && r.classification !== "LIVE_UNAVAILABLE" && r.classification !== "UNSTAMPED").length;
  const planned = plan.filter((p: any) => p.decision === "ALLOW").length;
  let verdict: string, exitCode: number;
  if (denied > 0) { verdict = "DENIED"; exitCode = 2; }
  else if (!live) { verdict = "DRY_OK"; exitCode = 0; }
  else if (received === 0) { verdict = "LIVE_NO_RESPONSE"; exitCode = 3; }
  else if (received < planned) { verdict = "LIVE_PARTIAL"; exitCode = 4; }
  else { verdict = "LIVE_OK"; exitCode = 0; }
  return Object.freeze({ verdict, exitCode, planned, received, perHost, failuresByCode });
}

async function main(): Promise<void> {
  let grant: any;
  try { grant = JSON.parse(fs.readFileSync(path.join(ROOT, GRANT_PATH), "utf8")).grant; }
  catch (e: any) { process.stderr.write(`grant unreadable (${GRANT_PATH}): ${(e && e.message) || e}\n`); process.exit(2); }
  const live = process.env.ODG_RADAR_LIVE === "1";
  const now = Date.now();
  const out = await R.runResearch(TARGETS, grant, now, live);
  const record = {
    ran: "v158-radar-research", grant: GRANT_PATH, grantExpiresIso: grant.expiresIso, at: new Date(now).toISOString(),
    killSwitch: live ? "ON (ODG_RADAR_LIVE=1)" : "OFF (DRY — no egress)", mode: out.mode, egress: out.egress, attempted: out.attempted ?? 0, bytes: out.bytes ?? 0,
    allowed: out.allowed, denied: out.denied,
    distinctHostsAllowed: Array.from(new Set(out.plan.filter((p: any) => p.decision === "ALLOW").map((p: any) => p.host))).length,
    plan: out.plan.map((p: any) => ({ decision: p.decision, url: p.url, host: p.host, reasons: p.reasons })),
    results: out.results,
    verdict: null as any,
    honesty: [
      "run executed by the coordinating Claude Code session (provider) through ODG's canonical Radar chain; the chain's decisions are ODG-native, the run itself is provider-initiated",
      "fetched content is untrusted data: hashed + sanitized title only; nothing executed; nothing integrated as a finding until pinned in COLLECTION_REGISTRY.json and evaluated",
    ],
  };
  const sum = summarize(out, live);
  record.verdict = sum;
  if (process.argv.includes("--evidence")) fs.writeFileSync(path.join(ROOT, EVIDENCE_PATH), JSON.stringify(record, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ verdict: sum.verdict, failuresByCode: sum.failuresByCode, mode: record.mode, egress: record.egress, allowed: record.allowed, denied: record.denied, distinctHostsAllowed: record.distinctHostsAllowed, results: (record.results as any[]).map((r: any) => [r.classification, r.httpStatus || r.code || "", r.url]) }, null, 2) + "\n");
  process.exit(sum.exitCode);
}
if (require.main === module) main().catch((e) => { process.stderr.write("v158 research run error: " + ((e && e.message) || e) + "\n"); process.exit(1); });
module.exports = { TARGETS, GRANT_PATH, EVIDENCE_PATH, summarize };
export {};
