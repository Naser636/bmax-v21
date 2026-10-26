#!/usr/bin/env node
"use strict";
/*
 * license-policy — PURE, deterministic SPDX-informed license classifier for opportunity / dependency
 * qualification (OPPORTUNITY_INTELLIGENCE §6 license inspection). Generalizes ODG's prior AD-HOC, per-case
 * license handling (e.g. the hardcoded flux-schnell "Apache-2.0 commercial OK" / flux-dev "NON-COMMERCIAL"
 * strings) into ONE reusable, tested policy. Invents nothing; FAIL-CLOSED: an unknown/custom license yields
 * nulls (never assume commercial safety). Informed by the authoritative SPDX license list (v3.29.0: 740 ids,
 * 154 OSI-approved — fetched read-only from spdx.org for calibration, not embedded wholesale).
 *
 * Two orthogonal dimensions an opportunity decision actually needs:
 *   - commercialUseOk        : may the artifact be USED in a commercial context? (FOSS: yes; NC: no)
 *   - proprietaryRedistribution : may you ship it inside a CLOSED/proprietary product WITHOUT copyleft
 *                                 obligations on your own code? (permissive: yes; weak-copyleft: conditional;
 *                                 strong/network copyleft: no; NC/proprietary: no)
 * Pure function; no I/O, no network. The classifier is a verdict + reason, never a decision to adopt.
 */

type Tri = boolean | null;
export interface LicenseVerdict {
  spdxId: string | null;
  known: boolean;
  osiApproved: Tri;
  family: "permissive" | "public-domain" | "weak-copyleft" | "strong-copyleft" | "network-copyleft" | "non-commercial" | "proprietary" | "unknown";
  commercialUseOk: Tri;
  proprietaryRedistribution: Tri | "conditional";
  note: string;
}

// SPDX families (representative; extend as needed — unknown ids fall through to deny-by-default).
const PERMISSIVE = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "Zlib", "Python-2.0", "PostgreSQL", "Apache-1.1", "BSD-3-Clause-Clear"]);
const PUBLIC_DOMAIN = new Set(["CC0-1.0", "Unlicense", "0BSD"]);
const WEAK_COPYLEFT = new Set(["LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later", "MPL-2.0", "EPL-2.0", "CDDL-1.0", "MPL-1.1"]);
const STRONG_COPYLEFT = new Set(["GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later"]);
const NETWORK_COPYLEFT = new Set(["AGPL-3.0-only", "AGPL-3.0-or-later"]);
const NON_COMMERCIAL = new Set(["CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "CC-BY-NC-ND-4.0", "CC-BY-NC-3.0", "Aladdin", "CC-BY-NC-2.0"]);
// Vendor "open-weight but non-commercial" and all-rights-reserved markers that are NOT SPDX ids.
const PROPRIETARY_NC_HINT = /non.?commercial|no[-_ ]?commercial|research.?only|FLUX\.1-dev|all rights reserved|proprietary|evaluation only/i;

function v(p: Partial<LicenseVerdict>): LicenseVerdict {
  return Object.freeze({
    spdxId: p.spdxId ?? null, known: p.known ?? false, osiApproved: p.osiApproved ?? null,
    family: p.family ?? "unknown", commercialUseOk: p.commercialUseOk ?? null,
    proprietaryRedistribution: p.proprietaryRedistribution ?? null, note: p.note ?? "",
  }) as LicenseVerdict;
}

/** classifyLicense(idOrText) → deterministic verdict. Accepts an SPDX id OR free license text (hint-matched). */
function classifyLicense(input: any): LicenseVerdict {
  if (typeof input !== "string" || !input.trim()) {
    return v({ family: "unknown", note: "no license id/text — FAIL-CLOSED: treat as NOT commercially safe until verified" });
  }
  const id = input.trim();
  if (PERMISSIVE.has(id)) return v({ spdxId: id, known: true, osiApproved: true, family: "permissive", commercialUseOk: true, proprietaryRedistribution: true, note: "permissive — commercial use + proprietary redistribution OK (keep attribution/NOTICE)" });
  if (PUBLIC_DOMAIN.has(id)) return v({ spdxId: id, known: true, osiApproved: id === "0BSD", family: "public-domain", commercialUseOk: true, proprietaryRedistribution: true, note: "public-domain-equivalent — no obligations" });
  if (WEAK_COPYLEFT.has(id)) return v({ spdxId: id, known: true, osiApproved: true, family: "weak-copyleft", commercialUseOk: true, proprietaryRedistribution: "conditional", note: "weak copyleft — commercial OK; proprietary redistribution OK only if the component stays separate/dynamically linked and its own modifications are shared" });
  if (STRONG_COPYLEFT.has(id)) return v({ spdxId: id, known: true, osiApproved: true, family: "strong-copyleft", commercialUseOk: true, proprietaryRedistribution: false, note: "strong copyleft (GPL) — commercial use OK, but a derivative/linked work must also be GPL ⇒ NOT shippable inside a closed product" });
  if (NETWORK_COPYLEFT.has(id)) return v({ spdxId: id, known: true, osiApproved: true, family: "network-copyleft", commercialUseOk: true, proprietaryRedistribution: false, note: "network copyleft (AGPL) — network/SaaS use triggers source-disclosure ⇒ NOT usable in a closed SaaS without releasing source" });
  if (NON_COMMERCIAL.has(id) || PROPRIETARY_NC_HINT.test(id)) return v({ spdxId: NON_COMMERCIAL.has(id) ? id : null, known: NON_COMMERCIAL.has(id), osiApproved: false, family: "non-commercial", commercialUseOk: false, proprietaryRedistribution: false, note: "non-commercial / research-only — NOT usable for a commercial deliverable" });
  // Looks like an SPDX id we don't have classified, vs. free text: either way, FAIL-CLOSED.
  const looksSpdx = /^[A-Za-z0-9.+-]+$/.test(id) && id.length <= 64;
  return v({ spdxId: looksSpdx ? id : null, known: false, family: looksSpdx ? "unknown" : "proprietary", commercialUseOk: null, proprietaryRedistribution: null, note: `unrecognised license (${looksSpdx ? "unclassified SPDX id" : "free text"}) — FAIL-CLOSED: verify manually before any commercial adoption` });
}

/** adoptionVerdict — opportunity-qualification helper: can ODG adopt this for a given target product model? */
function adoptionVerdict(license: any, opts?: any): any {
  const target = (opts && opts.target) || "commercial-closed"; // "commercial-closed" | "commercial-saas" | "internal" | "oss"
  const c = classifyLicense(license);
  let adoptable: Tri = null, reason = "";
  if (c.commercialUseOk === null) { adoptable = null; reason = "unknown license ⇒ FAIL-CLOSED (do not adopt until verified)"; }
  else if (c.commercialUseOk === false) { adoptable = target === "internal" || target === "oss" ? null : false; reason = "non-commercial license"; }
  else if (target === "commercial-closed") { adoptable = c.proprietaryRedistribution === true; reason = c.proprietaryRedistribution === true ? "permissive ⇒ OK in closed product" : c.proprietaryRedistribution === "conditional" ? "weak-copyleft ⇒ OK only if kept separate/dynamically linked" : "copyleft ⇒ NOT OK in a closed product"; if (c.proprietaryRedistribution === "conditional") adoptable = null; }
  else if (target === "commercial-saas") { adoptable = c.family !== "network-copyleft"; reason = c.family === "network-copyleft" ? "AGPL ⇒ SaaS source-disclosure" : "OK for SaaS (non-AGPL FOSS)"; }
  else { adoptable = true; reason = "internal/oss target ⇒ FOSS acceptable"; }
  return Object.freeze({ license: c, target, adoptable, reason, provenance: "license-policy (SPDX v3.29.0-informed)" });
}

export { classifyLicense, adoptionVerdict };
module.exports = { classifyLicense, adoptionVerdict };
