#!/usr/bin/env node
/**
 * ai-act-role-classifier — principle-level classifier of an entity's role(s) under the EU AI Act (Regulation (EU)
 * 2024/1689) from its DECLARED real activities, and the principle-level obligation families that attach to each role.
 * FAIL-CLOSED and deny-by-default: it NEVER concludes that an obligation applies without an explicit activity flag —
 * no activities asserted ⇒ role UNDETERMINED and obligations EMPTY (it refuses to guess). Activities are caller-
 * declared facts (marked declared-not-verified); the classifier does not invent them. DATES are NOT hardcoded here —
 * they are governed by STANDARDS_OBLIGATIONS_REGISTER (which records the verified timeline + any amending regulation
 * and its ACCESS level), because hardcoding a contested/amended date would be a false claim. Pure, deterministic.
 */
"use strict";

// Role defining criteria (principle-level, from the Act's role definitions). A role is assigned ONLY if its flag is
// explicitly true in the declared activities.
const ROLE_CRITERIA: Array<{ role: string; flag: string; criterion: string }> = [
  { role: "PROVIDER", flag: "developsOrPlacesAiSystemUnderOwnName", criterion: "develops an AI system (or has one developed) and places it on the market / puts it into service under its own name or trademark" },
  { role: "GPAI_PROVIDER", flag: "developsOrPlacesGpaiModel", criterion: "develops a general-purpose AI model and places it on the market" },
  { role: "DEPLOYER", flag: "usesAiSystemUnderOwnAuthority", criterion: "uses an AI system under its own authority in a professional activity (not purely personal)" },
  { role: "IMPORTER", flag: "importsAiSystemFromOutsideEu", criterion: "places on the EU market an AI system bearing the name of an entity established outside the EU" },
  { role: "DISTRIBUTOR", flag: "makesAiSystemAvailableInSupplyChain", criterion: "makes an AI system available on the market without being provider/importer" },
];

// Principle-level obligation FAMILIES per role (NOT verbatim article text; dates live in the register).
const ROLE_OBLIGATIONS: Record<string, string[]> = {
  PROVIDER: ["risk & quality management proportionate to risk tier", "technical documentation & record-keeping", "transparency / instructions for use", "human-oversight design", "accuracy/robustness/cybersecurity", "post-market monitoring", "registration where required (high-risk)"],
  GPAI_PROVIDER: ["technical documentation of the model", "information to downstream providers", "EU copyright-compliance policy", "public summary of training content", "systemic-risk duties IF model has systemic risk (evaluations, incident reporting, cybersecurity)"],
  DEPLOYER: ["use per provider instructions", "human oversight in operation", "Art.50 transparency to affected persons where applicable", "monitoring & logging retention", "data-protection/DPIA coordination where applicable"],
  IMPORTER: ["verify provider conformity before placing on market", "keep documentation available"],
  DISTRIBUTOR: ["verify conformity marking before making available", "act on non-conformity"],
};

// Transparency (Art.50) attaches by ACTIVITY regardless of tier — flagged separately when the activity is declared.
const ART50_TRIGGERS: Array<{ flag: string; obligation: string }> = [
  { flag: "systemInteractsWithHumans", obligation: "Art.50(1): inform persons they are interacting with an AI system" },
  { flag: "generatesSyntheticContent", obligation: "Art.50(2): mark AI-generated/manipulated audio/image/video/text as artificially generated (machine-readable)" },
  { flag: "emotionRecognitionOrBiometricCategorisation", obligation: "Art.50(3): inform persons exposed to emotion-recognition / biometric categorisation" },
  { flag: "generatesDeepfakes", obligation: "Art.50(4): disclose deepfake content" },
];

export interface RoleClassification {
  roles: string[]; obligations: Array<{ role: string; family: string }>;
  art50: string[]; undetermined: boolean; notes: string[]; declaredNotVerified: true;
}

/** classifyRole(activities): activities = { <flag>: boolean, ... }. Deny-by-default; no flag ⇒ UNDETERMINED. */
function classifyRole(activities: any): RoleClassification {
  const a = activities && typeof activities === "object" ? activities : {};
  const roles: string[] = [];
  for (const rc of ROLE_CRITERIA) if (a[rc.flag] === true) roles.push(rc.role);
  const obligations: Array<{ role: string; family: string }> = [];
  for (const r of roles) for (const fam of (ROLE_OBLIGATIONS[r] || [])) obligations.push({ role: r, family: fam });
  const art50: string[] = [];
  for (const t of ART50_TRIGGERS) if (a[t.flag] === true) art50.push(t.obligation);
  const undetermined = roles.length === 0 && art50.length === 0;
  const notes: string[] = [];
  if (undetermined) notes.push("UNDETERMINED: no qualifying activity declared — ODG does NOT assert any AI-Act obligation without a real activity analysis (deny-by-default).");
  notes.push("Principle-level only: role criteria & obligation FAMILIES, not verbatim article text. Exact dates: see STANDARDS_OBLIGATIONS_REGISTER (verified timeline + any amending regulation + ACCESS level).");
  notes.push("Activities are declared-not-verified; classification follows the Act's role definitions (Reg (EU) 2024/1689). Prohibited practices & high-risk Annex-III tiering require a separate assessment.");
  return { roles, obligations, art50, undetermined, notes, declaredNotVerified: true };
}

/** criteria(): expose the role criteria so a client can self-identify which activities they perform. */
function criteria(): Array<{ role: string; flag: string; criterion: string }> { return ROLE_CRITERIA.slice(); }

export { classifyRole, criteria, ROLE_CRITERIA, ROLE_OBLIGATIONS, ART50_TRIGGERS };
module.exports = { classifyRole, criteria, ROLE_CRITERIA, ROLE_OBLIGATIONS, ART50_TRIGGERS };

if (require.main === module) { process.stdout.write("ai-act-role-classifier (fail-closed, principle-level)\n"); }
