# R2 Public-OSS External-Repository Evidence (Mission ODG_R2_PUBLIC_OSS_M2, 2026-10-22)

**Result: `R2_PUBLIC_OSS_VERIFIED`** — the evidence engine processed a REAL, public, non-synthetic external codebase end-to-end. This is **technical external-repository evidence, NOT a client validation** (a paying/consenting client + R4 remain separate and pending). €0 spent; no private repo accessed; no contact.

## Subject repository (public, pinned)
- **Repo:** `https://github.com/npm/cli` (the npm CLI — public OSS).
- **Revision:** tag `v10.9.0` → commit **`977fd5784f875fdc2e3436ed15c444ddca63e3d7`** (pinned for reproducibility).
- **Licence:** Artistic-2.0 ("The npm application"; public).
- **Artifact analyzed:** `package-lock.json` (lockfileVersion 3; name `npm@10.9.0`; **627,405 bytes**; sha256 `deb2e887500fa99469c5ba586fb6c017c9b63c3a2638e8fd473847cc95ef1249`; 1336 package entries). Fetched read-only from `raw.githubusercontent.com/npm/cli/v10.9.0/package-lock.json`.
- **Why chosen:** real, large, pinned, public lockfile with 1300+ real dependencies in the supported npm ecosystem; no credentials/private data/submodules/paid services needed; reproducible from the pinned revision.

## Execution (existing engine `runtime/core/supply-chain-attest.{ts,js}`, unchanged; node v22.22.1)
| Check | Result |
|---|---|
| **SBOM** (CycloneDX 1.5) | **1318 components**; **reconciles exactly** to 1318 packages-with-version (excl. root) — no false components, no silent drops |
| **Reproducibility** | SBOM digest byte-stable across runs — `36c708824c0e47e0…` |
| **Dual-port parity** | `.js` SBOM digest == `.ts` SBOM digest (identical) |
| **Provenance** (in-toto/SLSA) | attestation built + ed25519 sign + **verify = true** (signature + artifact digest + SBOM rebind) |
| **Tamper detection** | tampered subject digest ⇒ **verify = false** (no false success) |
| **SLSA claim** | honest "L1+mechanism (L2 BLOCKED: no managed/keyless signing)" — **not** overclaimed |
| **Licence / dependency risk** | 1314 licensed, **4 unknown-licence surfaced**, 0 copyleft (GPL/AGPL/LGPL) — honest surface, no false "all clear" |
| **False-success negative** | empty lockfile ⇒ 0-component SBOM (honest empty) |
| **Tech-debt signal** | **NOT RUN** — this was a lockfile-only test (source tree not cloned); debt scan needs source. Recorded limitation, not a silent pass. |

## Pinned evidence artifacts (scratchpad `r2-oss/`; sha256)
- `sbom.cdx.json` — `7ff498741c296dfb1896b7e3b95ae9b529b444a437ea5457a72bffe41671d544`
- `attestation.intoto.json` — `e4e53cb80d3abf785be9532b2f5c5e5c5775ce49e2f3e79c3905d3d5b4fe22c4`
- `licence-risk.json` — `2e07e9dca5da64ea6acb82bec719cb7a45862bccd5553ad9266442c53a4e99d7`
- source lockfile — `deb2e887…` (re-fetchable from the pinned revision ⇒ independently reproducible).

## Targeted regression (engine unchanged — pure execution)
`supply-chain-attest.test.ts` 7/7 PASS; `r2-evidence-pack-fixture.test.ts` (M1) ALL PASS; engine source unchanged (git confirms). No code change, no commit.

## R3 mechanical review (per `14`) — on these artifacts
- **Automated checks PASSED:** SBOM reconciliation (1318==1318); provenance signature+digest+SBOM-rebind verify; **tamper ⇒ fail**; reproducibility (stable digest); dual-port parity; licence-risk surfacing (4 unknown flagged); honest empty-negative.
- **Checks failed/blocked:** none failed; tech-debt NOT RUN (lockfile-only).
- **Human review still required:** a qualified independent reviewer must sign the *opinion* (mechanical layer ≠ sign-off) — **BLOCKED_BY_DEPENDENCY** (reviewer). Not simulated.
- **Client-specific validation still required:** a consenting client repository + an accepted engagement (R4) — pending.
- **Supports the pilot offer (`15`)?** The SBOM + provenance + licence-risk + reproducibility deliverables are now proven on a real external codebase ⇒ the offer's *mechanism* is externally substantiated. **Unsupported claims remain:** SLSA L2, "compliance/certification", security-audit completeness, tech-debt depth (not run), and any client/reference claim.

## Limitations (recorded)
Lockfile-only (no source clone ⇒ no code-level debt/vuln analysis); npm ecosystem only; SLSA L1 self-signed; single repo; public data (not a client). CVE/vuln data not consulted (absence ≠ "no vulnerabilities").

## Status
`R2_PUBLIC_OSS_VERIFIED` ✓ (technical external-repo proof on real public code). R2 **client** validation, R3 **human sign-off**, R4 **reference** remain pending/BLOCKED as stated.
