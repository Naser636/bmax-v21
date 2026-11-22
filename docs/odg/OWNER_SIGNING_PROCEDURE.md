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
openssl genpkey -algorithm ed25519 -out ~/odg-owner/owner.pem   # keep private, offline backup
openssl pkey -in ~/odg-owner/owner.pem -pubout -out ~/odg-owner/owner.pub
npx tsx runtime/bin/odg-owner-sign.ts fingerprint --pub ~/odg-owner/owner.pub
```

The tool refuses a private key located inside the repository.

## 2. Pin the fingerprint (owner-reviewed PR)

Add the printed hex fingerprint to `TRUST_ANCHORS.json`:
- under `INSPECTION_RECORD` to sign inspection records;
- under `MATURITY_EVIDENCE` to sign maturity evidence.

Pinning a key is the trust decision itself. Review it as such.

## 3. Sign

Before signing, read the record or evidence. A signature attests that **you** reviewed it.

**Gate inspection record** (example: the resident-confinement experiment):

```sh
npx tsx runtime/bin/odg-owner-sign.ts inspection \
  --record docs/odg/evidence/V15_RESIDENT_CONFINEMENT_INSPECTION.json \
  --key ~/odg-owner/owner.pem --days 30
```

This writes `…_INSPECTION.sig.json`.

**Maturity evidence:**

```sh
npx tsx runtime/bin/odg-owner-sign.ts maturity --contract WIC-ID \
  --evidence docs/odg/evidence/X.json --claim 'a|is|b' --level EXPERIMENTAL --key ~/odg-owner/owner.pem
```

This writes `X.json.sig.json`.

## 4. Commit the sidecar to `main`

The checks read the record and its sidecar from `origin/main`.

Any later edit to the record or evidence invalidates the signature: the check returns `CONTENT_MODIFIED` or a hash mismatch.

Signatures expire after at most 90 days (default 30).

Rerun `runtime/bin/odg-gate-experiment-resident-confinement.ts`. The two review conditions then pass, provided that:
- the key is pinned;
- the sidecar is on `main`.

## Revocation / rollback

To revoke, remove the fingerprint from `TRUST_ANCHORS.json`. Every signature made with that key stops counting immediately.

## Scope

A valid signature proves integrity and origin (`provesTruth:false`), never truth.

`INTEGRATE` means merge-eligible only. Deployment stays owner-gated.
