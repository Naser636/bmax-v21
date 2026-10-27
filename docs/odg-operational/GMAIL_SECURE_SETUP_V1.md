# ODG — Gmail secure setup & send preflight (V1, 2026-10-27)

Extends `GMAIL_CHANNEL_DIAGNOSTIC_V1` with the mechanism decision + the fail-closed preflight result. **No password/
app-password/MFA/token requested, shown, stored, logged, or committed. No message sent. €0.**

## Mechanism decision: SMTP app-password (not OAuth) — retained
| option | status | verdict |
|---|---|---|
| **SMTP + Gmail app-password** (email-gateway.ts, nodemailer installed) | supported in-repo, €0, no new dependency | **RETAINED** — simplest compliant path; TLS on; secret via env only |
| OAuth2 connector (googleapis) | **not present** (no googleapis lib, no connector) | would add a dependency + a Google OAuth app/consent; not needed for a 5-message batch; defer |
Gmail SMTP does **not** accept the account password → an **App Password** is required, which needs **2-Step Verification ON**.

## Eligibility / limits (verify on the account)
- 2FA must be enabled to create an app password. Gmail send limits (~500 recipients/day for free accounts) are far above
  a 5-message batch — no limit issue. No purchase; €0.

## Secure configuration (CTO does this; ODG never handles the secret)
Set in an **env file outside the repo** (gitignored), e.g. `~/.config/odg/gmail.env`:
`SMTP_HOST=smtp.gmail.com` · `SMTP_PORT=465` · `SMTP_USER=akabinasreddin@gmail.com` · `SMTP_PASS=<16-char app password>`
· `EMAIL_SEND_ENABLED=1`. The app password is **entered directly into the environment**, never pasted into chat, a
commit, a log, or terminal history. Do not disable 2FA or weaken security.

## Preflight / dry-run result (live, no send) — `prospection-send-gate.ts`
- `dryRun()` on the current env: **channelState NOT_CONFIGURED, sendEnabled=false, willSend=false** (fail-closed).
- `preflight()` for the batch: **BLOCKED** — blockers: (1) recipient address NOT verified, (2) channel not ready, (3) no
  human CTO authorisation. **sendEnabled stays false** until SMTP + `EMAIL_SEND_ENABLED=1` are set.
- Tests prove: SENT in the registry requires a provider **message-id proof**; `preflight` ADMITs only when address +
  message + compliance + channel-ready + no-opt-out + CTO-auth are ALL true; **config ≠ authorisation** (both required).

## Status & human step
**BLOCKED (channel + address + authorisation).** Human steps: enable 2FA → create app password → put it in
`~/.config/odg/gmail.env` (env-only) → `EMAIL_SEND_ENABLED=1` → grant per-send authorisation. ODG continues all other
work meanwhile and will **not** claim the account is connected until `outboundReadiness` reports READY.
