# Excellence Roadmap — Historical-Source Inventory & Reconciliation (V1, 2026-10-31)

**Not a roadmap.** This is a *reconciliation instrument*: it maps the CTO-supplied **work reconstruction**
(`ODG_MASTER_ROADMAP_EXCELLENCE_OPERATIONNELLE_RECONSTRUCTION_V1.md`) — a stand-in for the **not-yet-recovered**
28-July-2026 original — onto the EXISTING canonical sources, so no second competing strategic roadmap is created.
The single operational SSOT stays `ODG_MASTER_ROADMAP.md §Q` + `runtime/governance/ROADMAP.json` + the mission
ledger + `closure-register.json`, cross-walked by `ODG_ROADMAP_CROSSWALK.md`.

Truth Lock at authoring: `main @ 1ed65c5` (after P0 slice 1 #286 + closure-sync #287), 0 open PRs.

---

## 1. Historical sources — FOUND (present in the repo)

| Source | Path | Role | Disposition |
|---|---|---|---|
| FROZEN Master V5 (FICHE 01–07) | `docs/odg-master-v5/source/ODG_FINAL_MASTER_V5_FICHE_0{1..7}.md` | Authority on "what must be true"; 9 primitives (FICHE_01:1147), A01–A54, 50K/166 hierarchy | PRESENT — authority; not edited |
| V5 roadmap + work method | `docs/odg-master-v5/source/ODG_V5_ROADMAP_WITH_WORK_METHOD.md` | V5 Phase 1–5 program | PRESENT |
| Operational master roadmap | `docs/odg-operational/ODG_MASTER_ROADMAP.md` | SSOT §Q (P0–P10) + §K autonomy ladder + §G APEX + §X documentary excellence (2026-10-17) | PRESENT — canonical; FROZEN-Master, not edited |
| Roadmap crosswalk | `docs/odg-operational/ODG_ROADMAP_CROSSWALK.md` | Traceability of every legacy ladder → canonical | PRESENT |
| Machine roadmap manifest | `runtime/governance/ROADMAP.json` | 11 missions (self-declares 8 in older header); commit-dated **2026-07-28 `072a114`** | PRESENT — protected; not edited |
| Closure register (P1/P2) | `docs/odg/closure-register.json` | 124 lot ids; 114 ACCEPTED | PRESENT |
| Master completion register | `docs/odg/V46_MASTER_COMPLETION_REGISTER.md` | Prose master register | PRESENT |
| Legacy FND-F / Sprint ladders | `docs/FEUILLE_DE_ROUTE.md`, `docs/ROADMAP.md`, `docs/FOUNDATION_STATUS.md` | Superseded; banner-closed | PRESENT (history) |
| Excellence-campaign docs | `docs/odg-operational/{AUTONOMY_EXCELLENCE_CAMPAIGN_7DAY,ODG_CAPABILITY_EXCELLENCE_CAMPAIGN_V1,EXCELLENCE_COVERAGE_MATRIX_V1,ODG_TOOL_EXCELLENCE_AND_ROADMAP_COMPLETION_V1_REPORT}.md` | Operational excellence work | PRESENT |
| Market/capability roadmap | `docs/market-research/06_CAPABILITY_TARGET_AND_ROADMAP.md` | Capability targets | PRESENT |

## 2. Historical sources — STILL ABSENT (to recover)

| Source | Expected | Evidence of absence | State |
|---|---|---|---|
| **"ODG MASTER ROADMAP D'EXCELLENCE OPÉRATIONNELLE" (28 July 2026)** — the ORIGINAL | A standalone French strategic excellence roadmap | NOT LOCATED in working tree OR full git history (`ODG_ROADMAP_CROSSWALK.md` §5.4 L105; `grep -ri "excellence opérationnelle\|28 juillet\|28 july 2026"` → only *references-to-absence*) | **BLOCKED — to recover** (register `historical-roadmap-excellence-28jul-recover`). The CTO reconstruction V1 stands in; it is NOT the original. |
| 28-July "Excellence Opérationnelle" as a distinct doc vs §X | Clarify whether it was ever a standalone doc | Closest real artifact = `ODG_MASTER_ROADMAP.md` §X "MASTER ROADMAP OF OPERATIONAL EXCELLENCE — DOCUMENTARY INTEGRATION" (English, dated 2026-10-17) | UNKNOWN — owner confirmation needed |

## 3. Contradictions / provenance notes (never resolved by overwrite — reality wins)

1. **"28 July 2026" date collision.** The date maps, in the repo, to the **machine** roadmap `runtime/governance/ROADMAP.json` commit `072a114` (`ODG_OPERATIONAL_MANIFEST.json:34` `version_date: commit 2026-07-28`), NOT to a found French *excellence* strategic document. The reconstruction may conflate the machine-roadmap 28-July commit with a strategic doc that was never located. **Recorded, not resolved** — pending the original.
2. **Mission count drift.** `ROADMAP.json` older self-declaration says "8 missions"; the Phase-F audit established **11** canonical missions (crosswalk §4 L81). The crosswalk count (11) is authoritative; the manifest header is historical.
3. **Claude-Code interface vs VPS "26-July historical state".** Old VPS commands recovered a *historical* repo state (~26 July 2026). That observation is **distinct history**, NOT the current resume point. The current resume source is this Claude Code session's output (see `ODG_PROJECT_STATE.md` continuity section). The two are kept as separate observations with their own HEAD/date/source; neither overwrites the other.

## 4. Reconciliation of the reconstruction onto the canonical SSOT

The reconstruction introduces **no new requirement** that the canonical sources do not already carry. Mapping:

| Reconstruction element | Canonical home (already exists) | Status |
|---|---|---|
| Part II §3–4 (50K/166/A01–A54/9 primitives) | FROZEN Master FICHE_01:1138–1147 | ALREADY CANONICAL (frozen) |
| Part III §6–8 (authority, mission cycle, L0–L6) | `ODG_AUTONOMOUS_WORK_PROTOCOL.json` + `ODG_MASTER_ROADMAP.md §K/§S-2` | ALREADY CANONICAL |
| Part IV §9 Phase 0 | Phase-0 recovery (this lot) + `ODG_ROADMAP_CROSSWALK.md` | IN PROGRESS (this lot) |
| Part IV §10 P0 (P0.1–P0.6) | §Q P0 register items (all ACCEPTED) + **P0.5 = `p0-autonomy-program-aggregate` (#286, slice 1 ACCEPTED; slice 2 actor-provenance owner-gated)** | MOSTLY ACCEPTED; P0.5 slice 2 pending |
| Part IV §11 P1 / §12 P2 | `closure-register.json` P1/P2 (114 ACCEPTED / 10 owner-gated) | RECONCILED by register + crosswalk |
| Part V §13 D1–D8 | 11-domain map (V21 memory: D1–D8 + H1/H2/H3) + register lots | PRESENT; per-domain state/proof audit = open work (Part IX §21) |
| Part V §14 H1–H3 | H1→D2, H2→D5+D7, H3 CRM (DISCLAIMED no-product) — `PORTFOLIO_RECONCILIATION.md` | PRESENT; preserved |
| Part VI axes A/B/C | campaign-controller/dep-planner (A); eval-metrics/fairness/autonomy-aggregate (B); crosswalk/reconciliation (C) | PARTIAL — demonstrated, ongoing |
| Part VII research / VIII product / IX closure / X continuity | crosswalk §7, dossiers, `ODG_PROJECT_STATE.md` | PRESENT |

**Gap this reconciliation surfaces (not a new roadmap — a tracking note):** Part IX §21 asks for a *per-domain* ACCEPTED state with explicit proofs + consumers + independent verification for D1–D8. The register tracks lots, not a per-domain roll-up. A future **read-only** lot could produce a D1–D8 state matrix from existing register + ledger evidence (no new capability, no execution-path change) — candidate, owner-prioritised, NOT started here.

## 5. Rule

If the authentic 28-July-2026 original is recovered, it supersedes the reconstruction; update the reconstruction
banner + this inventory with the found artifact's path/commit/sha. **No observation is overwritten without proof.**
