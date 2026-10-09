# ODG — Commercial Launch Readiness

_Operational control for the full commercial chain. Placeholders only — **never commit a real `.env`**
(`.env*` is git-ignored). Secrets are read from the environment by name; ODG never logs, prints, persists
or passes them on argv. Nothing is declared READY on the basis of env presence alone — each capability has a
real control (see `runtime/core/launch-readiness.js`)._

## Global readiness command

```bash
./runtime/bin/odg client launch
# → { overall, codeReady, launchConfigured, capabilities{...}, blockers[], notConfigured[], humanPrerequisites[] }
# overall ∈ READY | TEST_MODE | NOT_CONFIGURED | BLOCKED
```

Per-capability states: **READY** (configured + control passed), **NOT_CONFIGURED** (a secret/param missing),
**BLOCKED** (a mandatory control/authorization fails), **TEST_MODE** (verified in test mode only).

## Commercial chain (implemented, governed, offline-tested)

SITE → DEMANDE → INTAKE → QUALIFICATION (humaine) → DEVIS → ACCEPTATION (humaine) → MISSION AUTORISÉE →
EXÉCUTION → VÉRIFICATION → LIVRAISON → FACTURE → PAIEMENT (vérifié) → CLÔTURE.

| Component | Module | Status |
|---|---|---|
| Site reception | `site/contact.html` form → **POST `/api/intake`** (Next route `src/app/api/intake/route.ts` → `intake-endpoint.js`) + `mailto:` fallback → IMAP intake | handler READY (local, tested); **deployment NOT verified** |
| Intake / tracking | `client-intake.js` (`odg client`) | READY |
| Email in/out | `email-gateway.js` (imapflow/nodemailer, injected) | NOT_CONFIGURED until creds; send OFF by default |
| Quote | `quote.js` (versioned, human-gated) | READY |
| Invoicing | `invoicing.js` (gapless #, immutable, credit notes, tax/rounding) | engine READY; **fiscal params required to issue** |
| Payments | `payments.js` (HMAC webhooks, verified-only, idempotent) | NOT_CONFIGURED → TEST_MODE → READY |
| Delivery | `pilot-delivery-packager.js` (read-only, confined) | READY |

## Configuration (placeholders only)

```bash
# Email (see EMAIL_INTAKE_SETUP.md)
IMAP_HOST=…  IMAP_PORT=993  IMAP_USER=…  IMAP_PASS=<secret>
SMTP_HOST=…  SMTP_PORT=465  SMTP_USER=…  SMTP_PASS=<secret>  EMAIL_SEND_ENABLED=0

# Invoicing fiscal parameters (mandatory to ISSUE; missing ⇒ NOT_CONFIGURED, issuance blocked)
INVOICE_SELLER_NAME="…"  INVOICE_SELLER_ADDRESS="…"  INVOICE_SELLER_TAXID="FR…"
INVOICE_CURRENCY="EUR"   INVOICE_TAX_RATE="0.20"      # or "EXEMPT"

# Payments (webhook reconciliation; real initiation disabled unless PAYMENT_LIVE_ENABLED=1)
PAYMENT_PROVIDER="…"  PAYMENT_WEBHOOK_SECRET=<secret>  PAYMENT_LIVE_ENABLED=0

# Website intake deployment (optional) — the externally reachable URL of POST /api/intake once the ODG app
# is deployed. Setting it does NOT prove reachability; `odg client launch` keeps it NOT_CONFIGURED until a
# real deploy probe.
INTAKE_ENDPOINT_URL=""

# Persistent intake store (MANDATORY in production) — absolute path on the VPS persistent disk. If unset in
# production, intake is BLOCKED cleanly (503) — ODG never writes to a silent ephemeral/temporary store.
ODG_CLIENT_STORE="/var/lib/odg/clients"
# Optional: override the site root served by GET /site/* (defaults to <repo>/site).
ODG_SITE_ROOT=""
```

## VPS deployment (mono-instance) — same-origin architecture
- **Same origin:** the Next app serves BOTH `GET /site/*` (the commercial site incl. the contact form, from
  the single `site/` source via `src/app/site/[...slug]/route.ts`) and `POST /api/intake`. The form posts to
  same-origin `/api/intake` — no cross-origin gap. (`mailto:` remains a fallback.)
- **Persistent storage:** set `ODG_CLIENT_STORE` to a path on a **persistent disk** (e.g. `/var/lib/odg/clients`),
  owned by the app user with `0700` permissions. Intake records are written there with exclusive create
  (no overwrite). **Backup:** snapshot/rsync that directory regularly; it holds the client requests.
- **Mono-instance only:** id allocation is collision-safe under a single Node instance (synchronous
  read→exclusive-create, bounded retry) and the exclusive flag defends a same-disk concurrent writer. This is
  **NOT proven for multi-instance / load-balanced** deployments — do not run more than one instance against the
  same store without a shared lock/DB (out of current scope).
- **Clean failure:** if `ODG_CLIENT_STORE` is unset or unwritable in production, `POST /api/intake` returns
  **503 STORE_NOT_CONFIGURED** (no false success, no temp store).
- **Post-deploy probe (run after deploying, not in this repo):**
  ```bash
  curl -fsS https://<host>/site/contact.html | grep -q '/api/intake'        # form served same-origin
  curl -fsS -X POST https://<host>/api/intake -H 'content-type: application/json' \
       -d '{"client":"probe","problem":"p","scope":"s","acceptance":"a","humanOwner":"you","consent":true}'
  # expect 201 + {"requestId":"CLIENT-NNN"} AND the file present under $ODG_CLIENT_STORE/requests/
  ./runtime/bin/odg client launch   # persistence READY, siteIntakeHandler READY
  ```
  `odg client launch` reports READY only when the store probe passes; deployment reachability itself is proven
  by the curl probes above (never asserted by the repo).

## Website → intake (server route)
- `site/contact.html` now includes a request form that POSTs JSON to **`/api/intake`** (same-origin), with
  the `mailto:` button kept as a fallback. The form is active only when the site is served by the ODG app.
- `src/app/api/intake/route.ts` (Next 16 Route Handler, Node runtime, `force-dynamic`) bridges the request to
  `intake-endpoint.handleIntakeRequest` — server-side validation (method/content-type/size/JSON), governed
  persistence, and success returned ONLY after durable persistence. Client-provided identity/consent/price/
  authorization are never trusted.
- **Deployment is a separate fact:** the handler is implemented and locally tested; it is NOT externally
  reachable until the ODG app is actually deployed and probed. `odg client launch` reports
  `siteIntakeHandler: READY` but `siteIntakeDeployment: NOT_CONFIGURED (deploymentVerified:false)`.

## Startup procedure (controlled launch)
1. Export the environment (local `.env`, git-ignored).
2. `./runtime/bin/odg client launch` → expect `TEST_MODE` (payments in test) before going live.
3. `./runtime/bin/odg client mailbox` → `READY`; `./runtime/bin/odg client fetch` to ingest inbound leads.
4. Human qualifies a lead, approves a quote (price is a **human decision** — never invented), authorizes the
   mission; ODG executes → verifies → packages delivery.
5. Human validates + issues the invoice; payment is confirmed only by a **verified** provider webhook.

## Fiscal / legal — TO CONFIRM BY A HUMAN (not asserted by ODG)
- French invoicing mandatory mentions, SIREN/SIRET/VAT applicability per the seller's legal status.
- French **e-invoicing / Factur-X** obligations and timeline. The invoicing engine computes amounts and
  enforces lifecycle/immutability but **does not certify legal compliance**. Missing mandatory fiscal data is
  `NOT_CONFIGURED` and **blocks real issuance**. Confirm with a qualified accountant/lawyer before real issuance.

## Remaining human/provider prerequisites
Real qualified client + bounded scope · per-mission human authorization grant · approved price · IMAP/SMTP
credentials · fiscal seller/tax parameters · payment provider + webhook secret · legal/e-invoicing sign-off ·
a hosted backend if the website form (not the mailto path) is to POST to `intake-endpoint`.
