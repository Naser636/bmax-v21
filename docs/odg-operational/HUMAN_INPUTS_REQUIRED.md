# ODG — HUMAN_INPUTS_REQUIRED (single consolidated dossier)

> **Purpose.** The ONE short, ordered list of the only inputs, accesses and decisions that ODG cannot
> obtain or execute itself. ODG has completed every safe, authorized, local technical task; what remains
> below is genuinely human/external. **Placeholders only — ODG invents no legal/commercial value, key,
> token, address, registration or identity.** Detail lives in `DEPLOYMENT.md` (host/ops) and
> `LAUNCH_READINESS.md` (commercial chain + config); this file indexes + consolidates, it does not duplicate.
> Nothing here blocks independent local work; each item is needed only at the point stated.

Status @ `8fde465`: runtime = compiled TypeScript default + `ODG_RUNTIME=js` rollback (proven); deployment
level = **READY_FOR_LOCAL_INSTALL** (staging/production require the host items below). No `.js` deleted.

---

## A. External ACCESS (gates deployment + JS-retirement #7; ODG has none of these)
| # | Input / access | Why | When required | Validation |
|---|---|---|---|---|
| A1 | **Production/staging host** (SSH to a real server) | run the app off loopback; establish persistent store | staging + production | `ssh` works; `node server.js` serves; `GET /api/health` → 200 |
| A2 | **Persistent store path** `ODG_CLIENT_STORE` on a real disk, owner-only `0700` | durable intake; else `/api/health` 503 fail-closed | staging + production | dir writable; health READY; survives restart |
| A3 | **Off-host backup destination** (host + credentials) | off-host copy/restore + the §M-3 #7 live rollback drill (currently HOST-BLOCKED) | before production + before any JS retirement | restore byte-identical (`client-store-backup.js`); rollback drill N↔N-1 green on the live host |
| A4 | **Domain + DNS control** | public reachability of `/api/intake`, `/api/health` | production | DNS resolves to the host |
| A5 | **TLS certificate + reverse proxy** (e.g. nginx/Caddy) | HTTPS termination; no TLS artifact is shipped | production | `https://<domain>/api/health` → 200, valid cert |

## B. SECRETS (configure out-of-band in a host secret store — never in VCS/logs; `.env*` is git-ignored)
Names/format/role documented in `DEPLOYMENT.md` §2/§2.1/§2.2 and `LAUNCH_READINESS.md`. All OPTIONAL to serve
locally; required only for the stated capability. **Provide values yourself; ODG will not request secret
values in chat/reports.**
| # | Variable | Role | Required when | Format |
|---|---|---|---|---|
| B1 | `ANTHROPIC_API_KEY` | Claude live provider | live engineering/provider path (default OFF) | `sk-ant-…` (placeholder) |
| B2 | `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`/`OPENAI_MODEL`, `OPENAI_LIVE=1`) | OpenAI live provider | live provider path (default OFF) | `sk-…` (placeholder) |
| B3 | `IMAP_*` / `SMTP_*` (`EMAIL_SEND_ENABLED`) | email intake/response | email capability (see `EMAIL_INTAKE_SETUP.md`) | host/port/user/`<secret>` |
| B4 | Payment webhook secret (`PAYMENT_LIVE_ENABLED` gated) | verified payment reconciliation | payments go-live | provider-defined |
| B5 | Fiscal/seller params (invoicing) | issue legally-valid invoices | invoicing go-live | per `LAUNCH_READINESS.md` §34 |

## C. ADMINISTRATIVE / COMMERCIAL identity (ODG invents NONE — supply real values; placeholders until then)
Required only to operate commercially / issue invoices / publish legal notices — NOT to run the software.
VAT is **not universally mandatory** — confirm applicability for the seller's legal status/country.
| # | Field | Why | Format / validation | Placeholder |
|---|---|---|---|---|
| C1 | Legal entity name (+ trade name if different) | invoices, legal notices | exact registered name | `<LEGAL_NAME>` / `<TRADE_NAME?>` |
| C2 | Legal form + country of registration | legal notices, tax | e.g. SAS/SARL/sole-trader; ISO country | `<LEGAL_FORM>` / `<COUNTRY>` |
| C3 | Registered legal address | invoices, mentions légales | postal address | `<LEGAL_ADDRESS>` |
| C4 | Company registration number (e.g. SIREN/SIRET) | invoices (if applicable) | per jurisdiction | `<REGISTRATION_NO?>` |
| C5 | Intra-community VAT number (**if applicable**) | invoices (only if VAT-registered) | per jurisdiction; may be N/A | `<VAT_NO?>` |
| C6 | Responsible person + contact | accountability, legal contact | name + email/phone | `<OWNER_NAME>` / `<OWNER_CONTACT>` |
| C7 | Business email + technical admin email | client comms / ops alerts | valid addresses | `<BUSINESS_EMAIL>` / `<ADMIN_EMAIL>` |
| C8 | Domain + DNS registrar access | public service + email | domain + registrar login (held by owner) | `<DOMAIN>` |
| C9 | Billing details (for paid external services) | pay providers/host | owner's payment method | `<BILLING>` |
| C10 | Legal terms / privacy policy / mentions légales | required by the features actually shipped (intake form, email, invoicing) | human/legal authoring | `<LEGAL_TERMS>` |

## D. RESERVED decisions (governance — not auto-executed; evidence + risk recorded in the roadmap)
| # | Decision | Why reserved | Prerequisite |
|---|---|---|---|
| D2 | Authorize §M-3 #8 **Stage B** (test-infra migration off the legacy `.js`) | the 83 equivalence benches + 107 historical suites guard the LIVE JS rollback parity; retiring them is only safe **after** rollback retirement (#7) | A3 (off-host rollback drill) first |
| D3 | **Ph.11 ENFORCE-by-default** flip | behavior change (deny-by-default write enforcement); doctrine decision | staged-enforce criteria + reversible flip |
| D4 | **Workspace-local compiled-runtime resolution** for the 7 Option-C adapters | changes a correctness/authorization contract (admitted deferred/unauthorized nominations if done naively) | architecture spec + compatibility tests + preserved corrective-queue assertions |
| D5 | §M-3 #8 **`.js` deletion** | criteria #2 (no active consumer) + #7 (reversible rollback) + exact manifest + CTO authorization all required | D2 + A3 + manifest |
| D6 | **Dependency-advisory remediation** (`npm audit`: 6 advisories — `sharp`/image-codecs, `source-map-js`) | the only non-trivial fix forces a BREAKING `next@16.4.2` major (outside range); both advisories are OFF the loopback surface (image optimizer / build-time) | decide: accept off-surface risk, OR authorize a tested rollback-guarded upgrade mission (full suite + health re-verify) — see `ODG_SSDF_TRACEABILITY.md` |

**Ordering:** A3 (off-host access) is the keystone — it unblocks #7 → D2 → #2 → D5, and A1/A2/A4/A5 enable
staging→production. B/C items are needed only at their stated go-live point. D3/D4 are independent doctrine/
architecture decisions. Supply nothing before it is needed; local technical work continues regardless.

## E. HOST / TOOLCHAIN (environment — NOT an ODG defect; diagnosed read-only 2026-10-19)
| # | Item | Diagnosis | Human remediation (ODG will NOT execute) |
|---|---|---|---|
| E1 | Claude Code auto-update: **"no write permission to npm prefix"** | npm global prefix = `/usr/local` (owner `root:root`, 0755); Claude Code is installed at `/usr/local/lib/node_modules/@anthropic-ai/claude-code` (root-owned); the session runs as non-root `ubuntu` (uid 1000) → the global `node_modules` is not writable → auto-update cannot write. A root-owned global install run as a non-root user — an install/host property, not an ODG runtime defect. No effect on the ODG runtime or the SLO/governance work. | Run `claude doctor` for the documented check. Then EITHER (a) update with elevation out-of-band (e.g. a maintainer runs the documented global update as the install owner), OR (b) migrate to a user-writable install (user-level npm prefix + PATH, or the local installer per Claude Code docs). ODG does **not** run sudo, chown the prefix, reinstall globally, or change persistent npm config without explicit authorization. |
