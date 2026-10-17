#!/usr/bin/env node
/*
 * LOT nl-objective-gateway — EQUIVALENCE (historical runtime/core/nl-objective-gateway.js vs compiled .ts).
 *
 * Offline, deterministic, PURE (compile() has no clock/random/network; its only reads are the repo policy
 * files via ROOT). build:runtime compiles the .ts → runtime/dist/core. Each scenario calls the SAME public
 * API (compile + classifyObjective + normalizeObjective + deriveIntent + detectAmbiguity + extractConstraints
 * + buildWorkgraph + probeForCapability) on BOTH modules and asserts BYTE-IDENTICAL JSON.
 *
 * KEY correctness (the V71 __dirname→dist fix): the compiled module runs from runtime/dist/core yet MUST read
 * the policy files from the SOURCE tree (ROOT = repoRoot(__dirname) maps dist→repo). provider-policy.json has
 * externalProvidersEnabled:true (NON-default), so a broken dist ROOT (reading a nonexistent dist path ⇒ null
 * ⇒ default false) would make compile() DIFFER from source — this bench would FAIL. Byte-identical ⇒ the ROOT
 * fix works end-to-end.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/nl-objective-gateway-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "nl-objective-gateway.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "nl-objective-gateway.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT nl-objective-gateway — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/nl-objective-gateway.js present");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/nl-objective-gateway.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
const API = ["compile", "classifyObjective", "normalizeObjective", "deriveIntent", "detectAmbiguity", "extractConstraints", "buildWorkgraph", "probeForCapability"];
check(API.every((k) => typeof js[k] === "function") && !!js.CAPABILITY_PROBE, "JS exports full API");
check(API.every((k) => typeof ts[k] === "function") && !!ts.CAPABILITY_PROBE, "compiled TS exports full API");
check(JSON.stringify(js.CAPABILITY_PROBE) === JSON.stringify(ts.CAPABILITY_PROBE), "CAPABILITY_PROBE byte-identical");

// Representative objectives (FR + EN, single/multi/ambiguous/empty) — compile() full projection.
const OBJECTIVES = [
  "créer une page de contact pour le site",
  "build a REST API and write tests for it",
  "corriger le bug de connexion puis déployer",
  "do something",
  "",
  "analyse les logs, génère un rapport et envoie-le par email",
  "add a dark mode toggle to the settings page",
  "faire une sauvegarde de la base de données",
];
for (const obj of OBJECTIVES) {
  const j = js.compile(obj);
  const t = ts.compile(obj);
  check(JSON.stringify(j) === JSON.stringify(t), `compile("${obj.slice(0, 32)}") byte-identical (incl. policy-derived fields)`);
}

// compile() with explicit opts override (bypasses the policy read path).
for (const flag of [true, false]) {
  check(JSON.stringify(js.compile("créer une page", { externalProvidersEnabled: flag })) ===
        JSON.stringify(ts.compile("créer une page", { externalProvidersEnabled: flag })),
    `compile(opts.externalProvidersEnabled=${flag}) byte-identical`);
}

// Pure helpers directly.
for (const obj of OBJECTIVES) {
  const norm_j = js.normalizeObjective(obj), norm_t = ts.normalizeObjective(obj);
  check(norm_j === norm_t, `normalizeObjective("${obj.slice(0, 24)}") identical`);
  check(JSON.stringify(js.classifyObjective(obj)) === JSON.stringify(ts.classifyObjective(obj)), `classifyObjective("${obj.slice(0, 24)}") identical`);
  check(JSON.stringify(js.detectAmbiguity(norm_j)) === JSON.stringify(ts.detectAmbiguity(norm_t)), `detectAmbiguity("${obj.slice(0, 24)}") identical`);
  check(JSON.stringify(js.extractConstraints(norm_j)) === JSON.stringify(ts.extractConstraints(norm_t)), `extractConstraints("${obj.slice(0, 24)}") identical`);
}
for (const cap of ["ENGINEERING", "RESEARCH", "UNKNOWN", "DEPLOYMENT"]) {
  check(JSON.stringify(js.probeForCapability(cap)) === JSON.stringify(ts.probeForCapability(cap)), `probeForCapability("${cap}") identical`);
}
check(JSON.stringify(js.buildWorkgraph(["o1", "o2", "o3"])) === JSON.stringify(ts.buildWorkgraph(["o1", "o2", "o3"])), "buildWorkgraph identical");

// Explicit proof the policy-derived field flows through compile() (externalProvidersEnabled:true from the
// SOURCE policy file) on the COMPILED module — i.e. ROOT mapped dist→source correctly.
{
  const j = js.compile("créer une page de contact");
  const t = ts.compile("créer une page de contact");
  const flat = JSON.stringify(t);
  check(flat === JSON.stringify(j) && flat.includes("true"), "compiled-TS compile() reflects source policy (ROOT mapped dist→source)");
}

console.log(failures === 0 ? "ALL PASS — LOT nl-objective-gateway EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
