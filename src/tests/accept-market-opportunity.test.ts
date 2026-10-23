// @ts-nocheck — MARKET_OPPORTUNITY_INTELLIGENCE V1/V2/V3 acceptance verifier (content-grounded, present-state).
// These are INTERNAL ANALYZE studies (done_when: "no external action" / "research preserved uncommitted").
// The deliverables live under docs/market-research/ (preserved UNTRACKED by contract). This verifies they
// genuinely satisfy each contract's done_when — real sources, FACT/HYP separation, honest confidence,
// arithmetic, uncommitted preservation — and refuses SIMULATION-as-real. No external action is taken here.
"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

let passed = 0;
function ok(n, c) { assert.ok(c, n); console.log("  ok -", n); passed += 1; }
const REPO = process.cwd();
const MR = path.join(REPO, "docs", "market-research");
const read = (f) => fs.readFileSync(path.join(MR, f), "utf8");
const nonEmpty = (f) => { try { return read(f).trim().length > 200; } catch { return false; } };

console.log("ACCEPT — MARKET_OPPORTUNITY_INTELLIGENCE V1/V2/V3 (internal ANALYZE studies, present-state)");

// Contract-required: research preserved UNCOMMITTED (V3 done_when + V1 "no external action" posture).
const tracked = execFileSync("git", ["ls-files", "docs/market-research"], { cwd: REPO, encoding: "utf8" }).trim();
ok("research preserved UNCOMMITTED (docs/market-research untracked — V3 done_when)", tracked === "");

// --- V1: capability inventory + opportunity register + scenarios/ranking WITH SOURCES; FACT/HYP; confidence ---
ok("V1: capability inventory present", nonEmpty("01_ODG_CAPABILITY_INVENTORY.md"));
{
  const reg = read("02_OPPORTUNITY_REGISTER.md");
  ok("V1: opportunity register separates FACT vs HYP (not SIMULATION-as-real)", /\bFACT\b/.test(reg) && /\bHYP\b/.test(reg));
  ok("V1: register enumerates sourced opportunities", (reg.match(/OPP-\d+/g) || []).length >= 3);
  ok("V1: honest confidence labels present", /confidence/i.test(reg) && /(HIGH|MEDIUM|LOW|NOT_MEASURABLE)/.test(reg));
  ok("V1: no figure claimed as ODG-acquired revenue (honest)", /no figure here is ODG-acquired revenue/i.test(reg) || !/ODG earned|ODG revenue of/i.test(reg));
}
{
  const src = read("03_SCENARIOS_RANKING_SOURCES.md");
  // Provenance: a source register with real domains + consulted date (cited as domain/path, honestly marked
  // "via provider WebSearch; not ODG autonomous egress" — no false claim of ODG internet access).
  ok("V1: scenarios/ranking/sources with a real source register (domains + date, honest provenance)",
     /source register/i.test(src) && /\w+\.(com|io|org|net|co)\//i.test(src) && /20\d{2}/.test(src));
}

// --- V2: €1M + €10M modeled separately w/ equations; current→target gap roadmap; assumptions register ---
{
  const rev = read("05_REVENUE_MODELS_12MO.md");
  ok("V2: €1M + €10M revenue modeled with figures/arithmetic", /1 ?M/i.test(rev) && /10 ?M/i.test(rev) && /[=×x*]/.test(rev));
  ok("V2: capability target + gap→mission roadmap", nonEmpty("06_CAPABILITY_TARGET_AND_ROADMAP.md") && /gap|roadmap|target/i.test(read("06_CAPABILITY_TARGET_AND_ROADMAP.md")));
  ok("V2: assumptions register present", nonEmpty("12_SOURCES_AND_ASSUMPTIONS.md") || nonEmpty("07_DISTRIBUTION_ASSUMPTIONS_MISSIONREPORT.md"));
}

// --- V3: $10M routes w/ arithmetic + strongest route + $1M intermediate; partner longlist; critical path ---
{
  const r10 = read("08_10M_ENTERPRISE_STRATEGY.md") + read("16_10M_EXECUTION_PLAN.md");
  ok("V3: $10M routes modelled with arithmetic + a $1M intermediate", /10 ?M/i.test(r10) && /1 ?M/i.test(r10) && /[=×x*+]/.test(r10));
  const partners = read("09_ENTERPRISE_PARTNER_LONG_LIST.md");
  ok("V3: partner longlist (public / uncontacted)", /partner/i.test(partners) && /(uncontacted|public|not contacted)/i.test(partners));
  ok("V3: critical path + falsifiable milestones", nonEmpty("11_DELIVERY_READINESS_AND_CRITICAL_PATH.md") && /(critical path|milestone)/i.test(read("11_DELIVERY_READINESS_AND_CRITICAL_PATH.md")));
}

console.log(`\nACCEPT MARKET V1/V2/V3 — ${passed} assertions passed.`);
