# ODG — Gmail / send-channel diagnostic (V1, 2026-10-27)

Read-only diagnostic for the first authorised B2B batch. CTO-declared address: **akabinasreddin@gmail.com**. **No
password/app-password/MFA/token was requested, shown, stored, or transmitted.** No test message sent. **Cost €0.**

## Result: send channel = BLOCKED (NOT_CONFIGURED)
| check | finding |
|---|---|
| Email gateway module | **EXISTS** — `runtime/core/email-gateway.ts` (governed, fail-closed; "no message sent by default") |
| Transport library | `nodemailer` **installed** |
| `outboundReadiness()` (live) | **state NOT_CONFIGURED, sendEnabled=false, tls=true** |
| SMTP credentials | **ABSENT** — only `github.env` + `replicate.env` in `~/.config/odg`; no SMTP_* / Gmail env |
| OAuth/Gmail connector | **none present** |
| Account connected? | **NO** — akabinasreddin@gmail.com is not connected; identity cannot be confirmed in-session |

## What the gateway requires to send (exact, from `email-gateway.ts`)
Sending is fail-closed and needs ALL of: (1) SMTP config via **env by name** — `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`; (2) `EMAIL_SEND_ENABLED=1` (disabled even when configured); (3) a human **authorization** grant
(`{by:"human", owner}`); (4) an injected transport (nodemailer, present). None of (1)–(3) are set ⇒ **cannot send**.

## CTO setup steps (Gmail, €0 — ODG must NOT do these; they involve secrets)
Gmail SMTP does **not** accept the account password; it needs an **App Password** (requires 2-Step Verification ON):
1. Enable 2FA on akabinasreddin@gmail.com (Google Account → Security).
2. Create an **App Password** (Google Account → Security → App passwords) — 16-char, Gmail-generated.
3. Provide it to the runtime **by environment variable only**, e.g. in `~/.config/odg/gmail.env` (gitignored, never in the
   repo): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=akabinasreddin@gmail.com`, `SMTP_PASS=<app-password>`,
   `EMAIL_SEND_ENABLED=1`. **ODG will never ask for, print, or commit this value.**
4. Grant the per-send human authorization (`owner`) at send time.
**Do NOT** disable 2FA, weaken Google security, or paste the password into chat/repo. TLS stays on (no downgrade).

## Security posture (respected)
Secrets by env-name only; never logged/persisted/on argv; TLS + cert verification always on; email content is untrusted
DATA, never executed as authority; app-password route (not password); no bypass of 2FA/Google protections/provider limits.

## Status
**BLOCKED — no authorized send channel.** The 5 batch messages are prepared + compliance-checked + recorded as NOT_SENT
(`PROSPECTION_BATCH_1_V1.md`). ODG will send **only** after the CTO completes the steps above AND grants per-send
authorization AND the compliance gate passes — and will record a send **only** with a provider message-id proof. Second
blocker: no **verified recipient professional addresses** for named individuals (would need sourcing/verification; not done).

## Next exact action (CTO)
Provide Gmail SMTP app-password via `~/.config/odg/gmail.env` (env-only) + set `EMAIL_SEND_ENABLED=1`, OR decline. Until
then ODG holds the drafts. €0.
