#!/usr/bin/env node

/*
 * Mission Contract Factory (TypeScript port; parity with runtime/core/mission-contract-factory.js).
 *
 * Roadmap → missing Mission Contracts: reads the manifest, detects entries whose contract is absent/
 * objectiveless, GENERATES a complete Mission-Loader-conformant contract per gap (reusing mission-
 * synthesizer.toContract as the ONE schema source), validates it with the same structural guard, and
 * (by default) writes it to runtime/missions/<id>.json. Deterministic + idempotent: buildContract is a
 * pure function of the entry (no wall-clock, no randomness); the only writes live in generateMissing /
 * generateForMission and are disabled by {write:false}. Strict port: all 13 exports, the mission
 * classification (STRONG/WEAK delivery vs OBSERVATION vs fail-closed UNKNOWN), the authorized-path
 * precedence, the probe-intent + observability + autonomy-eligibility declarations, and the on-demand
 * policy/env gate are preserved EXACTLY. deps=1 mission-synthesizer (already TS, co-located in dist).
 * The historical .js remains the behavioural reference.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const synth = require("./mission-synthesizer");

const ROADMAP_REL = path.join("runtime", "governance", "ROADMAP.json");
const MISSIONS_REL = path.join("runtime", "missions");
const POLICIES_REL = path.join("runtime", "policies", "runtime-policies.json");

const LIFECYCLE_STATES = [
  "CREATED",
  "QUALIFIED",
  "ANALYZED",
  "PLANNED",
  "PREPARED",
  "VALIDATED",
  "EXECUTED",
  "VERIFIED",
  "RELEASED",
  "ARCHIVED",
];

const CONTRACT_POLICIES = ["DETERMINISM_FIRST", "REUSE_BEFORE_CREATE", "LOCAL_FIRST"];

const CONTRACT_EVIDENCE = [
  "runtime/generated/mission-plan.json",
  "runtime/generated/mission-report.json",
  "runtime/generated/mission-ledger.json",
];

function readJson(file: any): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const ENGINEERING_INTENT = [
  "ENGINEERING", "IMPLEMENT", "FIX", "REPAIR", "REFACTOR",
  "BUILD", "CREATE", "GENERATE", "MIGRATE", "ENABLE", "EVOLVE", "SCAFFOLD", "INTEGRATE",
];
const ENGINEERING_INTENT_RE = new RegExp(`\\b(${ENGINEERING_INTENT.join("|")})\\b`, "i");

// Read-only PROBE intent: liveness/health/diagnostic missions that observe-and-report and apply NO patch.
// Used ONLY as a WEAK (inferred) OBSERVATION signal, consulted after every delivery signal has been ruled
// out — so it can never reclassify a mission that declares or implies engineering (fail-closed preserved).
const OBSERVATION_INTENT_RE = /\b(health[- ]?check|healthcheck|health|liveness|readiness|heartbeat|status[- ]?check|self[- ]?check|self[- ]?diagnostics?|diagnostics?|diagnose|probe)\b/i;

function entryText(entry: any): string {
  return [entry.id, entry.title, entry.goal, entry.description]
    .filter((s: any) => typeof s === "string")
    .join(" ");
}

const PROBE_INTENT = [
  {
    match: /\b(connectivity|internet|online)\b/i,
    probes: [{ capability: "Internet reachable (Connectivity Audit)", evidence: "internet-reachable" }],
  },
  {
    match: /\bexternal research\b|\bresearch acquisition\b|\bEXTERNAL_RESEARCH\b/i,
    probes: [{ capability: "External research acquired (verified per-source provenance)", evidence: "research-acquired" }],
  },
  {
    match: /\bbranch integration\b|\bfast[- ]forward\b|\bGIT_BRANCH_INTEGRATION\b|\bintegrate .*branch\b/i,
    probes: [{ capability: "Governed git branch integration (local, ff-only, C03-verified)", evidence: "git-branch-integrated" }],
  },
  {
    match: /\bbash\b|\bshell command\b|\blinux command\b|\brun (a |the )?command\b|\bBASH_COMMAND\b/i,
    probes: [{ capability: "Governed bash/linux command (no raw shell, sandboxed, C03-verified)", evidence: "bash-command-governed" }],
  },
];

const OBSERVABILITY_VERIFY_INTENT = /\bgoverned dashboard\b|\bautonomy observability\b|\bdashboard & autonomy\b|\bGOVERNED_DASHBOARD_OBSERVABILITY\b/i;

function resolveVerifyProbes(entry: any): any {
  const text = entryText(entry);
  const out = [];
  const seen = new Set();
  for (const rule of PROBE_INTENT) {
    if (!rule.match.test(text)) continue;
    for (const p of rule.probes) {
      if (seen.has(p.evidence)) continue;
      seen.add(p.evidence);
      out.push({ capability: p.capability, evidence: p.evidence });
    }
  }
  return out;
}

const OBSERVATION_MODES = ["AUDIT", "READ_ONLY", "ANALYZE"];

function explicitAuthorizedPaths(entry: any): any {
  if (Array.isArray(entry.authorized_paths)) return entry.authorized_paths;
  if (Array.isArray(entry.authorizedPaths)) return entry.authorizedPaths;
  return null;
}

function classifyMission(entry: any): any {
  const text = entryText(entry);
  const mode = String(entry.mode || "").toUpperCase();
  const paths = explicitAuthorizedPaths(entry);
  const objectives = Array.isArray(entry.objectives) ? entry.objectives : [];
  const doneText = ([] as any[])
    .concat(Array.isArray(entry.done_when) ? entry.done_when : [])
    .concat(Array.isArray(entry.definition_of_done) ? entry.definition_of_done : [])
    .filter((s: any) => typeof s === "string")
    .join(" ");

  // 1. STRONG DELIVERY — explicit write intent.
  const strongDelivery = [];
  if (entry.requiresEngineering === true || entry.requires_engineering === true) strongDelivery.push("explicit requires_engineering:true");
  if (paths && paths.length > 0) strongDelivery.push("explicit non-empty authorized_paths");
  if (ENGINEERING_INTENT.includes(mode)) strongDelivery.push(`engineering mode:${mode}`);
  if (objectives.some((o: any) => o && (o.patch || o.edits || (Array.isArray(o.files) && o.files.length > 0)))) strongDelivery.push("objective declares a patch/edits/files");
  if (strongDelivery.length > 0) return { missionClass: "DELIVERY", classBasis: strongDelivery };

  // 2. STRONG OBSERVATION — explicit read-only declaration.
  const observation = [];
  if (OBSERVATION_MODES.includes(mode)) observation.push(`observation mode:${mode}`);
  if (entry.requiresEngineering === false || entry.requires_engineering === false) observation.push("explicit requires_engineering:false");
  if (paths && paths.length === 0) observation.push("explicit empty authorized_paths (deliberate read-only)");
  if (objectives.some((o: any) => o && typeof o.proof === "string" && o.proof.length > 0)) observation.push("declared per-objective proof");
  if (observation.length > 0) return { missionClass: "OBSERVATION", classBasis: observation };

  // 3. WEAK DELIVERY — inferred only when nothing was declared either way.
  const weakDelivery = [];
  if (ENGINEERING_INTENT_RE.test(text)) weakDelivery.push("engineering-intent keyword (inferred)");
  if (synth.derivePaths(text).length > 0 || synth.derivePaths(doneText).length > 0) weakDelivery.push("names a concrete file target (inferred)");
  if (weakDelivery.length > 0) return { missionClass: "DELIVERY", classBasis: weakDelivery };

  // 3b. WEAK OBSERVATION — inferred read-only PROBE (health / liveness / diagnostic) with NO delivery signal.
  // Reached ONLY after every delivery signal (explicit AND inferred) has been ruled out, so it can never
  // override a mission that declares or implies engineering. A pure liveness/health/diagnostic probe applies
  // no patch; classifying it OBSERVATION lets the Validation Engine accept its observable result instead of
  // demanding "Authorized patch applied". Fail-closed is preserved for genuinely UNKNOWN missions below.
  const weakObservation = [];
  if (OBSERVATION_INTENT_RE.test(text)) weakObservation.push("read-only probe keyword (inferred: health/liveness/diagnostic; no delivery signal)");
  if (weakObservation.length > 0) return { missionClass: "OBSERVATION", classBasis: weakObservation };

  // 4. UNKNOWN — no signal either way. Fail closed.
  return {
    missionClass: "UNKNOWN",
    classBasis: ["no explicit engineering or read-only declaration; delivery intent cannot be confirmed from id/title alone — fail-closed to evidence-required so a no-op cannot reach SUCCESS"],
  };
}

function resolveEngineering(entry: any): boolean {
  return classifyMission(entry).missionClass !== "OBSERVATION";
}

function isOnDemandEnabled(root: any = process.cwd()): boolean {
  const env = process.env.ODG_CONTRACT_ON_DEMAND;
  if (typeof env === "string" && env.length > 0) {
    return !(env === "0" || env.toLowerCase() === "false");
  }
  const policies = readJson(path.join(root, POLICIES_REL));
  return !!(policies && policies.contractOnDemand && policies.contractOnDemand.enabled === true);
}

function readRoadmap(root: any): any {
  const manifest = readJson(path.join(root, ROADMAP_REL));
  const missions = manifest && Array.isArray(manifest.missions) ? manifest.missions : [];
  return missions.filter((m: any) => m && typeof m.id === "string");
}

function contractPathFor(root: any, entry: any): any {
  const rel =
    typeof entry.contract === "string" && entry.contract.trim()
      ? entry.contract
      : path.join(MISSIONS_REL, `${entry.id}.json`);
  return path.join(root, rel);
}

function isContractMissing(root: any, entry: any): boolean {
  const raw = readJson(contractPathFor(root, entry));
  if (raw === null) return true;
  return !(Array.isArray(raw.objectives) && raw.objectives.length > 0);
}

function derivePathScope(entry: any): any {
  return synth.derivePaths(entryText(entry));
}

function buildContract(entry: any): any {
  const classification = classifyMission(entry);
  const engineering = classification.missionClass !== "OBSERVATION";

  const explicitPaths = Array.isArray(entry.authorized_paths)
    ? entry.authorized_paths
    : Array.isArray(entry.authorizedPaths)
      ? entry.authorizedPaths
      : null;
  let authorizedPaths;
  if (explicitPaths) {
    authorizedPaths = explicitPaths;
  } else {
    const derived = derivePathScope(entry);
    authorizedPaths = derived.length ? derived : (engineering ? ["runtime/**"] : []);
  }

  const goal = String(entry.title || entry.goal || entry.id);
  const doneWhen = [
    `Objective "${goal}" satisfied.`,
    "Validation Engine reports success.",
    engineering ? "Authorized patch applied." : "Read-only evidence produced.",
  ];

  const base = synth.toContract({
    id: entry.id,
    goal,
    priority: entry.priority || "NORMAL",
    mode: entry.mode || (engineering ? "ENGINEERING" : "READ_ONLY"),
    authorizedPaths,
    doneWhen,
    description:
      entry.description ||
      `Auto-generated contract for roadmap mission ${entry.id} (${goal}).`,
  });

  // B140 — observability-verification binding.
  if (OBSERVABILITY_VERIFY_INTENT.test(entryText(entry))) {
    base.objectives[0].id = "VERIFY_OBSERVABILITY_1";
    base.objectives[0].proof = "autonomy-observability-verified";
  }

  // P1 (B143) — conservative autonomy-eligibility declaration per objective.
  for (const obj of base.objectives) {
    if (!obj || typeof obj !== "object" || obj.authorization) continue;
    obj.authorization = engineering
      ? { eligible: true, authorized: true }
      : { excluded: true, reason: "read-only/analysis objective — not ODG-authored engineering work; excluded from the autonomy denominator" };
  }

  const objectiveId = base.objectives[0].id;
  const verify = resolveVerifyProbes(entry);

  return {
    ...base,
    ...(verify.length ? { verify } : {}),
    authorizedPaths,
    status: "AUTHORIZED",
    completion: ["Release Manager decision is RELEASE."],
    permissions: {
      engineering,
      authorizedPaths,
      network: false,
    },
    lifecycle: LIFECYCLE_STATES.slice(),
    policies: CONTRACT_POLICIES.slice(),
    evidence: CONTRACT_EVIDENCE.slice(),
    checkpoints: [
      { id: `${objectiveId}__PLANNED`, when: "mission-plan.json generated" },
      { id: `${objectiveId}__VALIDATED`, when: "Validation Engine reports success" },
      { id: `${objectiveId}__RELEASED`, when: "mission ledger entry proven" },
    ],
    ledger: { mission: entry.id, capability: entry.id, status: "PENDING", proven: false },
    missionClass: classification.missionClass,
    classBasis: classification.classBasis,
    source: "mission-contract-factory",
    generatedBy: "mission-contract-factory",
  };
}

function humanizeId(id: any): string {
  return String(id || "")
    .replace(/[_\-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c: any) => c.toUpperCase());
}

function generateMissing(root: any = process.cwd(), options: any = {}): any {
  const write = options.write !== false;
  const roadmap = readRoadmap(root);
  const report: any = { roadmap: roadmap.map((e: any) => e.id), generated: [], skipped: [], invalid: [] };

  for (const entry of roadmap) {
    if (!isContractMissing(root, entry)) {
      report.skipped.push(entry.id);
      continue;
    }
    const contract = buildContract(entry);
    if (!synth.isValidContract(contract)) {
      report.invalid.push(entry.id);
      continue;
    }
    const target = contractPathFor(root, entry);
    if (write) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(contract, null, 2) + "\n");
    }
    report.generated.push({ mission: entry.id, path: path.relative(root, target) });
  }

  return report;
}

function generateForMission(root: any = process.cwd(), missionId?: any, options: any = {}): any {
  const write = options.write !== false;
  const entryLike = { id: missionId };
  const target = contractPathFor(root, entryLike);
  const rel = path.relative(root, target);

  if (!isContractMissing(root, entryLike)) {
    return { mission: missionId, path: rel, generated: false, reused: true, contract: readJson(target) };
  }

  const roadmapEntry = readRoadmap(root).find((e: any) => e.id === missionId);
  const entry = roadmapEntry || {
    id: missionId,
    title: humanizeId(missionId),
    ...(options.hints && typeof options.hints === "object" ? options.hints : {}),
  };

  const contract = buildContract(entry);
  if (!synth.isValidContract(contract)) {
    return { mission: missionId, path: rel, generated: false, reused: false, invalid: true, contract: null };
  }

  if (write) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(contract, null, 2) + "\n");
  }
  return { mission: missionId, path: rel, generated: true, reused: false, contract };
}

module.exports = {
  readRoadmap,
  contractPathFor,
  isContractMissing,
  resolveVerifyProbes,
  derivePathScope,
  classifyMission,
  buildContract,
  generateMissing,
  generateForMission,
  isOnDemandEnabled,
  humanizeId,
  LIFECYCLE_STATES,
  CONTRACT_POLICIES,
  CONTRACT_EVIDENCE,
};

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (readJson,
// entryText, classifyMission helpers, ...) are module-scoped, not global script scope (TS2393 guard).
export {};
