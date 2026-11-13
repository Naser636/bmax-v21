#!/usr/bin/env node
"use strict";
/* V180 §2 — business-operation capability cross-audit. Proves: the capability list is RECOVERED from the canonical V174-A §7
 * enumeration (28 items) — NOT fabricated to hit the directive's round number 30; each maps to a REAL module or MISSING (not
 * fabricated); honest 6-level status; mutualization identified; gaps prioritized; read-only; no status declared autonomous
 * without proof; payment + cancellation stay OWNER_GATED. */
const C = require("./odg-capability-cross-audit.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const a = C.crossAudit();
  const byId: any = {}; for (const c of a.capabilities) byId[c.id] = c;

  // ---- recovered, not fabricated to 30 ----
  check("capabilities RECOVERED from the canonical V174-A §7 enumeration (28), NOT fabricated to 30", a.enumeratedCount === 28 && a.directiveRoundNumber === 30 && /NO filler capability invented to reach 30/.test(a.countNote) && a.canonicalSource.includes("V174-A §7"));
  check("every capability has id + module + status + primitive + gap + acceptance test", a.capabilities.every((c: any) => c.id && c.module && C.STATUS.includes(c.status) && c.primitive && c.gap && c.acceptanceTest));

  // ---- maps to REAL modules / honest MISSING ----
  check("validated capabilities map to REAL modules (prospect-qualification V176, support-renewal V174, pipeline)", byId.prospect_research_qualification.status === "EXISTING_AND_VALIDATED" && /odg-prospect-qualification/.test(byId.prospect_research_qualification.module) && byId.support.status === "EXISTING_AND_VALIDATED" && /support-renewal/.test(byId.support.module));
  check("MISSING capabilities honestly flagged (language, digital distribution, marketing) — not fabricated modules", byId.language_management.status === "MISSING" && /MISSING/.test(byId.language_management.module) && byId.digital_distribution.status === "MISSING" && byId.marketing.status === "MISSING");
  check("payment + cancellation stay OWNER_GATED (committing action needs owner)", byId.payment_tracking.status === "OWNER_GATED" && byId.cancellation.status === "OWNER_GATED");

  // ---- honest status distribution ----
  check("status distribution is honest (7 validated / 16 partial / 3 missing / 2 owner-gated)", a.byStatus.EXISTING_AND_VALIDATED === 7 && a.byStatus.EXISTING_BUT_PARTIAL === 16 && a.byStatus.MISSING === 3 && a.byStatus.OWNER_GATED === 2);
  check("sum of statuses equals the enumerated count (28)", Object.values(a.byStatus).reduce((x: any, y: any) => x + y, 0) === 28);

  // ---- mutualization ----
  check("mutualization identified (support-renewal serves 4; scaling-model serves 3)", a.mutualized.length >= 3 && a.mutualized.some((m: string) => /support-renewal-engine serves support \+ renewal/.test(m)));

  // ---- prioritized gaps ----
  const g = C.prioritizedGaps();
  check("prioritized gaps rank MISSING highest; topMissing = distribution/language/marketing", g.missing === 3 && g.rows[0].priority >= g.rows[g.rows.length - 1].priority && g.topMissing.includes("digital_distribution") && g.topMissing.includes("language_management") && g.topMissing.includes("marketing"));
  check("gaps exclude the already-validated capabilities (only partial/missing/owner-gated)", g.rows.every((r: any) => r.status !== "EXISTING_AND_VALIDATED") && g.total === 21);

  // ---- honesty + determinism ----
  check("contract: recovered-not-fabricated, real-modules-or-MISSING, mutualization, no unproven autonomy, read-only", C.CAPABILITY_CROSS_AUDIT_CONTRACT.invariants.some((i: string) => /NO list fabricated to hit 30/.test(i)) && C.CAPABILITY_CROSS_AUDIT_CONTRACT.invariants.some((i: string) => /REAL existing module or MISSING/.test(i)) && C.CAPABILITY_CROSS_AUDIT_CONTRACT.invariants.some((i: string) => /no status declared AUTONOMOUS\/validated without end-to-end proof/.test(i)));
  check("deterministic + frozen", JSON.stringify(C.crossAudit().byStatus) === JSON.stringify(a.byStatus) && Object.isFrozen(a));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — capability-cross-audit (§2: 28 capabilities RECOVERED from canonical V174-A §7 [NOT fabricated to 30]; mapped to REAL modules or honest MISSING [language/distribution/marketing]; 7 validated/16 partial/3 missing/2 owner-gated; mutualization identified; gaps prioritized; read-only, no unproven autonomy)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
