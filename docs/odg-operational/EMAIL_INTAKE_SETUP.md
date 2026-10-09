# ODG — Email Intake Setup (safe example configuration)

_Operational setup note. Placeholders only — **never commit a real `.env`** (the repo ignores `.env*`).
Secrets are read from the environment by name; ODG never logs, prints, persists or passes them on argv.
Email sending is **disabled by default** and stays disabled unless explicitly configured AND authorized._

## Configuration (environment variables)

Create a local `.env` (git-ignored) or export these in the ODG process environment — **placeholders only below**:

```bash
# Inbound (IMAP) — TLS + certificate verification are always enforced (no downgrade).
IMAP_HOST="imap.your-provider.example"
IMAP_PORT="993"
IMAP_USER="ops@your-domain.example"
IMAP_PASS="<app-password-or-token>"     # a secret — keep out of git, logs and argv

# Outbound (SMTP) — drafts are inert; sending stays OFF unless EMAIL_SEND_ENABLED=1 AND a human grant.
SMTP_HOST="smtp.your-provider.example"
SMTP_PORT="465"
SMTP_USER="ops@your-domain.example"
SMTP_PASS="<app-password-or-token>"      # a secret
EMAIL_SEND_ENABLED="0"                    # "1" only when a human authorizes real sending
```

## Commands (local, governed)

```bash
./runtime/bin/odg client mailbox          # readiness: inbound/outbound state (NOT_CONFIGURED/READY), TLS, sendEnabled
./runtime/bin/odg client fetch            # retrieve UNSEEN inbound mail → governed HELD intake records (dedup by message-id)
./runtime/bin/odg client list             # list client requests (id, status, client, owner)
./runtime/bin/odg client get <CLIENT-NNN> # inspect one request (no secrets persisted)
./runtime/bin/odg client respond-draft <CLIENT-NNN>   # inert response draft (a human sends it)
```

## Behaviour & gates (governed)

- **Inbound ⇒ HELD.** An inbound email becomes a client-intake record with `consent:false` ⇒ status **HELD**
  (human qualification required). An inbound email is **not** blanket consent for all processing.
- **Dedupe/idempotent** by provider `message-id`; re-fetching the same message creates no duplicate.
- **Provenance** (message-id, from, subject, date, request-id) is kept in a git-ignored store; **credentials
  and full message bodies are not** (only a bounded text excerpt is stored).
- **Prompt-injection safe:** email content is untrusted DATA and is never executed as instruction/authority.
- **Outbound:** drafts are inert; `sendResponse` fails closed — `SEND_DISABLED` unless `EMAIL_SEND_ENABLED=1`,
  then `SEND_NOT_AUTHORIZED` unless a human grant (`human:true`+owner) and a configured transport are supplied.
- **Readiness** distinguishes `NOT_CONFIGURED` / `READY` / `BLOCKED` without exposing secret values.

## Remaining prerequisite to go live
Provide real IMAP (and, for replies, SMTP) credentials in the environment. Until then `odg client mailbox`
reports `NOT_CONFIGURED` and `odg client fetch` fails closed — **no mailbox is connected**.
