#!/usr/bin/env node
"use strict";
/*
 * V327 §7 — PER-MÉTIER CONFIGURATION over the shared transversal base. PURE, deterministic, fail-closed. §7: the 20 métiers
 * are deployed by CONFIGURING the common transversal engines "selon les règles propres à chaque métier" — NOT by rebuilding.
 * This composes: the readiness base (odg-metier-transversal-readiness.TRANSVERSAL), grounded per-métier transversal OVERRIDES
 * where a métier has REAL specific modules (only BTP/M2 today — odg-btp-* billing/retenue/révision/client/suivi), and the
 * métier PRIMARY capability module reused from odg-commercial-metier-matrix (M1–M5). Every métier reuses the SAME base; a
 * configured métier simply swaps in its specific modules where it has them.
 *
 * Honesty: OVERRIDES are grounded in modules verified present (presence injected); a declared override whose module is
 * ABSENT is surfaced as missing (never silently assumed). A métier with neither an override nor a primary is honestly
 * STANDARD_BASE (uses the shared base as-is; not yet specialised). No second roster/engine; no invented métier rules.
 */

const TR = require("./odg-metier-transversal-readiness.js");   // TRANSVERSAL (the shared base)
const CM = require("./odg-commercial-metier-matrix.js");        // COMMERCIAL_METIERS (M1–M5 → primary module)
const PMM = require("./odg-program-metier-matrix.js");          // ROSTER20

function freeze<T>(o: T): T { return Object.freeze(o) as T; }
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }

// Grounded per-métier transversal OVERRIDES (métier-specific modules REPLACING the shared base for a component). Only
// declared where real specific modules exist — today BTP/M2 (verified present 2026-11-20). Others use the shared base.
const TRANSVERSAL_OVERRIDES: Record<string, Record<string, string[]>> = Object.freeze({
  M2: Object.freeze({
    billing: ["odg-btp-billing-engine.ts", "odg-btp-retenue-garantie.ts", "odg-btp-revision-prix.ts", "odg-btp-invoice-schedule.ts"],
    clients: ["odg-btp-client-intake.ts"],
    tracking: ["odg-btp-project-workflow.ts"],
  }),
}) as any;

function primaryOf(metierId: string): string | null {
  const list = Array.isArray(CM.COMMERCIAL_METIERS) ? CM.COMMERCIAL_METIERS : [];
  const m = list.find((x: any) => x && x.id === metierId);
  return m && typeof m.module === "string" ? m.module : null;
}

/**
 * configureMetier(metierId, presentModules) -> { ok, metier, components[], primaryCapability, specialised, status,
 * missingOverrides[] }. Each of the 5 base components resolves to its OVERRIDE modules (if declared + present) or the
 * SHARED canonical modules (present), tagged mode OVERRIDE|SHARED. specialised iff any OVERRIDE component or a primary.
 */
function configureMetier(metierId: any, presentModules: any): any {
  if (typeof metierId !== "string" || !metierId) return freeze({ ok: false, code: "BAD_METIER", detail: "metierId required" });
  const present = new Set(Array.isArray(presentModules) ? presentModules.filter((x: any) => typeof x === "string") : []);
  const ov = TRANSVERSAL_OVERRIDES[metierId] || {};
  const missingOverrides: string[] = [];
  const components = (Array.isArray(TR.TRANSVERSAL) ? TR.TRANSVERSAL : []).map((t: any) => {
    const declared = Array.isArray(ov[t.key]) ? ov[t.key] : null;
    if (declared) {
      const have = declared.filter((m: string) => present.has(m));
      declared.filter((m: string) => !present.has(m)).forEach((m: string) => missingOverrides.push(`${t.key}:${m}`));
      if (have.length > 0) return freeze({ key: t.key, mode: "OVERRIDE", modules: freeze(have) });
      // declared but none present ⇒ fall back to the shared base (honest; override unavailable)
    }
    const shared = t.canonical.filter((m: string) => present.has(m));
    return freeze({ key: t.key, mode: "SHARED", modules: freeze(shared) });
  });
  const primaryModule = primaryOf(metierId);
  const primaryCapability = primaryModule && present.has(primaryModule) ? primaryModule : (primaryModule ? primaryModule + " (ABSENT)" : null);
  const hasOverride = components.some((c: any) => c.mode === "OVERRIDE");
  const specialised = hasOverride || (primaryModule !== null && present.has(primaryModule));
  return freeze({
    ok: true, metier: metierId,
    components: freeze(components),
    primaryCapability,
    specialised,
    status: specialised ? "SPECIALISED" : "STANDARD_BASE",
    missingOverrides: freeze(missingOverrides),
    note: specialised ? "configures the shared transversal base with métier-specific modules (overrides and/or a primary capability) — reuse, not rebuild" : "uses the shared transversal base as-is (not yet specialised; awaits its own authorized métier work)",
  });
}

/** configurationSummary(presentModules) -> per-métier config over ROSTER20 + specialised/standard tallies. */
function configurationSummary(presentModules: any): any {
  const roster = Array.isArray(PMM.ROSTER20) ? PMM.ROSTER20 : [];
  if (roster.length === 0) return freeze({ ok: false, code: "NO_ROSTER" });
  const items = roster.map((m: any) => { const c = configureMetier(m.id, presentModules); return freeze({ id: m.id, name: m.name, status: c.status, specialised: c.specialised, overrides: c.components.filter((x: any) => x.mode === "OVERRIDE").map((x: any) => x.key), primaryCapability: c.primaryCapability }); });
  return freeze({ ok: true, metiersTotal: items.length, specialised: items.filter((i: any) => i.specialised).length, standardBase: items.filter((i: any) => !i.specialised).length, items: freeze(items) });
}

const METIER_CONFIGURATION_CONTRACT = Object.freeze({
  id: "V327-METIER-CONFIGURATION",
  purpose: "§7 — per-métier CONFIGURATION of the shared transversal base (métier-specific modules where real, else the shared base); the deployment pattern that REUSES existing engines instead of rebuilding per métier",
  reuses: Object.freeze(["odg-metier-transversal-readiness.TRANSVERSAL (shared base)", "odg-commercial-metier-matrix.COMMERCIAL_METIERS (M1–M5 primary modules)", "odg-program-metier-matrix.ROSTER20 (roster)", "odg-btp-* (BTP/M2 specific modules — grounded present)"]),
  invariants: Object.freeze([
    "every métier reuses the SAME transversal base; configuration swaps in métier-specific modules only where they REALLY exist (no invented rules)",
    "OVERRIDES grounded in present modules; a declared-but-absent override is surfaced (missingOverrides) and falls back to the shared base — never silently assumed",
    "a métier with neither override nor primary is honestly STANDARD_BASE (not yet specialised) — not a fabricated specialisation",
    "no second roster/engine; reuses the canonical roster + existing matrices; PURE/deterministic/frozen/fail-closed",
  ]),
});

module.exports = { configureMetier, configurationSummary, TRANSVERSAL_OVERRIDES, METIER_CONFIGURATION_CONTRACT };
export {};
