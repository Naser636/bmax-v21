#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V71 (Chantier 4) — SELF-REPLICATION GUARD. Fills the one PARTIAL cell of the V67 agentic-risk coverage:
 * a dedicated detector for self-replication / uncontrolled spawn (a Berkeley Agentic Profile hazard). DENY-BY-DEFAULT:
 * a spawn request is admitted ONLY when it carries an external authorization, stays within an authorized spawn budget,
 * respects a bounded depth, and is NOT self-targeting (an agent spawning a copy of its own identity). It decides nothing
 * about integration (ODG does); it classifies+gates. PURE/deterministic; composes the deny-by-default + authority
 * discipline (no new primitive). Dual export. Fail-closed on malformed input. Run via its test.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function num(v: any, d: number): number { return typeof v === "number" && isFinite(v) ? v : d; }

const DECISION = Object.freeze({ ALLOW: "ALLOW", DENY: "DENY" });

/*
 * assessSpawn(request, policy) -> { decision, selfReplication, reasons }. request:
 *   { spawnerId, childId, currentDepth, currentSpawnCount, authorization:{approved,by} }
 * policy: { maxDepth, maxSpawnCount }. Fail-closed: malformed ⇒ DENY.
 */
function assessSpawn(request: any, policy: any = {}): any {
  const reasons: string[] = [];
  if (!isObj(request) || typeof request.spawnerId !== "string" || typeof request.childId !== "string") {
    return Object.freeze({ decision: DECISION.DENY, selfReplication: false, reasons: ["malformed spawn request — DENY (fail-closed)"] });
  }
  const maxDepth = num(policy.maxDepth, 3);
  const maxSpawnCount = num(policy.maxSpawnCount, 8);
  const depth = num(request.currentDepth, 0);
  const count = num(request.currentSpawnCount, 0);
  const auth = isObj(request.authorization) ? request.authorization : {};

  // SELF-REPLICATION = the spawner tries to spawn a child with its OWN identity (a self-copy) or a self-authorized clone.
  const selfCopy = request.childId === request.spawnerId;
  const selfAuthorizedClone = selfCopy && auth.by === request.spawnerId;
  if (selfCopy) reasons.push("self-replication: child identity == spawner identity (self-copy) — DENY");
  if (selfAuthorizedClone) reasons.push("self-authorized self-copy (authorizer == spawner) — DENY (no self-promotion)");

  // uncontrolled spawn = depth/count beyond the authorized bound.
  if (depth >= maxDepth) reasons.push(`spawn depth ${depth} >= maxDepth ${maxDepth} — DENY (bounded recursion)`);
  if (count >= maxSpawnCount) reasons.push(`spawn count ${count} >= maxSpawnCount ${maxSpawnCount} — DENY (spawn budget)`);

  // deny-by-default authorization: an external (non-self) approval is required to spawn at all.
  const externallyAuthorized = auth.approved === true && typeof auth.by === "string" && auth.by.length > 0 && auth.by !== request.spawnerId;
  if (!externallyAuthorized) reasons.push("no external authorization for spawn — DENY (deny-by-default)");

  const decision = (reasons.length === 0) ? DECISION.ALLOW : DECISION.DENY;
  return Object.freeze({ decision, selfReplication: selfCopy, reasons: Object.freeze(reasons.length ? reasons : ["bounded, externally-authorized, non-self spawn ⇒ ALLOW"]) });
}

const SELF_REPLICATION_GUARD_CONTRACT = Object.freeze({
  id: "V71-SELF-REPLICATION-GUARD", source: "CTO V71 Chantier 4 — dedicated self-replication / uncontrolled-spawn detector (Berkeley Agentic hazard)",
  reuses: Object.freeze(["deny-by-default + external-authorization discipline (action-gate / root-of-trust pattern)"]),
  decisions: Object.values(DECISION),
  notAuthority: "a spawn gate; it admits/denies a spawn, it integrates nothing (ODG decides); never a new authority",
  invariants: Object.freeze([
    "deny-by-default: a spawn is DENIED unless externally authorized, bounded (depth+count), and non-self",
    "self-copy (child id == spawner id) ⇒ DENY; a self-authorized clone ⇒ DENY (no self-promotion)",
    "uncontrolled recursion/volume (depth≥max or count≥max) ⇒ DENY",
    "pure/deterministic; malformed input ⇒ DENY (fail-closed)",
  ]),
});

module.exports = { DECISION, assessSpawn, SELF_REPLICATION_GUARD_CONTRACT };
if (require.main === module) { process.stdout.write(JSON.stringify(SELF_REPLICATION_GUARD_CONTRACT, null, 2) + "\n"); }
export {};
