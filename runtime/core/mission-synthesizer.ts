#!/usr/bin/env node

/*
 * P5 — Local Mission Synthesizer (TypeScript port; parity with runtime/core/mission-synthesizer.js).
 *
 * Turns a natural-language request into a Mission-Loader contract (objectives[], authorized_paths,
 * definition_of_done) WITHOUT any AI — purely by fixed, ordered, DETERMINISTIC string rules + the P4
 * Decision Rules (decision-rules, already TS, co-located in dist; deps=1). PURE (plain objects in → out;
 * no clock, no randomness, no I/O). Strict port: all 7 exports (toContract, fromRequest, isValidContract,
 * slug, decompose, derivePaths, isSpecProductionIntent), the EN+FR action-verb lexicons, the ordered
 * decomposition (multi-line > enumerated > conjunction, every-clause-starts-with-a-verb guard), the scope
 * grounding (derivePaths), the patch/goals/doneWhen precedence, the deterministic objective ids, the
 * ODG_SPEC_ routing + central verify-block injection, and the structural validator are preserved EXACTLY.
 * The historical .js remains the behavioural reference; several orchestration consumers depend on this API.
 */

"use strict";

const rules = require("./decision-rules");

function slug(text: any, fallback?: any): any {
  const s = String(text || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
  return s || fallback;
}

// Imperative action verbs that mark the start of an independent action (guard for the conjunction split).
const ENGLISH_ACTION_VERBS = [
  "add", "remove", "delete", "drop", "fix", "repair", "refactor", "implement",
  "create", "build", "wire", "generate", "migrate", "enable", "disable",
  "integrate", "update", "upgrade", "write", "rename", "move", "extract",
  "introduce", "replace", "document", "test", "validate", "verify", "configure",
  "install", "setup", "register", "expose", "support", "scaffold", "connect",
  "split", "merge", "clean", "cleanup", "optimize", "harden", "audit",
  "format", "lint", "run", "check", "ensure", "emit", "record", "log",
  "print", "load", "parse", "normalize", "compute", "resolve", "apply",
  "bump", "deprecate", "restore", "rollback", "archive", "publish", "deploy",
  "report", "analyze", "analyse", "review", "assess", "investigate", "explore",
  "research", "discover", "diagnose", "describe", "summarize", "decompose",
  "understand", "determine", "measure", "inspect", "evaluate", "plan", "design", "propose",
];

// FR — the runtime receives natural-language objectives in FRENCH (diacritic-folded lexicon).
const FRENCH_ACTION_VERBS = [
  "audite", "auditer", "analyse", "analyser", "examine", "examiner", "inspecte", "inspecter",
  "evalue", "evaluer", "investigue", "investiguer", "explore", "explorer", "recherche", "rechercher",
  "etudie", "etudier", "diagnostique", "diagnostiquer", "comprends", "comprendre", "identifie", "identifier",
  "planifie", "planifier", "concois", "concevoir", "propose", "proposer", "decompose", "decomposer",
  "decoupe", "decouper",
  "implemente", "implementer", "corrige", "corriger", "repare", "reparer", "ajoute", "ajouter",
  "cree", "creer", "ecris", "ecrire", "developpe", "developper", "integre", "integrer", "cable", "cabler",
  "construis", "construire", "modifie", "modifier", "supprime", "supprimer", "retire", "retirer",
  "remplace", "remplacer", "renomme", "renommer", "deplace", "deplacer", "migre", "migrer",
  "active", "activer", "desactive", "desactiver", "genere", "generer", "refactorise", "refactoriser",
  "realise", "realiser", "installe", "installer", "nettoie", "nettoyer", "optimise", "optimiser",
  "durcis", "durcir", "renforce", "renforcer",
  "teste", "tester", "valide", "valider", "verifie", "verifier", "controle", "controler",
  "certifie", "certifier", "assure", "assurer",
  "rapporte", "rapporter", "redige", "rediger", "documente", "documenter", "decris", "decrire",
  "resume", "resumer", "produis", "produire", "presente", "presenter", "liste", "lister",
  "execute", "executer", "lance", "lancer", "applique", "appliquer", "traite", "traiter",
  "poursuis", "poursuivre", "continue", "continuer", "reprends", "reprendre", "restaure", "restaurer",
  "configure", "configurer",
];

const ACTION_VERBS = [...ENGLISH_ACTION_VERBS, ...FRENCH_ACTION_VERBS];

function stripListMarker(line: any): string {
  return String(line).replace(/^\s*(?:[-*•]|\(\d+\)|\d+[.)])\s+/, "");
}

function foldDiacritics(s: any): string {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function startsWithActionVerb(clause: any): boolean {
  const folded = foldDiacritics(String(clause).trim().toLowerCase());
  const first = (folded.match(/^[a-z]+/) || [""])[0];
  return ACTION_VERBS.includes(first);
}

function splitEnumerated(line: any): string[] {
  const markerRe = /(?:^|\s)(?:\(\d+\)|\d+[.)])\s+/g;
  const markerCount = (line.match(markerRe) || []).length;
  if (markerCount < 2) return [];
  return line.split(markerRe).map((s: any) => s.trim()).filter(Boolean);
}

function splitConjunctions(line: any): string[] {
  const clauses = line
    .split(/\s*(?:,\s*and\s+|,\s*then\s+|,\s*et\s+|,\s*puis\s+|,\s*ensuite\s+|,\s+|\s+and\s+|\s+then\s+|\s+et\s+|\s+puis\s+|\s+ensuite\s+|\s*;\s*)/i)
    .map((s: any) => s.trim())
    .filter(Boolean);
  if (clauses.length < 2) return [];
  return clauses.every(startsWithActionVerb) ? clauses : [];
}

/*
 * Decompose a goal into an ordered list of independent action strings. Strongest structural signal first.
 */
function decompose(goal: any): string[] {
  const raw = String(goal || "");
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const lines = raw.split(/\r?\n/).map((l: any) => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const items = lines.map(stripListMarker).map((s: any) => s.trim()).filter(Boolean);
    if (items.length >= 2) return items;
  }

  const enumerated = splitEnumerated(trimmed);
  if (enumerated.length >= 2) return enumerated;

  const conjunctions = splitConjunctions(trimmed);
  if (conjunctions.length >= 2) return conjunctions;

  return [trimmed];
}

/*
 * Derive an authorized-path SCOPE from the path-like tokens a text names (separator + extension).
 */
function derivePaths(text: any): string[] {
  const re = /[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(String(text || ""))) !== null) {
    const tok = m[0];
    if (!tok.includes("/") || seen.has(tok)) continue;
    seen.add(tok);
    out.push(tok);
  }
  return out;
}

function makeObjective(id: any, goal: any, doneWhen: any, patch: any): any {
  const objective: any = { id, goal, done_when: doneWhen };
  if (patch && typeof patch === "object") objective.patch = patch;
  return objective;
}

function toContract(spec: any): any {
  const id = spec.id || slug(spec.goal, "SYNTH_MISSION");
  const authorizedPaths = Array.isArray(spec.authorizedPaths)
    ? spec.authorizedPaths
    : derivePaths([spec.goal, spec.description].filter((s: any) => typeof s === "string").join(" "));
  const hasPatch = !!(spec.patch && typeof spec.patch === "object");
  const doneWhen = Array.isArray(spec.doneWhen) && spec.doneWhen.length
    ? spec.doneWhen
    : hasPatch
      ? ["Patch applied.", "Validation successful."]
      : ["Validation successful."];

  let actions;
  if (Array.isArray(spec.goals) && spec.goals.length) {
    actions = spec.goals.map((g: any) => String(g == null ? "" : g).trim()).filter(Boolean);
  } else {
    actions = decompose(spec.goal);
  }
  if (actions.length === 0) actions = [spec.goal || ""];
  if (hasPatch && actions.length > 1) actions = [spec.goal || ""];
  if (actions.length === 1 && !(Array.isArray(spec.goals) && spec.goals.length)) {
    actions = [spec.goal || ""];
  }

  const baseId = slug(id, "OBJ");
  const objectives = actions.map((goal: any, i: number) => {
    const objId = i === 0 && spec.objectiveId ? spec.objectiveId : `${baseId}_${i + 1}`;
    return makeObjective(objId, goal, doneWhen, hasPatch ? spec.patch : undefined);
  });

  const contract: any = {
    mission: id,
    priority: spec.priority || "NORMAL",
    mode: spec.mode || "SEQUENTIAL",
    requires_engineering: authorizedPaths.length > 0,
    authorized_paths: authorizedPaths,
    description: spec.description || spec.goal || "",
    objectives,
    definition_of_done: doneWhen,
    source: "mission-synthesizer",
  };
  // η3-B49 — CENTRALIZED self-verification: a contract whose FIRST objective routes to ODG Spec Author
  // (id prefix "ODG_SPEC_") declares the spec-schema-valid proof here, at the single common generator.
  if (objectives[0] && typeof objectives[0].id === "string" && objectives[0].id.startsWith("ODG_SPEC_")) {
    contract.verify = [{ capability: "ODG Spec Author", evidence: "spec-schema-valid" }];
  }
  return contract;
}

// η3-B45 — recognize an EXPLICIT specification-production intent (conservative; full word "specification").
function isSpecProductionIntent(text: any): boolean {
  return /\b(produce|generate|author|create|write|draft|compose)\b[^.?!]*\bspecification\b/i.test(String(text || ""));
}

// Naive NL → spec: keep the raw request as the goal; consult P4 rules for the implied local capability/fixers.
function fromRequest(text: any, extra?: any): any {
  const template = rules.match(text);
  const spec: any = {
    id: slug(text, "REQUEST_MISSION"),
    goal: String(text || ""),
    ...(extra || {}),
  };
  // η3-B45 — ROUTE an explicit specification-production request to ODG Spec Author (ODG_SPEC_ first-id).
  if (!spec.objectiveId && isSpecProductionIntent(spec.goal)) {
    spec.objectiveId = "ODG_SPEC_" + slug(spec.goal, "SPEC");
  }
  const contract = toContract(spec);
  contract.resolvedCapability = template ? template.capability : null;
  contract.resolvedFixers = template ? template.fixers : null;
  return contract;
}

// Minimal structural validator — the same invariants the Mission Loader enforces.
function isValidContract(c: any): boolean {
  return !!(
    c &&
    typeof c.mission === "string" &&
    Array.isArray(c.objectives) &&
    c.objectives.length > 0 &&
    typeof c.objectives[0].id === "string" &&
    typeof c.objectives[0].goal === "string"
  );
}

module.exports = { toContract, fromRequest, isValidContract, slug, decompose, derivePaths, isSpecProductionIntent };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal names (slug helpers,
// decompose helpers, ACTION_VERBS, ...) are module-scoped, not global script scope (TS2393 guard).
export {};
