# V12.4 — VPS Security Closure: edg-core Exposure Remediated (CTO V7.1 §2/§5/§7, 2026-11-09)

**Owner explicitly authorized auditing + securing `edg-core` (a preserved, non-ODG service).** A real internet-facing
exposure was found and **closed with proof**, backup + rollback, no data loss, no regression. Truth Lock `main @ 72b06e8`;
preservation intact (5 stashes / 6 untracked); no sudo, no secret, no spend, no deletion.

## §2 — edg-core:8080 (P0) — investigation

- **Identity:** Docker-Compose service `edg-core` (project `edg`, `/opt/edg/docker-compose.yml`), image **nginx:alpine**,
  `restart: unless-stopped`, serving a static dashboard (`EDG Dashboard`, 737-byte index.html) from the host bind mount
  **`/opt/edg/dashboard` (read-only)**. Managed by the `ubuntu` user (in the `docker` group — no sudo needed).
- **Exposure (BEFORE):** published `8080:80` with an empty HostIp ⇒ bound **`0.0.0.0` + `[::]`** → **reachable on the
  public IP `54.37.40.154:8080` ⇒ HTTP 200** (genuinely internet-exposed).
- **Auth:** none (static nginx, anonymous) — so the public bind served the dashboard to anyone.

## §2 — Remediation (performed, with backup + rollback)

1. **Backup:** `/opt/edg/docker-compose.yml.bak-2026-11-09`.
2. **Change:** `ports: "8080:80"` → **`"127.0.0.1:8080:80"`** (loopback-only bind). Persistent (compose file updated;
   `restart: unless-stopped` + the new config survive reboot/recreate).
3. **Recreate:** `docker compose up -d` (the `./dashboard` host bind mount is **untouched** — no data loss).

## §2/§7 — Validation (proven, authorized-access vs unauthorized-access tests)

| Check | Result |
|---|---|
| New bind (`ss`) | **`127.0.0.1:8080`** (no more `0.0.0.0` / `[::]`) |
| **Authorized private access** `http://127.0.0.1:8080/` | **HTTP 200** ✓ (private channel works) |
| **Unauthorized public access** `http://54.37.40.154:8080/` | **HTTP 000 — connection refused** ✓ (public exposure CLOSED) |
| Dashboard data (`/opt/edg/dashboard`) | **intact** ("EDG Dashboard" served) — no data deleted |
| ODG services regression | **none** — preprod active, radar timer active, ollama 200 |

**Rollback:** `cp /opt/edg/docker-compose.yml.bak-2026-11-09 /opt/edg/docker-compose.yml && cd /opt/edg && docker compose up -d`.

## §5 — Global VPS port/service audit (AFTER)

| Bind | Service | Exposure | Auth | Note |
|---|---|---|---|---|
| `0.0.0.0:22` + `[::]:22` | **SSH (system)** | PUBLIC | key/system | legitimate — VPS access; **not ODG**, not modified |
| `127.0.0.1:8080` | edg-core nginx | **private** | none (static) | **remediated** this session (was public) |
| `127.0.0.1:11434` | Ollama (Local Intelligence Engine) | private | none | ODG, loopback |
| `127.0.0.1:3000` | ODG dashboard (next) | private | dashboard-auth | ODG, loopback, fail-closed |
| `127.0.0.1:44701` | local | private | — | loopback |
| `127.0.0.53/54:53` | systemd-resolved DNS | private | system | loopback resolver |

**Result: the ONLY remaining public bind is SSH:22** (a legitimate, needed system service — not ODG, not touched). **No
unnecessary or uncontrolled network access remains.** The one public exposure (edg-core) is closed and verified.

## Residual / owner-reserved

- **SSH:22 public** is a legitimate VPS-access requirement (system service); hardening (key-only, fail2ban, IP allowlist)
  is an owner/infra decision — documented, not changed (no sudo, out of ODG scope).
- `edg-core` has **no authentication** (static nginx) — now moot for external reach (loopback-only); if it must ever be
  exposed, the owner should add auth + TLS (dashboard-exposure dossier covers the ODG dashboard analogue).
