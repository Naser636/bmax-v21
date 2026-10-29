# Storefront Build — state & evidence (ODG_ECOMMERCE_OPERATOR_V1)

A **real, functional storefront prototype** was built and locally tested — NOT published, NOT transactional.
Source: `docs/ecommerce/shop/index.html` (self-contained) + `docs/ecommerce/shop/cart-logic.mjs` (unit-tested
commerce logic). It is **isolated** from the live ODG dashboard on :3000 (not wired into `src/app`, not served).

## Build-state matrix (mandate §4 — honest stage separation)
| Asset | Conçu | Implémenté | Testé | Publié | Opérationnel | Ventes vérifiées |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Storefront UI (header, hero, grid, product, cart drawer, checkout step) | ✅ | ✅ | ⚠️ logic tested; full browser E2E NOT run here | ❌ | ❌ | ❌ |
| Catalogue (6 SKUs, prices, categories) | ✅ | ✅ | ✅ (pricing in cart test) | ❌ | ❌ | ❌ |
| Cart + shipping rule (free ≥€49 else €4.90) | ✅ | ✅ | ✅ **7/7 unit tests PASS** | ❌ | ❌ | ❌ |
| Checkout | ✅ | ✅ (UI only) | ⚠️ **payment DELIBERATELY DISABLED** (no card capture) | ❌ | ❌ | ❌ |
| Legal pages (mentions, CGV, rétractation 14j, GPSR note) | ✅ | ✅ (model text) | — needs legal validation | ❌ | ❌ | ❌ |

## What was actually tested (evidence)
- **Cart/pricing logic: 7/7 PASS** (`cart-logic.mjs` unit test): empty cart, below/above free-ship threshold,
  qty multiplication, unknown-SKU ignored, negative-qty ignored. The storefront inlines the identical constants
  (freeThreshold 49.0, flat 4.90 — grep-verified consistent).
- **Storefront structure**: renders catalogue from data; add-to-cart, qty +/−, drawer totals, legal toggles,
  checkout modal all wired in vanilla JS (no framework/deps). **A full real-browser click-through E2E was NOT
  run** (no browser harness in this environment) → marked ⚠️, not ✅.
- **Safety**: top banner "PROTOTYPE NON TRANSACTIONNEL"; checkout pay button disabled; no payment/card fields.

## What is BLOCKED to go further (precise)
| To reach | Needs | Authorization/integration missing |
|---|---|---|
| **Publié** | hosting + domain + TLS (or a marketplace listing) | same public-exposure authorization class as DEPLOY_BMAX; not granted |
| **Opérationnel** | real payment (Stripe/PSP account + keys), order backend, shipping labels | PSP account creation + keys = human/authorization; no commerce backend built |
| **Ventes vérifiées** | published + operational + real buyers | all of the above + real demand |

## How to run/verify locally (reproducible, no system change)
Open `docs/ecommerce/shop/index.html` in a browser (static file), or run the logic test:
`node <sandbox>/cart.test.mjs` → `CART LOGIC: PASS (7/7)`. Nothing is served publicly; :3000 (ODG dashboard)
is untouched.

## Offer (NOT done unprompted — §6 forbids publishing a shop without authorization)
The storefront can be published as a **private, non-transactional prototype Artifact** (viewable by the owner
only) on request. It would remain a mockup (payment disabled), not a live boutique. Awaiting CTO go before any
publish.
