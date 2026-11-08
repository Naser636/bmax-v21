#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 23 / WAVE-8 (P3/P8 supply-chain — world-research gap) — SLSA BUILD-LEVEL GATE (anti level-inflation). PURE,
 * deterministic. World reference: SLSA v1.1 Security Levels + v1.0 Verifying-artifacts + slsa-verifier — the build
 * track is LEVEL-GRADED (L1 provenance exists; L2 build platform signs it + consumer validates authenticity against
 * the EXPECTED builder; L3 hardened/isolated builder, built from attributed clean source). Verification adjudicates
 * predicate PROPERTIES against a required level + a trusted builder identity, not a bare signature. ODG can MINT an
 * in-toto/SLSA statement carrying a self-declared slsaLevelClaim but NOTHING verifies the claimed level is earned —
 * verifyStatement checks only signature + digest + SBOM rebind, never builder or level (grep-verified: the only
 * slsaLevel occurrence is a hardcoded mint-side string literal, never read back; no builder allowlist). This derives
 * the ACHIEVED level from evidence and ADMITs only if achieved ≥ required. Composes supply-chain-attest.verifyStatement
 * (L2 signature/digest/SBOM) + build-pipeline.isReproducible (L3 hermeticity) + a trusted-builder allowlist. The
 * self-declared claim is NEVER trusted — it is adjudicated. Fail-closed: any absent signal caps the level. Dual export.
 */

const ATTEST = require("./supply-chain-attest");       // verifyStatement — L2 signature + artifact digest + SBOM rebind
const BUILD = require("./build-pipeline");             // isReproducible — L3 hermeticity/reproducibility signal

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }
const UNTRUSTED_BUILDERS = new Set(["local", "self", "", "localhost", "unknown"]);

/**
 * assessSlsaLevel({ statement, envelope, publicKeyPem, requiredLevel, trustedBuilders, actor, artifactBytes, sbom, buildSpec, reproducible })
 * -> { verdict, achievedLevel, requiredLevel, claimedLevel, checks, reasons }. verdict: ADMIT | DENY_LEVEL_INFLATION | DENY.
 * Derives the achieved level MONOTONICALLY from evidence (each level needs every lower level's requirement). Fail-closed.
 */
function assessSlsaLevel(input: any): any {
  const o = isObj(input) ? input : {};
  const statement = isObj(o.statement) ? o.statement : null;
  const requiredLevel = Number.isInteger(o.requiredLevel) ? o.requiredLevel : 1;
  const trusted = new Set((Array.isArray(o.trustedBuilders) ? o.trustedBuilders : []).map(String));
  const actor = isStr(o.actor) ? o.actor : null;
  const reasons: string[] = []; const checks: any = {};
  const predicate = statement && isObj(statement.predicate) ? statement.predicate : {};
  const claimedLevel = predicate.slsaLevelClaim !== undefined ? predicate.slsaLevelClaim : null;

  // L1 — a well-formed provenance statement (subject digest + predicate present).
  const subj = statement && Array.isArray(statement.subject) ? statement.subject[0] : null;
  const l1 = !!(statement && isObj(subj) && isObj(subj.digest) && isStr(subj.digest.sha256) && isObj(statement.predicate));
  checks.l1 = l1; if (!l1) reasons.push("L1 fail: no well-formed provenance statement (subject digest + predicate)");

  // L2 — signature + artifact digest + SBOM rebind verify AND builder.id is a named TRUSTED builder (not local/self/actor).
  let l2 = false;
  if (l1) {
    const v = ATTEST.verifyStatement(statement, o.envelope, o.publicKeyPem, { artifactBytes: o.artifactBytes, sbom: o.sbom });
    checks.verify = v.ok ? "ok" : v.reason;
    const builderId = isObj(predicate.builder) && isStr(predicate.builder.id) ? predicate.builder.id : (isStr(predicate.builder) ? predicate.builder : null);
    const builderTrusted = isStr(builderId) && !UNTRUSTED_BUILDERS.has(String(builderId).toLowerCase()) && builderId !== actor && trusted.has(builderId);
    checks.builderTrusted = builderTrusted;
    l2 = v.ok && builderTrusted;
    if (!v.ok) reasons.push(`L2 fail: ${v.reason}`);
    if (!builderTrusted) reasons.push(`L2 fail: builder '${builderId}' not a named trusted builder (or is local/self/actor)`);
  }

  // L3 — L2 AND source attributed + clean tree AND reproducible/hermetic.
  let l3 = false;
  if (l2) {
    const sourceAttributed = isStr(predicate.sourceCommit) && predicate.treeDirty !== true;
    const reproducible = o.reproducible === true || (isObj(o.buildSpec) && BUILD.isReproducible(o.buildSpec) === true);
    checks.sourceAttributed = sourceAttributed; checks.reproducible = reproducible;
    l3 = sourceAttributed && reproducible;
    if (!sourceAttributed) reasons.push("L3 fail: source not attributed (missing sourceCommit) or dirty tree");
    if (!reproducible) reasons.push("L3 fail: build not reproducible/hermetic");
  }

  const achievedLevel = l3 ? 3 : l2 ? 2 : l1 ? 1 : 0;   // monotone — a higher level requires every lower one
  const verdict = achievedLevel >= requiredLevel ? "ADMIT" : (achievedLevel < requiredLevel && claimedLevel !== null ? "DENY_LEVEL_INFLATION" : "DENY");
  if (verdict !== "ADMIT") reasons.push(`achieved L${achievedLevel} < required L${requiredLevel} (self-declared claim '${claimedLevel}' is NOT trusted)`);

  return Object.freeze({ verdict, achievedLevel, requiredLevel, claimedLevel, checks: Object.freeze(checks), reasons: Object.freeze(reasons) });
}

const SLSA_LEVEL_GATE_CONTRACT = Object.freeze({
  id: "V124-P8-SLSA-LEVEL-GATE",
  source: "SÉRIE 23/W8 P3/P8 — SLSA build-level verification / anti level-inflation (SLSA v1.1 Levels; slsa-verifier)",
  reuses: Object.freeze(["supply-chain-attest.verifyStatement (L2 signature+digest+SBOM)", "build-pipeline.isReproducible (L3 hermeticity)", "trusted-builder allowlist (expected-builder rule)"]),
  notAuthority: "adjudicates the ACHIEVED SLSA level from evidence; it mints nothing and signs nothing",
  invariants: Object.freeze([
    "the self-declared slsaLevelClaim is NEVER trusted — the achieved level is derived from evidence and adjudicated against it",
    "level is monotone: L2 requires L1; L3 requires L2 — any absent/unverifiable/self-asserted signal CAPS the achieved level",
    "L2 requires verifyStatement ok AND builder.id ∈ trustedBuilders and not local/self/actor (SLSA expected-builder)",
    "L3 requires L2 AND attributed clean source (sourceCommit + not treeDirty) AND reproducible/hermetic",
    "achieved < required with a present claim ⇒ DENY_LEVEL_INFLATION; malformed ⇒ L0 ⇒ DENY; pure/deterministic, no network/secrets",
  ]),
});

module.exports = { assessSlsaLevel, SLSA_LEVEL_GATE_CONTRACT };

if (require.main === module) {
  const demo = assessSlsaLevel({ statement: { subject: [{ digest: { sha256: "abc" } }], predicate: { slsaLevelClaim: "L3", builder: { id: "local" } } }, requiredLevel: 3, trustedBuilders: ["github-hosted"] });
  process.stdout.write(JSON.stringify({ ...SLSA_LEVEL_GATE_CONTRACT, demo: { verdict: demo.verdict, achievedLevel: demo.achievedLevel } }, null, 2) + "\n");
}

export {};
