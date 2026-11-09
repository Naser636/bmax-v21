# Audit-Log Keyed-Integrity — Key-Management Options (decision prep for `p0e-audit-log-keyed-integrity`)

**Status: decision prep — the key-custody choice is OWNER-GATED.** Per the owner's maximum-unblock delegation §2
("préparer les options de gestion des clés") and §4 ("n'invente aucun secret"). **No key is created, stored, or
committed here.** This document presents the options so the owner can choose; until then the item stays `BLOCKED` on the
owner's key-custody decision.

## What is already DONE (internal, no secret)

The **mechanism is fully implemented and proven** in `runtime/core/audit-log.ts` (20 assertions in the gate):

- **Keyed link hash:** `HMAC-SHA256(key, material)` when a non-empty key is supplied; plain `sha256(material)` when
  not — backward compatible. A full-rewrite attacker **cannot** recompute a keyed chain without the key.
- **Tip-anchor:** `verifyChain(..., { expectedTip: { length, tipHash } })` detects **tail-truncation** (the prefix-chain
  gap that let a truncated chain still verify `ok:true`).
- **NUL-preimage hazard FIXED:** the `seq\0prevHash\0payload` separator is written as the `\0` **text escape** (git-diffable
  plain-text source) producing the **identical runtime preimage** — so every historical sealed hash is preserved (the
  keyless NUL format is pinned by a non-self-referential historical-hash test).

**The only missing piece is the key itself** — creation, storage, rotation — which is a secret-management decision the
owner must make. ODG will not invent or store a secret.

## Key-custody options (owner picks one)

| Option | How the key is provided | Pros | Cons / risk |
|---|---|---|---|
| **1. Environment variable** (`ODG_AUDIT_HMAC_KEY`) | owner sets the env var at runtime; never committed | simplest; no file at rest; standard 12-factor | visible to the process env / child processes; lost on host reset unless re-provisioned |
| **2. Restricted key file** (`0400`, outside the repo) | owner writes a `chmod 400` file ODG reads at start | survives restarts; filesystem ACL control | at rest on disk; backup/rotation discipline needed; must be git-ignored |
| **3. External KMS / secrets manager** | owner configures a KMS; ODG fetches at start | rotation + audit + HSM-grade custody | requires a KMS (infra + possibly paid — owner-authorized only) |
| **4. Owner passphrase → KDF** (scrypt/argon2id) | owner supplies a passphrase; key derived at start | nothing secret at rest; memorable custody | passphrase strength dependent; derivation params must be pinned |

**Recommended default:** **Option 2 (restricted key file)** for a single-host deployment — survives restarts, no extra
infra, filesystem-ACL protected — graduating to **Option 3 (KMS)** if/when the host is exposed or multi-tenant. Option 1
is acceptable for ephemeral/dev; Option 4 if the owner prefers passphrase custody.

## Rotation & anchor discipline (applies to any option)

- Rotating the key **re-seals forward only**: old entries keep their old-key HMACs; verification uses the key that
  sealed each segment (record a key-epoch boundary in the chain). Never re-HMAC historical entries silently.
- Persist the current **tip anchor** `{length, tipHash}` out-of-band (owner-controlled) so truncation is detectable even
  against an attacker who controls the log file.

## One-step activation once the owner decides

1. Owner provisions the key via the chosen option (sets `ODG_AUDIT_HMAC_KEY` / key file / KMS handle / passphrase).
2. ODG passes `{ key }` to `appendEntry`/`verifyChain` (already supported — no code change) and persists the tip anchor.
3. `audit-log.test.ts` already proves full-rewrite resistance + truncation detection under a key; the item flips to
   ACCEPTED with the activation evidence (the key value itself is never recorded).

**Until the owner provisions a key, `p0e-audit-log-keyed-integrity` stays BLOCKED** — mechanism proven, custody pending.
No secret was invented or stored.
