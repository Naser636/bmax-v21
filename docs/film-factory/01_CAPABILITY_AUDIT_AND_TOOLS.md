# ODG_FILM_FACTORY_V1 — Capability Audit + Tool Study (2026-10-24)

Audit = evidence-graded (a capability is PRESENT_PROVEN only with a reproducible test + result). Tool prices =
bounded-PROVIDER web research (cited), dated 2026-10-24; verify at source before any purchase. No tool bought/
activated.

## A. ODG production-capability audit (WITH EVIDENCE)
Environment probe (reproducible): `ffmpeg`/`ffprobe` **MISSING**, `imagemagick` **MISSING**, PIL/moviepy **no**,
node `canvas` **no**, `sharp` **YES**, GPU `nvidia-smi` **NONE**, no local AI-media CLI, no media-gen API keys
detected, disk 166G free.

| Capability | Grade | Evidence / why |
|---|---|---|
| Story/structure/dialogue | **PRESENT_PROVEN** | prior Cinema probe: full dossier + 24/24 deterministic structural checks (reproducible) |
| Character/costume/continuity *bible (text)* | **PRESENT_PROVEN** | text bible + continuity checks demonstrated (same probe) |
| Storyboard / shot-list *as text découpage* | **PRESENT_PROVEN** | shot list produced + verified (same probe) |
| Storyboard *as generated images* | **MISSING** | no image-gen tool/GPU/API |
| Video generation | **MISSING** | no video-gen tool, no GPU, no API key, no credits |
| Visual/temporal consistency across shots | **MISSING** (text-level only) | requires generated footage to verify — none producible here |
| Animation / motion / physics | **MISSING** | n/a without video-gen |
| Voice / lip-sync / music / SFX | **MISSING** | no TTS/music/audio tool installed, no API |
| Editing / rhythm / color / mix / subtitles | **BLOCKED** | `ffmpeg` absent (install = system change + still no footage to cut) |
| Still-image processing (resize/composite existing) | **PARTIAL** | `sharp` present — can process *provided* images, not generate |
| AV quality-control / defect detection | **MISSING** | needs footage + CV tooling |
| Rights / provenance / traceability | **PRESENT_PROVEN** | sha256 + sourceCommit provenance discipline demonstrated |
| Trailer / thumbnail / metadata / publish strategy | **PRESENT_UNPROVEN** (can author text) | strategy authorable; no asset to publish |
| Retention/CTR/views/revenue measurement | **NOT_APPLICABLE** (yet) | requires a published asset |

**Verdict:** ODG can natively execute the **writing + pre-production + planning + provenance + QC-of-text** spine
(PROVEN). It **cannot** natively generate or edit any audiovisual media here (MISSING/BLOCKED). Therefore the §6
**audiovisual prototype is not producible in this environment** without authorized external tools.

## B. Tool study (sourced 2026-10-24; verify at source; commercial-rights noted)
### Video generation
| Tool | Price | Rights | Notes |
|---|---|---|---|
| Runway (Gen-3/4) | $15 (625 cr) / $35 (2,250 cr) /mo | ownership on paid | mature; editor ecosystem |
| Kling | $10 / $37 / $92 / $180 /mo; ~$0.07/s | **right-to-use, NOT clear ownership** | cheap/s; read terms before commercial |
| Google Veo 3.1 | $24/mo, 720p, **45-min/mo cap** | commercial on paid | budget leader; cap matters for a 45-60min film |
| OpenAI Sora | $20/mo (ChatGPT Plus); ~$0.10/s | per OpenAI terms | **20s max clip**, 1080p |
| Pika | free / $8 / $28 / $76 /mo | ownership on paid | |
| Luma Dream Machine | $9.99 (120 gen) / $29.99 (400 gen) | per terms | **5s max clip** |

### Images / character consistency
| Tool | Price | Rights | Notes |
|---|---|---|---|
| Midjourney | $10/$30/$60/$120 /mo | commercial (needs $60+ if >$1M rev) | **V8.2 Edit + Omni Reference = character consistency** |
| Flux.1 [schnell] | free (self-host) | **Apache-2.0, commercial** | needs a GPU to self-host (none here) |
| Flux 2 Pro (API) | $0.055/image | per terms | photoreal |

### Voice / music / SFX
| Tool | Price | Rights | Notes |
|---|---|---|---|
| ElevenLabs (voice) | from $6 Starter; Pro $99 | **commercial from Starter**; Music v2 licensed-data = cleared | safest audio-rights path |
| Suno | $10 Pro / $30 Premier | commercial on paid | music |
| Udio | $10/$30 | — | **downloads disabled since 2025-10-29 → unusable for export now** |

### Editing / post
DaVinci Resolve (free tier — professional edit/color/subtitle; pricing for Studio not retrieved), CapCut, and
**ffmpeg (free, but MISSING here — would need install authorization)**. Self-hosting any of these still needs a
local install (system change) + the generated footage to edit.

## C. Three configurations + cost-per-usable-minute
Based on the industry benchmark **$315–750 per finished minute all-in** and **~25% editorial yield (≈3–8
generations per usable shot)** (sourced 2026-10-24). "Cost/usable minute" ≫ raw subscription price because of
retakes + human editorial time.

| Config | Stack (monthly) | Rights posture | Raw gen floor | Realistic cost/usable minute |
|---|---|---|---|---|
| **A — near-zero prototype** | Sora $20 or Veo $24 + ElevenLabs $6 + DaVinci free | mixed; check Sora/Kling terms | ~$0.07–0.10/s gen | high retake rate (entry-tier ~8 gen/shot) → effective **$200–500/min** incl. human time |
| **B — controlled production** | Runway Pro $35 + Midjourney $30 (consistency) + ElevenLabs $99 + Suno $10 + DaVinci | ownership-clean (Runway/MJ/ElevenLabs) | mid | **$315–600/min** (benchmark mid) |
| **C — ambitious** | Runway/Veo high tier + Midjourney Pro $60 + ElevenLabs Pro + Suno Premier + paid editor + human VFX pass | clean | low per-attempt (premium ~3 gen/shot) | **$500–750+/min**, better consistency |

**Rights rule:** prefer ownership-clear tools (Runway/Pika/Midjourney/ElevenLabs Music v2/Flux-schnell); treat
Kling (right-to-use) and Udio (no export) as blockers for a distributable commercial film. No subscription is to
be purchased/activated without explicit authorization.
