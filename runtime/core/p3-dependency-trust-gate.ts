#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 14 (P3 excellence) — AI-SUGGESTED DEPENDENCY TRUST GATE. PURE, deterministic. World reference: in 2026 only
 * ~1 in 5 dependency versions recommended by AI coding assistants are safe to use, and agentic supply-chain attacks
 * (typosquatting, unpinned ranges, malicious transitive deps) are rising (Cloud Security Alliance; Cloudsmith 2026 —
 * "static SBOMs → agentic governance"). ODG's P3 had SBOM/secret/injection scanning + license-policy, but no gate that
 * vets a SUGGESTED dependency BEFORE install. This adds it, fail-closed, REUSING license-policy.classifyLicense (no
 * second license engine): ADMIT only when the version is EXACT-pinned, the license is commercially safe, an integrity
 * hash is present, and the name is not a typosquat of a known package. Any doubt ⇒ REJECT. Dual export.
 */

const LICENSE = require("./license-policy");

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }

// Exact-pin = a concrete version, NOT a range/tag. Reject ^, ~, *, x-ranges, "latest", ">=", "||", ranges.
function isExactPin(version: any): boolean {
  if (!isStr(version)) return false;
  const v = version.trim();
  if (/[\^~*<>| ]|x|latest|\.\.|\s-\s/i.test(v)) return false;
  return /^\d+\.\d+\.\d+([-+][0-9A-Za-z.-]+)?$/.test(v);   // semver exact
}

// Levenshtein distance (bounded, small strings).
function lev(a: string, b: string): number {
  const m = a.length, n = b.length; const d: number[][] = [];
  for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// A small set of well-known package names for typosquat detection (name within edit-distance 1 but NOT equal ⇒ suspicious).
const KNOWN_POPULAR = Object.freeze(["react", "lodash", "express", "axios", "chalk", "commander", "webpack", "typescript", "eslint", "jest", "next", "vue", "moment", "dotenv", "request", "colors"]);

function typosquatOf(name: any): string | null {
  if (!isStr(name)) return null;
  const n = name.trim().toLowerCase();
  if (KNOWN_POPULAR.includes(n)) return null;              // exact match of a known name is fine
  for (const k of KNOWN_POPULAR) if (lev(n, k) === 1) return k;   // one edit away from a popular name ⇒ likely typosquat
  return null;
}

/** vetDependency(dep) -> { admit, decision, reasons }. Fail-closed: ADMIT only if ALL checks pass. */
function vetDependency(dep: any): any {
  const d = isObj(dep) ? dep : {};
  const reasons: string[] = [];
  if (!isStr(d.name)) reasons.push("missing dependency name");
  if (!isExactPin(d.version)) reasons.push(`version not exact-pinned (got ${JSON.stringify(d.version)}; ranges/tags rejected)`);
  const lic = LICENSE.classifyLicense(isStr(d.license) ? d.license : "");
  // To BUNDLE a dependency into a product, proprietary redistribution must be strictly OK (true). GPL/AGPL have
  // commercialUseOk=true but proprietaryRedistribution=false (can't ship in a closed product); weak-copyleft is
  // "conditional" (needs review). Fail-closed: admit only permissive/public-domain (proprietaryRedistribution===true).
  if (lic.proprietaryRedistribution !== true || lic.known !== true) reasons.push(`license not safe to bundle (family ${lic.family}; proprietaryRedistribution=${JSON.stringify(lic.proprietaryRedistribution)})`);
  if (!isStr(d.integrity)) reasons.push("no integrity hash (sha) — cannot verify the artifact");
  const squat = typosquatOf(d.name);
  if (squat) reasons.push(`name '${d.name}' is one edit from popular package '${squat}' (possible typosquat)`);
  const admit = reasons.length === 0;
  return Object.freeze({ admit, decision: admit ? "ADMIT" : "REJECT", license: Object.freeze({ family: lic.family, proprietaryRedistribution: lic.proprietaryRedistribution }), typosquatOf: squat, reasons: Object.freeze(reasons) });
}

const P3_DEP_TRUST_CONTRACT = Object.freeze({
  id: "V124-P3-DEPENDENCY-TRUST-GATE",
  source: "SÉRIE 14 P3 — vet an AI-suggested dependency before install (~1/5 AI-suggested deps safe, 2026)",
  reference: Object.freeze({ findings: ["~1 in 5 AI-suggested dependency versions are safe (2026)", "agentic supply-chain: typosquatting + unpinned ranges"], sources: Object.freeze(["Cloud Security Alliance 2026", "Cloudsmith 2026 supply-chain guide"]) }),
  reuses: Object.freeze(["license-policy.classifyLicense (no second license engine)"]),
  notAuthority: "a pre-install trust gate; it installs nothing and runs no network",
  invariants: Object.freeze([
    "ADMIT only when ALL pass: exact-pinned version + commercially-safe known license + integrity hash + not a typosquat",
    "a version range/tag (^, ~, *, latest, >=) is REJECTED — exact pin required (fail-closed)",
    "a name one edit from a known popular package ⇒ possible typosquat ⇒ REJECT",
    "reuses license-policy (fail-closed on unknown license); no second license engine",
  ]),
});

module.exports = { isExactPin, typosquatOf, vetDependency, P3_DEP_TRUST_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P3_DEP_TRUST_CONTRACT, demo: vetDependency({ name: "lodash", version: "4.17.21", license: "MIT", integrity: "sha512-abc" }) }, null, 2) + "\n"); }

export {};
