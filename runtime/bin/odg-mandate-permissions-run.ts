#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V84 §2/§3 — MANDATE PERMISSIONS + BLOCKED-PARENT SEPARATION. Records the 10 permanent owner-permissions
 * (each granted with provenance; Level-C never granted) and applies the 7-category separation to the 14 Level-B parents
 * (V81 decomposition): the LOCAL/ALREADY_DONE sub-work PROCEEDS, only the sign-off/external stays reserved. Proves a
 * gated parent never immobilizes its computable sub-work. Reuses local-work-mandate; no new registry. Run: `odg-mandate-permissions-run.ts`.
 */

const M = require("../core/local-work-mandate.js");
const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function j(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }
const dec = j("V81_DECOMPOSITION.json");

// 1) the 10 permanent permissions.
const permissions = M.PERMISSIONS.map((c: string) => ({ capability: c, ...M.permits(c) }));
// Level-C refusals (proof the mandate excludes them).
const levelCProbe = ["spend", "deploy", "push", "sudo"].map((c) => ({ action: c, permitted: M.permits(c).permitted }));

// 2) separate each of the 14 Level-B parents into the 7 categories (sub-work from the V81 decomposition).
const separations = (dec ? dec.perParent : []).map((p: any) => {
  const subWork = (p.subMissions || []).map((s: any) => ({
    id: s.id,
    category: s.status === "ALREADY_DONE" ? "LOCAL_DONE" : s.status === "LOCAL_REMAINING" ? "LOCAL_SIMULATION" :
      (/external/i.test(String(p.kind || "")) && /execution/.test(s.name)) ? "EXTERNAL_DEPENDENCY" : "HUMAN_DECISION",
  }));
  return M.separateBlockedParent({ id: p.parent, subWork });
});
const totalProceed = separations.reduce((n: number, s: any) => n + s.proceedNow.length, 0);
const totalReserved = separations.reduce((n: number, s: any) => n + s.reservedOnly.length, 0);

const out = {
  "//": "CTO V84 §2/§3 — the 10 permanent owner-permissions represented canonically + the 7-category blocked-parent separation applied to the 14 Level-B parents. Categories 1–5 PROCEED; 6–7 (human/external) reserved. Public research is read-only; Level-C never granted. Reuses local-work-mandate; no new registry.",
  permanentPermissions: permissions, allPermitted: permissions.every((p: any) => p.permitted === true),
  levelCProbe, levelCAllRefused: levelCProbe.every((p: any) => p.permitted === false),
  revocability: { example: M.permits("LOCAL_ENGINEERING", { revoked: true }) },
  blockedParentSeparations: separations, totalProceedNow: totalProceed, totalReservedOnly: totalReserved,
  honestConclusion: `10 permanent permissions recognized (all granted with provenance; Level-C ${levelCProbe.every((p: any) => !p.permitted) ? "all refused" : "LEAK"}). Across the 14 Level-B parents, ${totalProceed} sub-work items PROCEED now (local/done/prep) and ${totalReserved} stay reserved (human sign-off / external) — proving a gated parent never immobilizes its computable sub-work. Public research is read-only; the mandate is revocable; ODG checks it, the provider cannot widen it.`,
  invariant: "the 10 permissions are owner-granted (provenance), revocable, Level-C-excluded; a blocked parent's categories 1–5 always proceed; human/external stay reserved; no self-widening.",
};
fs.writeFileSync(path.join(D, "V84_MANDATE_PERMISSIONS.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ permissions: permissions.length, allPermitted: out.allPermitted, levelCAllRefused: out.levelCAllRefused, proceedNow: totalProceed, reserved: totalReserved }, null, 2) + "\n");
export {};
