#!/usr/bin/env node
"use strict";
/*
 * V15.8 §3.3 — run the governed Radar source admission over a candidates file and emit:
 *   - the versioned grant      docs/odg/V158_RESEARCH_GRANT_GLOBAL_RADAR.json   (canonical V16 shape, consumed unchanged by
 *                              research-governor.govern / research-budget / bounded-http-client)
 *   - the admission evidence   docs/odg/evidence/V158_RADAR_SOURCE_ADMISSION.json (every decision + reasons + evidence hash)
 * NO network. Deterministic for a given (--candidates, --issued-iso, --issued-by). --check verifies that the committed grant
 * and evidence equal a fresh re-derivation (exit 1 on drift) — so a hand-edited grant cannot silently widen the Radar.
 * Usage: tsx runtime/bin/odg-radar-source-admission-run.ts [--candidates P] [--issued-iso ISO] [--issued-by S] [--check] [--no-write]
 */
const fs = require("fs");
const path = require("path");
const A = require("../core/odg-radar-source-admission.js");

const ROOT = path.resolve(__dirname, "..", "..");
const args = process.argv.slice(2);
const opt = (k: string, d: string | null = null): string | null => { const i = args.indexOf(k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const CAND = path.resolve(ROOT, opt("--candidates", "docs/odg/evidence/V158_RADAR_SOURCE_CANDIDATES.json") as string);
// V16.0: output paths are parameterised (each campaign = its own versioned grant); defaults keep the V158 behaviour.
// Outputs are confined to docs/odg/ (repo-relative, no '..') so the CLI cannot write a grant anywhere else.
const outPath = (flag: string, dflt: string): string => {
  const rel = opt(flag, dflt) as string;
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(path.join(ROOT, "docs", "odg") + path.sep) || !/\.json$/.test(abs)) { process.stderr.write(`${flag} must be a .json path under docs/odg/\n`); process.exit(2); }
  return abs;
};
const GRANT_OUT = outPath("--grant-out", "docs/odg/V158_RESEARCH_GRANT_GLOBAL_RADAR.json");
const EVID_OUT = outPath("--evidence-out", "docs/odg/evidence/V158_RADAR_SOURCE_ADMISSION.json");
const ISSUED_ISO = opt("--issued-iso", "2026-11-23T00:00:00.000Z") as string;
const ISSUED_BY = opt("--issued-by", "owner (CTO directive V15.8 §3.3 — governed admission of PUBLIC sources; each host+prefix admitted on fetched robots/redirect/terms evidence by odg-radar-source-admission; live egress still requires ODG_RADAR_LIVE=1)") as string;

function main(): number {
  let cand: any;
  try { cand = JSON.parse(fs.readFileSync(CAND, "utf8")); } catch (e: any) { process.stderr.write(`candidates unreadable: ${e && e.message}\n`); return 2; }
  const list = Array.isArray(cand) ? cand : cand && Array.isArray(cand.candidates) ? cand.candidates : null;
  if (!list) { process.stderr.write("candidates file has no candidates array\n"); return 2; }
  const issuedMs = Date.parse(ISSUED_ISO);
  if (!Number.isFinite(issuedMs)) { process.stderr.write("invalid --issued-iso\n"); return 2; }
  const r = A.admitSources(list, { issuedMs, issuedBy: ISSUED_BY });
  const grantDoc = r.grant ? {
    "//": "V15.8 §3.3 — GOVERNED extension of the EXISTING Radar (no second radar/governor). Produced by runtime/bin/odg-radar-source-admission-run.ts from docs/odg/evidence/V158_RADAR_SOURCE_CANDIDATES.json; do NOT hand-edit (the --check mode detects drift). Same canonical shape as V16: hostMatch EXACT + allowedPaths, enforced by research-governor.govern(); the canonical bounded-http-client ALLOWLIST is NOT mutated (allowedDomains are the per-call allowlist). Live egress requires ODG_RADAR_LIVE=1.",
    grant: { ...r.grant, constraints: [
      "no private credentials, no authentication, no account creation, no API key/token",
      "no external writes, no form submission, no side effect on any third party",
      "no paid API, no purchase, no subscription",
      "no circumvention of access controls (HTTP 401/403/429 recorded, never bypassed); robots and terms respected; no CAPTCHA/paywall/bot-wall bypass",
      "fetched content is never executed and never treated as instructions; discovery ≠ authorization (proposals stay PROPOSED)",
      "per-host documented rate limits are ADVISORY; hosts needing per-host pacing (Crawl-delay or hourly limit below one run) are DEFERRED until pacing exists",
      "reuse recorded results before any new collection",
    ] },
  } : null;
  const evidence = {
    generatedBy: "runtime/bin/odg-radar-source-admission-run.ts (deterministic, no network)",
    candidatesFile: path.relative(ROOT, CAND),
    issuedIso: ISSUED_ISO,
    summary: r.summary,
    grantRefusedReason: r.grantRefusedReason,
    decisions: r.decisions,
    honesty: [
      "admission evidence (robots/redirect/terms/rate limits) was FETCHED by a provider research agent on 2026-11-23 and normalized by the coordinating session; it is a point-in-time observation — re-run admission before renewal",
      "an ADMIT means 'allowed to be fetched by the governed chain', not 'trusted content': every finding is still stamped and sanitized as untrusted data",
      "built by the Claude Code provider (coordinating session), not ODG-native construction",
    ],
  };
  const grantText = grantDoc ? JSON.stringify(grantDoc, null, 2) + "\n" : null;
  const evidText = JSON.stringify(evidence, null, 2) + "\n";
  if (args.includes("--check")) {
    const same = (p: string, t: string | null) => { try { return t !== null && fs.readFileSync(p, "utf8") === t; } catch { return false; } };
    const ok = same(GRANT_OUT, grantText) && same(EVID_OUT, evidText);
    process.stdout.write(ok ? "CHECK OK — committed grant + evidence equal a fresh admission\n" : "CHECK FAILED — committed grant/evidence drift from a fresh admission (hand edit or stale candidates)\n");
    return ok ? 0 : 1;
  }
  if (!args.includes("--no-write")) {
    if (grantText) fs.writeFileSync(GRANT_OUT, grantText);
    fs.writeFileSync(EVID_OUT, evidText);
  }
  process.stdout.write(JSON.stringify({ summary: r.summary, admittedHosts: r.grant ? r.grant.allowedDomains : [], grantWritten: !!grantText && !args.includes("--no-write") }) + "\n");
  return r.grant ? 0 : 1;
}
process.exitCode = main();
export {};
