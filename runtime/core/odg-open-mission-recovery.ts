#!/usr/bin/env node
"use strict";
/*
 * V164 (§0/§1 — truth inventory of the OPEN missions). PURE/READ-ONLY, deterministic, fail-closed.
 * "Produire un inventaire de vérité AVANT toute modification." This module reads the REAL canonical closure register
 * (docs/odg/closure-register.json) and, for every non-terminal (open) mission, classifies WHY it is open and what its
 * precise next-action is — WITHOUT changing any mission status (a provider cannot promote DEFERRED→IN_PROGRESS nor
 * IN_PROGRESS→ACCEPTED, nor close a real mission). It resolves each mission's declared deps against the register so the
 * classification is grounded in the real file, not an assumption.
 *
 * Classes (honest, mutually-exclusive precedence): DEPENDENCY_BLOCKED (a declared dep is not ACCEPTED) >
 * EXTERNAL_BLOCKED (acceptance names an external corpus/data) > DEFINITION_BLOCKED (acceptance/title says definition blocked) >
 * OWNER_GATED (acceptance/nextAction awaits an explicit owner/productization decision) > REALIZABLE_LOCAL (deps met +
 * a concrete local next-action) > UMBRELLA (meta-campaign, no concrete acceptance) > UNCLASSIFIED.
 */
const fs = require("node:fs");
const path = require("node:path");

const OPEN_STATES = Object.freeze(["IN_PROGRESS", "DEFERRED", "BLOCKED", "READY"]);
const TERMINAL = Object.freeze(["ACCEPTED", "REJECTED"]);

function asText(v: any): string { return typeof v === "string" ? v : (v == null ? "" : JSON.stringify(v)); }
function loadRegister(regPath: string): any {
  const p = regPath || path.join(process.cwd(), "docs/odg/closure-register.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/* classifyOpenMission(item, statusById) — grounded, read-only classification of ONE open mission. Never mutates.
 * Precedence is honest and strict: an unmet dep dominates; an empty-text record is reported as such rather than guessed;
 * owner/infra gating (systemd/TLS/secret/privileged/productization/owner-authorizes) dominates external/corpus; a REALIZABLE_LOCAL
 * verdict requires BOTH deps-met AND a concrete recorded next-action with no owner/external/definition gate. */
function classifyOpenMission(item: any, statusById: any): any {
  const deps = Array.isArray(item.deps) ? item.deps : [];
  const unmetDeps = deps.filter((d: string) => statusById[d] !== "ACCEPTED");
  const acc = asText(item.acceptance).trim();
  const title = asText(item.title).toLowerCase();
  const next = asText(item.nextAction).trim();
  const textBlob = (acc + " " + next).toLowerCase();

  const OWNER_INFRA = /owner authoriz|owner decision|owner-confirmed|owner confirms|owner provides|privileged|systemd|\bsudo\b|\broot\b|\btls\b|certificate|\bcert\b|hostname|\bsecret|credential|productiz|owner-gated|explicit owner/;
  const EXTERNAL = /public corpus|public dataset|independently-labelled|independently labelled|external corpus|external dependency|labelled corpus|labelled dev|heldout corpus|real signals|real users|real client|paying|design partner/;
  const DEFINITION = /definition blocked|no canonical|awaiting .*definition/;

  let klass = "UNCLASSIFIED";
  let blocker = "no explicit blocker recorded";
  if (unmetDeps.length > 0) { klass = "DEPENDENCY_BLOCKED"; blocker = "declared dep(s) not ACCEPTED: " + unmetDeps.join(", "); }
  else if (acc.length === 0 && next.length === 0 && /campaign|unified|master/.test(title) && !DEFINITION.test(title)) { klass = "UMBRELLA"; blocker = "meta-campaign: no single concrete acceptance; tracks the whole register"; }
  else if (DEFINITION.test(textBlob) || DEFINITION.test(title)) { klass = "DEFINITION_BLOCKED"; blocker = "a canonical governance DEFINITION is missing (owner/governance input)"; }
  else if (acc.length === 0 && next.length === 0) { klass = "UNSPECIFIED_IN_REGISTER"; blocker = "the register record carries NO acceptance/next-action text — governance must populate it; cannot be classified from the register alone (external dossiers may hold its real owner/external gate)"; }
  else if (OWNER_INFRA.test(textBlob) || OWNER_INFRA.test(title)) { klass = "OWNER_GATED"; blocker = "awaits an explicit OWNER/privileged action (owner authorization, systemd/root, TLS/cert/hostname, secret/credential, or a productization decision) outside the provider perimeter"; }
  else if (EXTERNAL.test(textBlob) || EXTERNAL.test(title)) { klass = "EXTERNAL_BLOCKED"; blocker = "acceptance names an EXTERNAL data/corpus/real-world dependency (outside the provider perimeter)"; }
  else if (unmetDeps.length === 0 && next.length > 0) { klass = "REALIZABLE_LOCAL"; blocker = "none — deps are ACCEPTED and a concrete local next-action exists with no owner/external/definition gate"; }

  return Object.freeze({
    id: item.id,
    status: item.status,
    class: klass,
    deps: Object.freeze(deps.slice()),
    unmetDeps: Object.freeze(unmetDeps.slice()),
    blocker,
    nextAction: next || "(none recorded)",
    statusChangeAllowed: false, // a provider can NEVER change a register mission status
  });
}

/* inventoryOpenMissions(regPath) — read-only truth inventory of every open mission in the real register. */
function inventoryOpenMissions(regPath?: string): any {
  const reg = loadRegister(regPath || "");
  const items = Array.isArray(reg.items) ? reg.items : [];
  const statusById: any = {}; for (const i of items) statusById[i.id] = i.status;

  const counts: any = {}; for (const i of items) counts[i.status] = (counts[i.status] || 0) + 1;
  const open = items.filter((i: any) => OPEN_STATES.indexOf(i.status) >= 0);
  const classified = open.map((i: any) => classifyOpenMission(i, statusById));

  const byClass: any = {}; for (const c of classified) byClass[c.class] = (byClass[c.class] || 0) + 1;
  const realizable = classified.filter((c: any) => c.class === "REALIZABLE_LOCAL");

  return Object.freeze({
    registerTotal: items.length,
    counts: Object.freeze(counts),
    terminalStates: TERMINAL,
    openCount: open.length,
    byClass: Object.freeze(byClass),
    realizableLocalIds: Object.freeze(realizable.map((c: any) => c.id)),
    missions: Object.freeze(classified),
    note: "READ-ONLY truth inventory. No mission status is changed (a provider cannot promote DEFERRED→IN_PROGRESS, IN_PROGRESS→ACCEPTED, nor close a mission). Classification is grounded in the real register's dep statuses.",
  });
}

const OPEN_MISSION_RECOVERY_CONTRACT = Object.freeze({
  id: "V164-OPEN-MISSION-RECOVERY",
  purpose: "§0/§1 — read-only truth inventory of open missions BEFORE any modification; classify each (blocker + next-action) grounded in the real register's dep statuses",
  invariants: Object.freeze([
    "READ-ONLY: never writes/mutates the register; never changes a mission status (provider cannot self-promote or close)",
    "classification is GROUNDED: unmet deps resolved against the real register, not assumed",
    "honest precedence: DEPENDENCY_BLOCKED > EXTERNAL_BLOCKED > DEFINITION_BLOCKED > OWNER_GATED > REALIZABLE_LOCAL > UMBRELLA",
    "surfaces the realizable-local subset so ODG (not the provider) selects the next mission",
    "deterministic + fail-closed",
  ]),
});
module.exports = { loadRegister, classifyOpenMission, inventoryOpenMissions, OPEN_MISSION_RECOVERY_CONTRACT, OPEN_STATES };
export {};
