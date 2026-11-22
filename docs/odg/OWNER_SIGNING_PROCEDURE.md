# Owner signing procedure (V15) — OWNER-ONLY

**Who:** the owner, on the owner's own machine, with the owner's own key.
The provider (Claude Code) never generates, holds, or uses this key.

**Why:** the gate conditions `codeAndDepsReviewed` and `independentInspection` count only from an owner-anchored
`INSPECTION_RECORD` signature. KI maturity counts only from a `MATURITY_EVIDENCE` signature.
`docs/odg/evidence/TRUST_ANCHORS.json` is empty by design.

The tool adds no new trust path. It only writes the signature sidecars that the existing checks already read:
- `odg-gate-measured-evidence.ownerAnchoredReview`;
- `odg-evidence-verifier.verifyMaturityEvidence`.

## 1. Key (once, outside any repository checkout)

```sh
mkdir -p ~/odg-owner && chmod 700 ~/odg-owner
openssl genpkey -algorithm ed25519 -out ~/odg-owner/owner.pem   # keep private, offline backup
chmod 600 ~/odg-owner/owner.pem
openssl pkey -in ~/odg-owner/owner.pem -pubout -out ~/odg-owner/owner.pub
npx tsx runtime/bin/odg-owner-sign.ts fingerprint --pub ~/odg-owner/owner.pub
```

Run `npx tsx` from a checkout with `node_modules` installed.

The tool refuses a private key located inside the checkout it runs from, but not one in another checkout or worktree. Keep the key in `~/odg-owner`.

## 2. Pin the fingerprint (owner-reviewed PR)

Add the printed hex fingerprint to `TRUST_ANCHORS.json`:
- under `INSPECTION_RECORD` to sign inspection records;
- under `MATURITY_EVIDENCE` to sign maturity evidence.

Pinning a key is the trust decision itself. Review it as such.

> **NOT TECHNICALLY ENFORCED (inspection MEDIUM).** The owner-reviewed PR is the **only** control on this file.
> The provider's `gh` uses the same GitHub account (Naser636) that merges PRs. A provider could therefore generate its own key, sign with this tool, and pin that key in a PR it merges itself.
> Until the owner adds an enforcing control, a pinned key proves only what the owner's own review of `TRUST_ANCHORS.json` proves. Possible controls (owner decision; repository settings are not changed by the provider):
> - a distinct provider account plus branch protection requiring owner review of this path;
> - a required owner-GPG-signed commit for this path.
> **Owner check:** `git log -p -- docs/odg/evidence/TRUST_ANCHORS.json` must show only fingerprints **you** added.

## 3. Sign

Before signing, read the record or evidence. A signature attests that **you** reviewed it.

Sign **exactly the version merged on `main`** (`git fetch && git checkout origin/main -- <file>` or a clean checkout of main). The checks read `origin/main`, so a working-tree difference such as an uncommitted edit or CRLF conversion causes a hash mismatch and fails closed.

**Gate inspection record** (example: the resident-confinement experiment).

The record must be **bound to the candidate you reviewed**. Before signing, set its owner fields, then merge:
- `subjectCommit`: the full 40-hex sha that the gate experiment is run with (`--ci-commit`);
- `verdict`: `"ACCEPT"`.

The tool refuses to sign a record without them. The gate refuses a signature over a record bound to another commit, so one signature never covers later code.

```sh
npx tsx runtime/bin/odg-owner-sign.ts inspection \
  --record docs/odg/evidence/V15_RESIDENT_CONFINEMENT_INSPECTION.json \
  --key ~/odg-owner/owner.pem --days 30
```

This writes `…_INSPECTION.sig.json`.

**Maturity evidence:**

```sh
npx tsx runtime/bin/odg-owner-sign.ts maturity --contract-path docs/odg/WIC_X.json \
  --evidence docs/odg/evidence/X.json --claim 'a|is|b' --level EXPERIMENTAL --key ~/odg-owner/owner.pem
```

This writes `X.json.sig.json`. The signature binds the contract file too (path + sha256 of its bytes): editing or replacing the WIC invalidates it.

## 4. Commit the sidecar to `main`

The checks read the record, its sidecar **and `TRUST_ANCHORS.json`** from `origin/main`. An uncommitted local edit of the anchors has no effect. `npx tsx runtime/bin/odg-trust-anchor-audit.ts` lists every pin with its introducing commit, PR and signature status.

Any later edit to the record or evidence invalidates the signature: the check returns `CONTENT_MODIFIED` or a hash mismatch.

Signatures expire after at most 90 days (default 30). After expiry, the gate returns to `RETURN_TO_EXPERIMENT`, so you must sign again.

Rerun `runtime/bin/odg-gate-experiment-resident-confinement.ts`. The two review conditions then pass, provided that:
- the key is pinned;
- the sidecar is on `main`.

## 5. Re-verify on a clone you control (the trust decision)

A verdict computed on the provider's host is **not** the trust decision. Its local `origin/main` ref is writable by whoever controls that clone (`git update-ref`), and it is only as fresh as its last fetch. A forged or stale ref can therefore produce INTEGRATE, or keep a revoked key alive.

Before relying on a result:
1. On your own clone, run `git fetch`.
2. Re-run the gate experiment, or the verifier, there.
3. Run `npx tsx runtime/bin/odg-trust-anchor-audit.ts --signer-keys <your key list> --require-signed`.

## Revocation / rollback

To revoke, remove the fingerprint from `TRUST_ANCHORS.json`. Every signature made with that key stops counting immediately.

## Scope

A valid signature proves integrity and origin (`provesTruth:false`), never truth.

`INTEGRATE` means merge-eligible only. Deployment stays owner-gated.
