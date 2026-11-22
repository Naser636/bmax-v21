# V16 — Owner review packet (gate 10/12 → 12/12) and anchor protection

Prepared by the provider. Nothing here is signed, pinned or installed. Every step marked **OWNER** needs your identity, your key or your account.

## 1. Gate: what to review and sign

**Candidate.** `3a88de01a34aae90fcefc34376a4fd79d68bbf51` (main after #873).
- RUN4 measured exactly this tree (`git archive`): `docs/odg/evidence/V15_GATE_EXPERIMENT_RESIDENT_CONFINEMENT_RUN4.json`.
- Its required CI is green.
- Missing: `RECORD_NOT_BOUND_TO_CANDIDATE (subjectCommit null)`, for `codeAndDepsReviewed` and `independentInspection`.

**What to review.** The confined resident-driver launcher, cumulatively since V15 started (`git diff bd42eaa7 3a88de01 -- <files>`):

| File | Change |
|---|---|
| `scripts/odg-resident-driver-confined.sh` | +85/−13 |
| `scripts/lib/odg-confined-view.sh` | +10/−2 |
| `scripts/lib/odg-resident-freshness.sh` | +27/−6 |
| `scripts/odg-resident-driver-build.sh` | +5/−3 |

Plus the unchanged tick `runtime/bin/odg-resident-driver-tick.ts`.
- The launcher files did not change between the last provider-side ACCEPT (`a2f765aa`, #873 round 2) and the candidate, because only merges happened in between.
- No new dependencies. It uses system binaries: bubblewrap 0.11.1, `setpriv`, `timeout`, node v22.22.1.

**Provider-side inspection history (information only; it never counts):**
- #864: REJECT, then ACCEPT.
- #868: ACCEPT.
- #873: ACCEPT with 2 MED, then ACCEPT.

The record of these rounds is in `docs/odg/evidence/V15_RESIDENT_CONFINEMENT_INSPECTION.json` and in the PR threads.

**OWNER — steps.** Tool and key handling: `docs/odg/OWNER_SIGNING_PROCEDURE.md`.
1. Review the diff above. If you accept it, edit `docs/odg/evidence/V15_RESIDENT_CONFINEMENT_INSPECTION.json`:
   - `"subjectCommit": "3a88de01a34aae90fcefc34376a4fd79d68bbf51"`;
   - `"verdict": "ACCEPT"`;
   - keep `"experiment": "V15-EXP-resident-confinement"`.

   Open a PR and merge it.
2. Once, outside any checkout:
   ```sh
   openssl genpkey -algorithm ed25519 -out ~/odg-owner/owner.pem
   openssl pkey -in ~/odg-owner/owner.pem -pubout -out ~/odg-owner/owner.pub
   npx tsx runtime/bin/odg-owner-sign.ts fingerprint --pub ~/odg-owner/owner.pub
   ```
   Then pin the printed fingerprint under `INSPECTION_RECORD` in `docs/odg/evidence/TRUST_ANCHORS.json`, in an **owner-signed commit** (see §2), through a PR you review.
3. On a clean checkout of the merged `main`:
   ```sh
   npx tsx runtime/bin/odg-owner-sign.ts inspection --record docs/odg/evidence/V15_RESIDENT_CONFINEMENT_INSPECTION.json --key ~/odg-owner/owner.pem --days 30
   ```
   Commit the produced `…_INSPECTION.sig.json` to `main`.
4. On **your** clone, after `git fetch`:
   ```sh
   npx tsx runtime/bin/odg-gate-experiment-resident-confinement.ts --ci-commit 3a88de01a34aae90fcefc34376a4fd79d68bbf51
   ```
   Expected result: `INTEGRATE` 12/12, which means merge-eligible, not deployed. The provider can run the same command afterwards, but its local verdict is never the trust decision.

## 2. Anchor protection: what exists and what only you can enable

**Prepared in this PR (detection; not enforcement on its own):**
- **CI step `Trust-anchor audit`** (`scripts/odg-anchor-ci-check.sh`). CI fails if any anchor is pinned unless every pin comes from a commit with a good SSH signature by a key listed in `docs/odg/evidence/OWNER_ALLOWED_SIGNERS` (empty by design). A malformed or absent anchor file also fails.
  - Tested: on main → `NO_ANCHORS_PINNED`, OK.
  - Tested: a provider-style unsigned pin → FAIL, exit 1.
- **`.github/CODEOWNERS`.** Assigns the anchor file, the signer list, the audit tool, the CI check and the workflows to `@Naser636`.

**Why this is not yet a protection.** The provider's `gh` uses the same Naser636 account that merges PRs. The provider can therefore edit the workflow, the signer list and this script, and approve its own changes. Only a **distinct identity** for the provider, combined with branch protection, makes this enforcing.

**OWNER — steps.**
1. Give the provider its own GitHub identity: a machine user, or a fine-grained token on a separate account with `contents:write` and `pull_requests:write` only. Then remove the provider's access to Naser636 credentials on this host (`gh auth logout` for Naser636, then `gh auth login` as the provider identity).
2. As Naser636, enable branch protection on `main`:
   ```sh
   gh api -X PUT repos/Naser636/bmax-v21/branches/main/protection --input - <<'JSON'
   {"required_status_checks":{"strict":true,"contexts":["build + typecheck + parity + tests"]},
    "enforce_admins":true,
    "required_pull_request_reviews":{"require_code_owner_reviews":true,"required_approving_review_count":1},
    "restrictions":null,"required_signatures":false,"allow_force_pushes":false,"allow_deletions":false}
   JSON
   ```
3. Add your SSH signing key to `docs/odg/evidence/OWNER_ALLOWED_SIGNERS` (`owner ssh-ed25519 AAAA…`) in a commit you sign (`git -c gpg.format=ssh -c user.signingkey=~/.ssh/id_ed25519 commit -S`). Sign every later `TRUST_ANCHORS.json` commit the same way.

**Check at any time:**
```sh
bash scripts/odg-anchor-ci-check.sh . origin/main
npx tsx runtime/bin/odg-trust-anchor-audit.ts --signer-keys <your key list> --require-signed
```

## 3. Confined drop-in: dry-run (prepared, NOT run)

Static finding:
- The installed `v364-hardening.conf` sets `RestrictNamespaces=yes`, and the base unit sets `RestrictAddressFamilies=AF_UNIX`.
- Both block what bwrap needs, so the drop-in as previously proposed would have made every tick `INVALID_TRACE`.
- Drop-ins also apply in lexical order, so `v364-…` would override a `v15-…` file.

The proposal now resets both settings to the minimal set bwrap needs, and must be installed as `zz-v15-confined-launcher.conf`.

The provider's transient-unit dry-run was **refused by its permission policy**, so the finding is not reproduced.

**OWNER:**
```sh
bash scripts/odg-owner-dropin-dryrun.sh
```
This uses transient units on a throw-away copy; nothing is installed. Expected results:
- A = `INVALID_TRACE`, which confirms the finding;
- B = one IDLE line, rc 0;
- C = `STOPPED`.

Install only if B and C pass. The install and rollback commands are printed by the script.
