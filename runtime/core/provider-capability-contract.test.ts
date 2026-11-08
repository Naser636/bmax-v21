#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P = require("./provider-capability-contract");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V5 / FIED-05 — PROVIDER CAPABILITY CONTRACT");
const decl = { id: "rea", capabilities: ["code-analysis"], permissions: ["read-source"], sideEffects: [], provenance: "morluto/rea" };
// fully declared ⇒ admissible.
check(P.assessProvider(decl).admissible === true, "fully declared ⇒ admissible");
// under-declared ⇒ not admissible.
check(P.assessProvider({ id: "x", capabilities: ["c"] }).admissible === false, "missing permissions/sideEffects/provenance ⇒ not admissible");
// self-authorizing provider ⇒ REJECTED.
check(P.assessProvider({ ...decl, selfAuthorizes: true }).admissible === false, "selfAuthorizes ⇒ REJECTED (ODG sole arbiter)");
// canUse: declared capability + granted permission ⇒ allowed.
check(P.canUse(decl, { requiredCapability: "code-analysis", grantedPermissions: ["read-source"] }).allowed === true, "declared cap + granted perm ⇒ allowed");
// undeclared capability ⇒ DENY.
check(P.canUse(decl, { requiredCapability: "binary-exec", grantedPermissions: ["read-source"] }).allowed === false, "undeclared capability ⇒ DENY");
// ungranted permission ⇒ DENY.
check(P.canUse(decl, { requiredCapability: "code-analysis", grantedPermissions: [] }).allowed === false, "ungranted permission ⇒ DENY");
// unaccepted side-effect ⇒ DENY.
{
  const d2 = { ...decl, sideEffects: ["writes-temp"] };
  check(P.canUse(d2, { requiredCapability: "code-analysis", grantedPermissions: ["read-source"] }).allowed === false, "unaccepted side-effect ⇒ DENY");
  check(P.canUse(d2, { requiredCapability: "code-analysis", grantedPermissions: ["read-source"], acceptedSideEffects: ["writes-temp"] }).allowed === true, "accepted side-effect ⇒ allowed");
}
// not-admissible provider ⇒ DENY.
check(P.canUse({ id: "x" }, { requiredCapability: "c", grantedPermissions: [] }).allowed === false, "under-declared provider ⇒ DENY");
check(P.PROVIDER_CAPABILITY_CONTRACT.invariants.some((i: any) => /never a privileged instruction/i.test(i)), "contract: declaration is untrusted");
console.log(failures === 0 ? "ALL PASS — V5 FIED-05 PROVIDER CAPABILITY CONTRACT" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
