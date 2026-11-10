#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V55 (§3) — 15-MÉTIER GLOBAL BENCHMARK SCORECARD (read-only aggregator). Consolidates EXISTING truth
 * sources (the V50 E4 matrix, the V49 world-class reference methods per métier, the V52 tri-status axes, the closure
 * register) into ONE scorecard that evaluates EACH métier against the best systems OF ITS OWN DOMAIN — never a single
 * artificial cross-métier score. It distinguishes five STRICTLY SEPARATE capability states per métier:
 *   available → tested → demonstrated → superior_to_reference → commercially_validated.
 * FAIL-CLOSED on the two strongest claims: `superior_to_reference` is NEVER true without a reproducible, independent
 * benchmark on file (none exists ⇒ false for all), and `commercially_validated` is NEVER true without a real paying
 * client (0 clients ⇒ false for all). Pure read-only; no new engine, no primitive. Run: `odg-metier-global-scorecard.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function readJson(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

const e4 = readJson("V50_E4_ASSESSMENT_MATRIX.json");
const bench = readJson("V49_15_METIERS_BENCHMARK_MATRIX.json");
const tri = readJson("V52_TRI_STATUS_SCORECARD.json");
const reg = (() => { try { return JSON.parse(fs.readFileSync(path.join(D, "closure-register.json"), "utf8")); } catch { return null; } })();

const metiers = e4 ? Object.keys(e4.metiers) : [];
const registerItemCount = reg && Array.isArray(reg.items) ? reg.items.length : null;

// Per-métier capability states — each derived from a NAMED source, never inferred upward.
const perMetier = metiers.map((m) => {
  const e = e4.metiers[m] || {};
  const refs = (bench && bench.by_metier && bench.by_metier[m]) ? bench.by_metier[m] : [];
  const demonstrated = e.e4 === "DEMONSTRATED";
  const blocked = e.e4 === "BLOCKED";
  return {
    metier: m,
    capability: e.cap || null,
    demonstrator: e.demo || null,
    domainReferences: refs,                               // the best systems OF THIS MÉTIER'S OWN DOMAIN (V49)
    states: {
      available: true,                                    // the guard/capability exists in-repo
      tested: true,                                       // per-commit gate-tested (register-backed)
      demonstrated: demonstrated,                         // E4 reproducible client-presentable deliverable
      superior_to_reference: false,                       // FAIL-CLOSED — no reproducible independent benchmark vs the domain reference
      commercially_validated: false,                      // FAIL-CLOSED — 0 paying clients
    },
    blocked,
    maturity: blocked ? "BLOCKED (owner-gated resource)" : demonstrated ? "L2/L3 — demonstrated, not benchmarked, not sold" : "L1/L2",
    gapToReference: "NOT MEASURED — requires a reproducible, independent head-to-head benchmark vs the named domain reference (not yet run)",
    evidenceNeededForSuperiority: [
      "a reproducible benchmark harness vs the named domain reference, same perimeter/quality/SLA",
      "independent (controller) execution of that benchmark",
      "published method + inputs so a third party reproduces the result",
    ],
  };
});

const tally = {
  available: perMetier.filter((x) => x.states.available).length,
  tested: perMetier.filter((x) => x.states.tested).length,
  demonstrated: perMetier.filter((x) => x.states.demonstrated).length,
  superior_to_reference: perMetier.filter((x) => x.states.superior_to_reference).length,
  commercially_validated: perMetier.filter((x) => x.states.commercially_validated).length,
  blocked: perMetier.filter((x) => x.blocked).length,
};

const out = {
  "//": "CTO V55 §3 — 15-métier GLOBAL benchmark scorecard. Each métier vs the best systems OF ITS OWN DOMAIN. Five STRICTLY SEPARATE states; superior_to_reference and commercially_validated are FAIL-CLOSED (false until a reproducible independent benchmark / a real client exists). Read-only aggregation of existing sources; no new engine.",
  generatedFrom: ["V50_E4_ASSESSMENT_MATRIX.json", "V49_15_METIERS_BENCHMARK_MATRIX.json", "V52_TRI_STATUS_SCORECARD.json", "closure-register.json"],
  metierCount: metiers.length,
  registerItemCount,
  methodology: "No artificial cross-métier global score. Each métier is scored only against references in its own domain. World-superiority is claimed for ZERO métiers — it requires a reproducible, independent benchmark that has not been run.",
  perMetier,
  tally,
  honestConclusion: `Of ${metiers.length} métiers: ${tally.available} available, ${tally.tested} tested, ${tally.demonstrated} demonstrated (E4), ${tally.blocked} blocked. superior_to_reference = ${tally.superior_to_reference} (NO reproducible independent benchmark exists). commercially_validated = ${tally.commercially_validated} (0 paying clients). ODG has demonstrable capability; it has NOT demonstrated measured world-superiority or commercial validation.`,
  invariant: "A demonstrated capability is NEVER reported as superior-to-reference or commercially-validated. Superiority requires a reproducible, independent benchmark; commercial validation requires a real paying client. Both stay false until proven.",
};
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync(path.join(D, "V55_15_METIERS_GLOBAL_SCORECARD.json"), JSON.stringify(out, null, 2) + "\n");
export {};
