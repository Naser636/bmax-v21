# PREPARED (NOT APPLIED) — service + frontend-build fixes for ODG/CTO authorization

> **UPDATE 2026-10-22:** PROPOSAL 2 (frontend build `Cannot find namespace 'React'`) is **RESOLVED at source**
> in commit `937d33e` — `types/react-global.d.ts` exposes the React type namespace globally (maintained
> source, types-only, no compiler relaxation, generated `.next/types` NOT patched). Verified: `rm -rf .next
> && npm run build` ⇒ EXIT 0; `tsc -p tsconfig.json` ⇒ 0; canonical `odg-verify` regenerated
> `runtime-verify.json` with `build:true, typescript:true, gitClean:true`. **Only PROPOSAL 1 (systemd
> service env) remains — it requires human sudo and is NOT applied here.** The config review below stands.

Two coherence gaps were found during the FINAL 15 CLOSURE + DASHBOARD RELEASE VISIBILITY mission. Both are
**pre-existing**, carry blast radius or require a human/infra action, and are therefore **prepared here, not
applied** (per the mandate: "Prepare the exact proposed change and validation/rollback plan separately. Do not
install or modify `odg-preprod.service`, use sudo, or perform infrastructure changes without specific human
authorization"). Nothing below has been executed.

---

## PROPOSAL 1 — `odg-preprod.service`: bind the dashboard to the live persistent runtime state

**Gap:** the installed `odg-preprod.service` has no `ODG_RUNTIME_STATE_DIR`, so the standalone server (which
chdir's into its own build dir) reads `process.cwd()/runtime/generated` = a **build-time snapshot** → the
dashboard can serve stale mission/convergence/release data. The code fix already exists (`route.ts`
`generatedBase()` prefers `ODG_RUNTIME_STATE_DIR`); only the unit needs the env. A corrected unit already
exists as `deploy/odg-preprod.service.candidate` (labelled NOT INSTALLED).

**Exact change (human, with sudo):**
```sh
# 1. install the candidate unit (sets Environment=ODG_RUNTIME_STATE_DIR=/home/ubuntu/bmax-v21/runtime/generated)
sudo cp deploy/odg-preprod.service.candidate /etc/systemd/system/odg-preprod.service
sudo systemctl daemon-reload
sudo systemctl restart odg-preprod.service
```
**Validation:**
```sh
systemctl show odg-preprod.service -p Environment | grep ODG_RUNTIME_STATE_DIR   # expect the path
curl -s localhost:3000/api/runtime-state | jq '.queueCount, .release.decision'    # must match `odg state`
node scripts/runtime-identity-check.js                                            # expect CONSISTENT (exit 0)
# edit runtime/generated/runtime-state.json's queue, re-curl → value changes WITHOUT a rebuild (live binding)
```
**Rollback:** `sudo cp <backup of prior unit> /etc/systemd/system/odg-preprod.service; sudo systemctl daemon-reload; sudo systemctl restart odg-preprod.service` (keep a copy of the current unit before overwriting).

---

## PROPOSAL 2 — frontend `next build` typecheck: `Cannot find namespace 'React'`

**Gap (pre-existing):** `npm run build` (`next build`) compiles the app but FAILS its TypeScript step with
`Cannot find namespace 'React'`. Root cause: with `tsconfig "jsx": "react-jsx"` there is no global `React`
namespace, yet (a) the Next16-generated `.next/types/validator.ts:10` references `React.ComponentType` /
`React.ReactNode` **without importing React**, and (b) `src/app/layout.tsx:17` uses `React.ReactNode`. This
blocks `odg-verify`'s `build` gate (it runs `npm run build`), which is why `runtime/generated/runtime-verify.json`
cannot be freshly regenerated and still shows a stale `gitClean:false`. (`allowUmdGlobalAccess:true` was tried
and does NOT fix it — `@types/react`'s UMD global is value-only, not the type namespace. Reverted.)

**Proposed change (bounded, needs a quick build to validate):** provide the `React` type namespace globally
and stop using `React.ReactNode` in hand-written code.
```ts
// NEW FILE types/react-global.d.ts  — make the React type namespace globally resolvable (types only).
import type * as React from "react";
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export import React = React;   // if TS rejects this alias form, instead use a full re-export shim (below)
}
export {};
```
If the `export import ... = React` alias is rejected under `isolatedModules`, the robust alternative is to add
`"jsx": "preserve"`? NO — do not change jsx mode. Instead the reliable form is a hand-written
`types/react-global.d.ts` that re-declares `declare global { namespace React { ... } }` re-exporting the
needed members, OR (simplest and lowest-risk) **set `typescript.ignoreBuildErrors` is NOT acceptable** (hides
real errors). The recommended minimal change:
```diff
// src/app/layout.tsx
-import type { Metadata } from "next";
+import type { Metadata } from "next";
+import type { ReactNode } from "react";
 ...
-  children: React.ReactNode;
+  children: ReactNode;
```
plus a `types/react-global.d.ts` global shim for the **generated** validator (which cannot be edited). Because
the generated-validator fix touches global types, it must be validated by a full `next build` before trust.

**Validation:** `npx tsc --noEmit -p tsconfig.json` ⇒ 0 errors; `npm run build` ⇒ TypeScript step passes;
then `node runtime/bin/odg-verify.js --report-only` regenerates `runtime-verify.json` with the true gates.
**Rollback:** `git checkout -- src/app/layout.tsx tsconfig.json && rm -f types/react-global.d.ts`.

**Why not applied now:** pre-existing, global-type blast radius, and it needs a full `next build` to trust —
a dedicated authorized frontend-build lot, not a side-effect of the dashboard RELEASE-visibility change.
