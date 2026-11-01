#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Dedicated ADVERSARIAL unit proof for the actor-provenance resolver (the only
// attribution module, previously tested only via the ledger integration). Pure, hermetic: no fs/clock/net.
// CTO Mission 2: negative tests for forged / missing / mismatched / substituted / delegation-lost / malformed
// attribution, plus positive tests so legitimate execution is NOT wrongly rejected. Fixes only demonstrated
// defects — this suite demonstrates the module is already fail-closed, so it adds tests, not source changes.
"use strict";
const assert = require("assert");
const AP = require("./actor-provenance.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass += 1; };
const pe = (mission, executed) => ({ mission, executed }); // minimal patch-execution shape

console.log("actor-provenance — adversarial resolver proof");

// ───────── POSITIVE: legitimate attribution must NOT be rejected ─────────
ok("ODG: concordant ODG_CAPABILITY + ODG_EXECUTOR ⇒ ODG", AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }]), "M").actor === "ODG");
ok("ODG: ODG_RULES + ODG_EXECUTOR ⇒ ODG", AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_RULES", appliedBy: "ODG_EXECUTOR" }]), "M").actor === "ODG");
ok("TECHNICAL_PROVIDER: PROVIDER author ⇒ provider (never ODG)", AP.resolveMissionActor(pe("M", [{ authoredBy: "PROVIDER", appliedBy: "ODG_EXECUTOR" }]), "M").actor === "TECHNICAL_PROVIDER");
ok("TECHNICAL_PROVIDER: LOCAL_PROVIDER reconciled to provider", AP.resolveMissionActor(pe("M", [{ authoredBy: "LOCAL_PROVIDER" }]), "M").actor === "TECHNICAL_PROVIDER");
ok("HUMAN: humanMandatory ⇒ HUMAN", AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR", humanMandatory: true }]), "M").actor === "HUMAN");
ok("HUMAN: OPERATOR/CONTRACT authors ⇒ HUMAN", AP.resolveMissionActor(pe("M", [{ authoredBy: "OPERATOR" }]), "M").actor === "HUMAN" && AP.resolveMissionActor(pe("M", [{ authoredBy: "CONTRACT" }]), "M").actor === "HUMAN");
ok("concordant multi-entry same actor ⇒ that actor + audit trail", (() => { const r = AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "ODG_RULES", appliedBy: "ODG_EXECUTOR" }]), "M"); return r.actor === "ODG" && typeof r.executedBy === "string" && r.executedBy.includes("authoredBy=ODG_CAPABILITY"); })());

// ───────── FORGED actor identity: claim ODG authorship WITHOUT the ODG_EXECUTOR applied-sentinel ⇒ demoted, never ODG ─────────
ok("FORGED: ODG_CAPABILITY but appliedBy != ODG_EXECUTOR ⇒ NOT ODG (null)", AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "SOMETHING_ELSE" }]), "M").actor === null);
ok("FORGED: ODG author, appliedBy absent ⇒ NOT ODG (demoted)", AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_CAPABILITY" }]), "M").actor === null);
ok("FORGED entry-level: resolveEntryActor demotes ODG-authored-not-ODG-applied to null", AP.resolveEntryActor({ authoredBy: "ODG_RULES", appliedBy: "x" }) === null);
ok("FORGED: proven/validated are NEVER read as an actor signal", AP.resolveMissionActor(pe("M", [{ proven: true, validated: true }]), "M").actor === null);

// ───────── MISSING actor identity ─────────
ok("MISSING: entry with no authoredBy ⇒ null", AP.resolveMissionActor(pe("M", [{ appliedBy: "ODG_EXECUTOR" }]), "M").actor === null);
ok("MISSING: empty executed[] ⇒ null (no executed entries)", AP.resolveMissionActor(pe("M", []), "M").actor === null);
ok("MISSING: absent patch-execution ⇒ null (delegation provenance loss)", AP.resolveMissionActor(null, "M").actor === null && AP.resolveMissionActor(undefined, "M").actor === null);

// ───────── MISMATCHED actor / execution context (cross-mission) ─────────
ok("MISMATCH: patch-execution.mission != requested mission ⇒ null (strict ===, cross-mission refused)", AP.resolveMissionActor(pe("OTHER", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }]), "M").actor === null);
ok("MISMATCH reason names cross-mission", /cross-mission/.test(AP.resolveMissionActor(pe("OTHER", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }]), "M").reason));

// ───────── UNAUTHORIZED actor SUBSTITUTION: an unmapped/unknown author beside a concordant ODG entry ⇒ ambiguous, suppress ─────────
ok("SUBSTITUTION: unmapped author 'MYSTERY' beside ODG ⇒ ambiguous, actor:null (ODG never stamped while a sibling is unknown)", AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "MYSTERY" }]), "M").actor === null);
ok("SUBSTITUTION: UNKNOWN sentinel beside ODG ⇒ ambiguous, null + unresolvedCount>0", (() => { const r = AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "UNKNOWN" }]), "M"); return r.actor === null && r.unresolvedCount >= 1; })());
ok("CONTRADICTORY: ODG + PROVIDER distinct resolved actors ⇒ ambiguous, null", AP.resolveMissionActor(pe("M", [{ authoredBy: "ODG_CAPABILITY", appliedBy: "ODG_EXECUTOR" }, { authoredBy: "PROVIDER" }]), "M").actor === null);

// ───────── MALFORMED / inconsistent attribution evidence ⇒ fail-closed ─────────
ok("MALFORMED: non-object patch-execution ⇒ null", AP.resolveMissionActor(42, "M").actor === null && AP.resolveMissionActor("x", "M").actor === null);
ok("MALFORMED: executed not an array ⇒ null (no executed entries)", AP.resolveMissionActor({ mission: "M", executed: "nope" }, "M").actor === null);
ok("MALFORMED: null/garbage entries ⇒ resolveEntryActor null, mission null", AP.resolveEntryActor(null) === null && AP.resolveEntryActor(42) === null && AP.resolveMissionActor(pe("M", [null, 7]), "M").actor === null);

console.log(`\nACTOR-PROVENANCE — ${pass} assertions passed. (forged/missing/mismatched/substituted/delegation-lost/malformed all fail-closed to null; legitimate ODG/provider/human attribution preserved; proven/validated never an actor signal)`);
