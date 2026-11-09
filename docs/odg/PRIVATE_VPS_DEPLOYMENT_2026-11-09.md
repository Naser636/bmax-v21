# V12.4 — Private VPS Deployment: Verified Operational (CTO Directive V5, 2026-11-09)

**The host IS the private VPS.** This documents the real, verified operational state after the §2 audit + §3 canonical
verify. **ODG is deployed and operational**; its own footprint is strictly private (loopback-only). Truth Lock
`main @ d7fdad4`; preservation intact (5 stashes / 6 untracked); no service restarted, no public port opened by ODG, no
sudo, no secret, no spend. **Nothing declared operational without independent proof (§6).**

## §2 Audit — real state (not assumed)

- **Repo/runtime:** HEAD = origin/main = `d7fdad4`; node v22.22.1; `runtime/dist/bin` = 25 compiled bins; working tree clean (branch excellence/…).
- **Resources:** 8 CPU, 22 GiB RAM (21 avail), 161 GB free. CPU-only (no GPU).
- **Local Intelligence Engine:** Ollama live on 127.0.0.1:11434 with **3 models** — `qwen2.5-coder:7b`, **`qwen2.5-coder:3b`**, **`qwen2.5:0.5b`** (smaller/faster models now present — the "faster model" option the dossier flagged is partially satisfied; model selection per task is possible).
- **Services already deployed (system-level, from prior authorization; read-only observed):** `odg-preprod.service` **active/running** (private loopback dashboard, ExecMainStatus=0), `odg-healthcheck` (bounded poll), `odg-monitor`/`odg-recover` (loaded), `odg-mission-runner` **failed** (Truth-Lock: runs only on `main` — correct, per §4 not force-activated).
- **Radar (my prior activation):** `odg-radar-weekly.timer` (USER) **active/waiting**, next Mon 2026-11-16.

## §3 Canonical deploy mechanism (reused — the simplest coherent one, §2)

`deploy/odg-stage-and-verify.sh` (USER-SPACE, **no root, no service restart**, idempotent) is the canonical one-command
preflight+build+verify. Run result (this session):
```
runtime build: ok
verify gate:  build: true · typescript: true · generatedContractsValid: true
runtime health: Runtime READY · Foundation READY · Pipeline READY · Brain READY
STAGED + VERIFIED. No service was restarted.  (exit 0)
```
Rollback: `deploy/odg-rollback.sh <ref>` (git-based, no force, no destructive reset, never discards uncommitted/untracked).

## §4/§7 Component deployment status (installed / active / inactive / blocked)

| Component | State | Private? | Proof |
|---|---|---|---|
| ODG core + 9 primitives | **deployed+verified** | n/a (library) | gate 399/399; Brain/Foundation READY |
| Truth Lock + governance | **enforced** | n/a | mission-runner **refuses** on non-main (Truth-Lock active) |
| Canonical state/registers | **deployed** | local | register 378; campaign-controller 36/36 |
| Orchestration / scheduler | **deployed** | local | mission-lifecycle/campaign-controller gate-tested |
| L0–L4 engineering + repair | **deployed+proven** | local | L0-L4 evidence docs; l4-campaign gate-tested |
| Local Intelligence Engine | **operational** | loopback 11434 | Ollama 3 models; L2/L3/L4 live runs |
| Capability registry + 15 métiers | **deployed** | local | capability-map 352; parity 15/15 |
| Radar / Frontier Lab / learning | **deployed** | n/a | frontier-pipeline; radar scenario-benchmark |
| **Radar weekly timer** | **ACTIVE** | user timer, private | `systemctl --user` active; demonstrated run success |
| Observability (preprod dashboard) | **active/running** | **loopback (private)** | odg-preprod active, ExecMainStatus=0, :3000 loopback |
| `campaign-runner-systemd` | **BLOCKED (Truth-Lock non-main)** | — | failed on this branch — **not force-activated (§4)** |

## §5/§7 No-public-exposure verification

- **ODG's own services bind loopback-only:** next `127.0.0.1:3000`, ollama `127.0.0.1:11434`. **No ODG service binds 0.0.0.0** — no public port opened by ODG.
- **Finding (owner-reserved):** a **preserved Docker container** `edg-core` ("EDG Dashboard") is published by `docker-proxy` on **`0.0.0.0:8080`** (Docker's default). It is **not an ODG-native service**, is root/docker-managed, and is a **PRESERVED component** — ODG does **not** modify it. The host has `/etc/nftables.conf` (a firewall) which may restrict external reach (not readable here). **Owner action:** review whether `edg-core:8080` should bind loopback only / be firewalled (an infra/Docker decision, not an ODG deployment action). ODG took no action on it (preservation).

## §6/§8 Honest status

**ODG is a real, verified-operational private deployment** — build/typescript/contracts green, runtime health all READY,
private dashboard responding, local model operational (3 sizes), radar timer active, Truth Lock enforced (proven by the
mission-runner's correct refusal). ODG's own footprint is **strictly private** (loopback). The only exposure note is the
**preserved, non-ODG Docker `edg-core:8080`** — flagged for the owner, untouched. `campaign-runner-systemd` stays BLOCKED
by Truth-Lock on this branch (not force-activated). No public port opened, no sudo, no secret, no spend, no deletion.

**Remaining / owner-reserved:** (1) edg-core:8080 bind/firewall review; (2) `campaign-runner-systemd` canonical
resolution on `main`; (3) the 15 owner-gated items in `OWNER_DECISION_DOSSIER_V2`. **Next automatic action:** the private
weekly Radar continues (next Mon 2026-11-16) feeding governed proposals; ODG verifies health via the running
preprod/healthcheck services. The npm auto-update warning is a Claude Code CLI issue, unrelated — permissions untouched (§5).
