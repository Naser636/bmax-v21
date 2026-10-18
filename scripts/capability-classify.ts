#!/usr/bin/env node
"use strict";
/* TS source (tsx-run) of scripts/capability-classify; scripts/capability-classify.js = ODG_RUNTIME=js rollback. */
/*
 * CAPABILITY-COUNT INTEGRITY classifier (CM-4). Read-only over the canonical
 * runtime/generated/capability-registry.json. It does NOT mutate or delete any entry — it exposes what the
 * "capabilities" count ACTUALLY is so the number stops being conflated with business capabilities.
 *
 * Root cause (documented in capability-registry.js:6-14): the registry defines capability ≡ proven mission
 * (runtime-model.js), so capabilities[] is a list of proven-mission-derived NAMES at technical/operational
 * granularity — not a catalogue of distinct business capabilities. This classifier decomposes that list:
 *   - nlGenerated     : NL_* names auto-synthesised from natural-language intents;
 *   - missionDerived  : names prefixed by a mission/engineering verb (IMPLEMENT_, FIX_, AUDIT_, …);
 *   - businessCandidate: the remainder — the real candidates for the ~30 business-capability set.
 * Plus counter-coherence (total === sum of classes) and anti-duplicate detection.
 *
 * Pure function `classify(names)` for deterministic tests; thin main() reads the live registry and prints
 * the honest breakdown. No writes, no secrets.
 */
const fs = require("fs");
const path = require("path");

// Mission/engineering verb or roadmap-phase prefixes — a name starting with one of these is a MISSION name,
// not a business capability. Anchored at start; case-insensitive.
const MISSION_PREFIXES: string[] = [
  "IMPLEMENT_", "FIX_", "ROOT_CAUSE_", "REFACTOR_", "MIGRATE_", "ENABLE_", "BOOTSTRAP_", "AUDIT_", "VERIFY_",
  "DIAGNOSE_", "VALIDATE_", "MEASURE_", "ROADMAP_PHASE", "PHASE_", "DEPLOY", "PROVIDER_", "RUNTIME_",
  "AUTONOM", "SELF_ENGINEER", "PLATFORM_", "REGISTER_", "CERTIFY_", "PREPARE_", "EVOLVE_", "MAKE_", "CLOSE_",
  "RETIRE_", "FINALIZE_", "RESOLVE_", "CONTROL_", "EXECUTE_", "EXPLORE_", "IDENTIFY_", "BUILD_", "UI_",
  "SYSTEM_", "M000", "ACTIVATE_", "ENGINEER_", "PATCH_", "REPAIR_", "CLEAN_", "FINALIZE",
];

function classOf(name: string): string {
  if (/^NL_/i.test(name)) return "nlGenerated";
  const up = String(name).toUpperCase();
  if (MISSION_PREFIXES.some((p) => up.startsWith(p))) return "missionDerived";
  return "businessCandidate";
}

/** Pure classifier. names: string[] → honest decomposition + coherence fields. */
function classify(names: any): any {
  const list = Array.isArray(names) ? names.map(String) : [];
  const buckets: Record<string, string[]> = { nlGenerated: [], missionDerived: [], businessCandidate: [] };
  for (const n of list) buckets[classOf(n)].push(n);
  // anti-duplicate: names appearing more than once.
  const seen = Object.create(null);
  const duplicates: string[] = [];
  for (const n of list) { seen[n] = (seen[n] || 0) + 1; }
  for (const n of Object.keys(seen)) if (seen[n] > 1) duplicates.push(n);
  const total = list.length;
  const businessCandidate = buckets.businessCandidate.length;
  const missionDerived = buckets.missionDerived.length;
  const nlGenerated = buckets.nlGenerated.length;
  return {
    total, businessCandidate, missionDerived, nlGenerated, duplicates: duplicates.sort(),
    coherent: total === businessCandidate + missionDerived + nlGenerated && duplicates.length === 0,
    businessCandidateNames: buckets.businessCandidate.sort(),
  };
}

function readRegistryNames(repoRoot: string): any {
  try {
    const r = JSON.parse(fs.readFileSync(path.join(repoRoot, "runtime", "generated", "capability-registry.json"), "utf8"));
    const caps = Array.isArray(r.capabilities) ? r.capabilities : [];
    return caps.map((c: any) => (typeof c === "string" ? c : c.id || c.name || c.capability || JSON.stringify(c)));
  } catch { return null; }
}

if (require.main === module) {
  const names = readRegistryNames(path.resolve(__dirname, ".."));
  if (!names) { process.stdout.write("capability-classify: no registry readable\n"); process.exit(2); }
  const c = classify(names);
  process.stdout.write(
    `capability-classify: total=${c.total} | businessCandidate=${c.businessCandidate} | missionDerived=${c.missionDerived} | nlGenerated=${c.nlGenerated} | duplicates=${c.duplicates.length} | coherent=${c.coherent}\n`
  );
  process.stdout.write("note: 'capabilities' counts proven-mission-derived names (capability-registry.js:6-14); businessCandidate approximates the ~30 business set.\n");
  process.exit(c.coherent ? 0 : 3);
}
export {};
module.exports = { classify, classOf, readRegistryNames };
