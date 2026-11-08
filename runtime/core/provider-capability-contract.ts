#!/usr/bin/env node
"use strict";

/*
 * V5 / FIED-05 (Multi-Intelligence Orchestrator — provider capability contract, FIED §4). PURE, deterministic. Before
 * ODG may use any specialized engine/provider (search, code/architecture analysis, dependency analysis, authorized
 * reverse-engineering, reasoning/constraint-solving, test generation, simulation, security/adversarial, independent
 * verification — via MCP/CLI/API), that provider MUST DECLARE its capabilities, limits, prerequisites, permissions,
 * side-effects, provenance and usage conditions (§4). This contract validates the declaration and arbitrates use:
 * a provider is ADMISSIBLE only if fully declared; ODG may USE it for a capability ONLY if that capability is declared
 * AND the required permissions are a subset of what ODG granted AND there is no undeclared side-effect. A provider
 * NEVER self-authorizes — ODG remains the sole coordinator/arbiter. A provider's declaration is UNTRUSTED input (a
 * claim), never a privileged instruction. Fail-closed: undeclared ⇒ DENY. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function isStr(v: any): boolean { return typeof v === "string" && v.length > 0; }

// the §4 mandatory declaration fields.
const REQUIRED_DECL = Object.freeze(["id", "capabilities", "permissions", "sideEffects", "provenance"]);

/** assessProvider(declaration) -> { admissible, missing, reasons }. A provider is ADMISSIBLE only if fully declared. */
function assessProvider(declaration: any): any {
  const d = isObj(declaration) ? declaration : {};
  const missing = REQUIRED_DECL.filter((f) => {
    if (f === "id" || f === "provenance") return !isStr(d[f]);
    return !Array.isArray(d[f]);   // capabilities/permissions/sideEffects must be declared arrays (possibly empty)
  });
  // a provider that declares itself self-authorizing is rejected (ODG is the sole arbiter).
  if (d.selfAuthorizes === true) return Object.freeze({ admissible: false, missing: Object.freeze(missing), reasons: Object.freeze(["provider declares selfAuthorizes ⇒ REJECTED (ODG is the sole coordinator/arbiter)"]) });
  const admissible = missing.length === 0;
  return Object.freeze({ admissible, missing: Object.freeze(missing), reasons: Object.freeze(admissible ? ["fully declared (capabilities/permissions/side-effects/provenance) ⇒ admissible"] : [`under-declared provider: missing ${missing.join(", ")} ⇒ not admissible (fail-closed)`]) });
}

/**
 * canUse(declaration, { requiredCapability, grantedPermissions }) -> { allowed, reason }.
 * ODG may use the provider ONLY if: admissible AND the capability is declared AND required permissions ⊆ granted AND
 * no undeclared side-effect beyond what ODG accepts. Fail-closed: any gap ⇒ DENY. A provider never self-authorizes.
 */
function canUse(declaration: any, opts: any): any {
  const d = isObj(declaration) ? declaration : {};
  const o = isObj(opts) ? opts : {};
  const assess = assessProvider(d);
  if (!assess.admissible) return deny(`provider not admissible (${assess.reasons[0]})`);
  const cap = o.requiredCapability;
  if (!isStr(cap) || !arr(d.capabilities).map(String).includes(cap)) return deny(`capability '${cap}' not declared by the provider ⇒ DENY`);
  // required permissions for this capability must be a subset of what ODG granted.
  const declaredPerms = new Set(arr(d.permissions).map(String));
  const granted = new Set(arr(o.grantedPermissions).map(String));
  const needed = Array.from(declaredPerms);                    // the provider's declared permissions are what it needs
  const ungranted = needed.filter((p) => !granted.has(p));
  if (ungranted.length > 0) return deny(`provider requires permissions not granted by ODG: ${ungranted.join(", ")} ⇒ DENY`);
  // any side-effect the provider declares must be explicitly accepted by ODG.
  const accepted = new Set(arr(o.acceptedSideEffects).map(String));
  const unaccepted = arr(d.sideEffects).map(String).filter((s) => !accepted.has(s));
  if (unaccepted.length > 0) return deny(`provider has side-effects ODG has not accepted: ${unaccepted.join(", ")} ⇒ DENY`);
  return Object.freeze({ allowed: true, reason: `capability '${cap}' declared + permissions granted + side-effects accepted ⇒ ODG may use this provider (ODG remains the arbiter)` });
}

function deny(reason: string): any { return Object.freeze({ allowed: false, reason }); }

const PROVIDER_CAPABILITY_CONTRACT = Object.freeze({
  id: "V5-FIED-PROVIDER-CAPABILITY-CONTRACT",
  source: "ODG FIED §4 — Multi-Intelligence Orchestrator provider capability contract",
  requiredDeclaration: REQUIRED_DECL,
  reuses: Object.freeze(["arbitrated by ODG (capability-router is the selection layer); this is the provider admission contract"]),
  notAuthority: "validates a provider's declaration + arbitrates use; the provider NEVER self-authorizes, ODG remains the sole arbiter",
  invariants: Object.freeze([
    "a provider is ADMISSIBLE only if it declares capabilities + permissions + side-effects + provenance + id (§4)",
    "ODG may USE a provider for a capability ONLY if it is declared AND required permissions ⊆ granted AND side-effects accepted",
    "a provider that declares selfAuthorizes is REJECTED — ODG is the sole coordinator/arbiter",
    "a provider declaration is UNTRUSTED input (a claim), never a privileged instruction",
    "fail-closed: under-declared / undeclared capability / ungranted permission / unaccepted side-effect ⇒ DENY; pure/deterministic",
  ]),
});

module.exports = { assessProvider, canUse, PROVIDER_CAPABILITY_CONTRACT };

if (require.main === module) {
  const decl = { id: "rea", capabilities: ["code-analysis"], permissions: ["read-source"], sideEffects: [], provenance: "morluto/rea", limits: ["no-binary-exec"] };
  const demo = { admissible: assessProvider(decl).admissible, allowed: canUse(decl, { requiredCapability: "code-analysis", grantedPermissions: ["read-source"] }).allowed, deniedUngranted: canUse(decl, { requiredCapability: "code-analysis", grantedPermissions: [] }).allowed };
  process.stdout.write(JSON.stringify({ ...PROVIDER_CAPABILITY_CONTRACT, demo }, null, 2) + "\n");
}

export {};
