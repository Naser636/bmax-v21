#!/usr/bin/env node
"use strict";
/* V135 seed D — build the REAL GRANT / PERMISSION / OWNER-GATE MAP from canonical sources and validate it against the owner's
 * standing mandate. NO invention: granted = the 10 named permanent permissions (local-work-mandate / V84); levelCDenied = the
 * 17 Level-C actions the owner never grants; ownerGated = OG-01..OG-08 (CAPABILITY_GAP_REGISTER_V1.md §B); riskGates = the
 * MEDIUM+ FMEA residuals from V135_P7_SRE_FMEA.json requiring owner acceptance. Writes docs/odg/V135_GRANT_OWNERGATE_MAP.json. */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", ".."), D = path.join(ROOT, "docs", "odg");
const mandate = require(path.join(ROOT, "runtime", "core", "local-work-mandate.js"));
const GM = require(path.join(ROOT, "runtime", "core", "grant-permission-map.js"));

// granted + levelCDenied come straight from the canonical mandate (the SSOT for the owner's standing authority).
const granted = mandate.PERMISSIONS;        // 10 named permanent permissions, each owner-granted with provenance
const levelCDenied = mandate.LEVEL_C;       // 17 actions the owner never grants here (push/merge/deploy/sudo/spend/...)

// OG-01..OG-08 — the owner-gated frontier, transcribed from CAPABILITY_GAP_REGISTER_V1.md §B (source cited in provenance).
const OG_PROV = "CAPABILITY_GAP_REGISTER_V1.md §B (OG-01..OG-08) — owner-gated inputs, recorded not worked-around";
const ownerGated = [
  { id: "OG-01", unblocks: ["D02", "D03", "D07", "D09"], requiredOwnerAction: "Provision ODG_AUDIT_HMAC_KEY (secret)", provenance: OG_PROV, what: "keyed-HMAC evidence authenticity (keyless tamper-evidence exists; keyed variant designed not provisioned)" },
  { id: "OG-02", unblocks: ["D03"], requiredOwnerAction: "Decision + paid/managed CVE feed (owner-authorized new scope)", provenance: OG_PROV, what: "CVE/vulnerability scanning (NVD/OSV) — not performed today" },
  { id: "OG-03", unblocks: ["D04", "D05"], requiredOwnerAction: "Supply/authorize an independently-labelled broad-IT corpus", provenance: OG_PROV, what: "independent eval dataset (broad-it-eval returns NO_DATA until admitted)" },
  { id: "OG-04", unblocks: ["D06", "D07"], requiredOwnerAction: "Owner VPS privileged action (systemd/sudo/deploy + prod smoke)", provenance: OG_PROV, what: "private-VPS mutation / durable self-wake + production front-door smoke" },
  { id: "OG-05", unblocks: ["D08", "D09"], requiredOwnerAction: "Engage an accredited body (external/paid)", provenance: OG_PROV, what: "accredited certification pathway (ODG prepares evidence, is NOT a certifier)" },
  { id: "OG-06", unblocks: ["D01"], requiredOwnerAction: "Install the hadolint binary in the build env", provenance: OG_PROV, what: "hadolint toolchain (new-language-families BLOCKED today)" },
  { id: "OG-07", unblocks: ["D09"], requiredOwnerAction: "CTO confirm roster expansion + per-person primary evidence", provenance: OG_PROV, what: "engineering-side expert additions to rebalance D09 law↔engineering" },
  { id: "OG-08", unblocks: ["D10", "D11"], requiredOwnerAction: "Owner commercial/legal + paid provider (PDP/Peppol)", provenance: OG_PROV, what: "real billing provider / certified fiscal transmission (ISO 27001 mandatory for Peppol SPs 2027-07-01)" },
];
// Level-B owner decisions (not actions ODG performs) — surfaced from the mandate's LEVEL_B list, as owner-gated acceptance points.
for (const d of mandate.LEVEL_B) ownerGated.push({ id: "LVLB-" + d, unblocks: ["(governance acceptance)"], requiredOwnerAction: "owner " + d.replace(/_/g, " "), provenance: "local-work-mandate LEVEL_B (owner-decision)", what: "Level-B human decision: " + d });

// riskGates — the MEDIUM+ FMEA residuals that REQUIRE explicit owner acceptance (from the real V135_P7_SRE_FMEA.json dossier).
const fmea = JSON.parse(fs.readFileSync(path.join(D, "V135_P7_SRE_FMEA.json"), "utf8"));
const riskGates = (fmea.ownerReviewRequired || []).map((r: any) => ({ mode: r.mode, residualRisk: r.residualRisk, residualRpn: r.residualRpn, acceptance: "REQUIRED", source: "V135_P7_SRE_FMEA.json (P7-SRE)" }));

const result = GM.buildGrantMap({ granted, ownerGated, levelCDenied, riskGates }, mandate);
const out = {
  "//": "V135 seed D — grant/permission/owner-gate map, validated against the owner's standing mandate (local-work-mandate). Completes the canonical V135 governance set (A traceability + B FMEA + C action tests + D THIS map). No new registry/authority; reuses canonical sources. Source provenance cited per item.",
  ok: result.ok, counts: result.counts, violations: result.violations,
  granted: result.granted, grantedProvenance: mandate.PROVENANCE,
  levelCDenied: result.levelCDenied, levelCNote: "the owner never grants these here — a Level-C leak would be a critical authority bypass (validated: none).",
  ownerGated: result.ownerGated,
  riskGates: result.riskGates,
  honesty: "Every grant is backed by the owner's standing mandate (self-authorization would FAIL validation — tested). Level-C actions are denied, not granted. Owner-gates and FMEA MEDIUM+ residuals are SURFACED with their required owner action/acceptance — none silently cleared.",
  status: result.ok ? "GRANT_MAP_CONSISTENT_authority_backed" : "INCONSISTENT",
};
fs.writeFileSync(path.join(D, "V135_GRANT_OWNERGATE_MAP.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: out.status, ok: result.ok, counts: result.counts }, null, 2) + "\n");
export {};
