#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the AI-Act role classifier is deny-by-default: no declared activity ⇒
// UNDETERMINED + no obligation asserted (the mandate's "ne pas conclure qu'une obligation s'applique sans analyser le
// rôle et les activités réelles"); roles assigned only on explicit activity flags; Art.50 triggers by activity; dates
// are NOT hardcoded (deferred to the register); classification is reproducible + declared-not-verified.
"use strict";
const assert = require("assert");
const R = require("./ai-act-role-classifier.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) DENY-BY-DEFAULT: empty activities ⇒ UNDETERMINED, no roles, no obligations.
const none = R.classifyRole({});
ok("no activity ⇒ UNDETERMINED, 0 roles, 0 obligations", none.undetermined === true && none.roles.length === 0 && none.obligations.length === 0);
ok("UNDETERMINED note refuses to assert obligations", none.notes.some(n => /does NOT assert|deny-by-default/i.test(n)));

// (2) a DEPLOYER activity ⇒ DEPLOYER role + its obligation families, NOT provider.
const dep = R.classifyRole({ usesAiSystemUnderOwnAuthority: true });
ok("deployer activity ⇒ DEPLOYER role only", dep.roles.includes("DEPLOYER") && !dep.roles.includes("PROVIDER") && !dep.undetermined);
ok("DEPLOYER carries obligation families", dep.obligations.some(o => o.role === "DEPLOYER") && dep.obligations.length > 0);

// (3) GPAI model provider ⇒ GPAI_PROVIDER with copyright/training-summary family.
const gpai = R.classifyRole({ developsOrPlacesGpaiModel: true });
ok("GPAI model ⇒ GPAI_PROVIDER + copyright/training-summary families", gpai.roles.includes("GPAI_PROVIDER") && gpai.obligations.some(o => /copyright|training/i.test(o.family)));

// (4) multiple roles accumulate (provider + deployer).
const multi = R.classifyRole({ developsOrPlacesAiSystemUnderOwnName: true, usesAiSystemUnderOwnAuthority: true });
ok("provider+deployer activities ⇒ both roles", multi.roles.includes("PROVIDER") && multi.roles.includes("DEPLOYER"));

// (5) Art.50 transparency triggers by ACTIVITY even without a product-role flag.
const synth = R.classifyRole({ generatesSyntheticContent: true });
ok("synthetic content ⇒ Art.50(2) marking obligation surfaced", synth.art50.some(x => /50\(2\)|machine-readable|marked/i.test(x)) && !synth.undetermined);
ok("interacts-with-humans ⇒ Art.50(1) disclosure", R.classifyRole({ systemInteractsWithHumans: true }).art50.some(x => /50\(1\)|interacting with an AI/i.test(x)));

// (6) dates are NOT hardcoded — classifier defers to the register (honest).
const n = R.classifyRole({ usesAiSystemUnderOwnAuthority: true }).notes.join(" ");
ok("dates deferred to STANDARDS register (not hardcoded)", /STANDARDS_OBLIGATIONS_REGISTER/.test(n) && !/2026-08-02|2026-12-02/.test(n));

// (7) declared-not-verified + reproducible + criteria exposed.
ok("declaredNotVerified flag + reproducible", dep.declaredNotVerified === true && JSON.stringify(R.classifyRole({ usesAiSystemUnderOwnAuthority: true })) === JSON.stringify(dep));
ok("criteria() exposes role self-identification", R.criteria().length === R.ROLE_CRITERIA.length && R.criteria().some(c => c.role === "PROVIDER"));

console.log(`\nAI-ACT-ROLE-CLASSIFIER suite — ${pass} assertions passed. (deny-by-default; principle-level; dates in register)`);
