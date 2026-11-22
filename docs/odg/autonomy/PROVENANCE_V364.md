# Provenance files recovered in V364 (2026-11-22)

Copied **byte-for-byte** from `/home/ubuntu/odg-sandbox-work` (not runtime code; they hard-code `/work` sandbox paths).

| File | Source | sha256 | Why |
|---|---|---|---|
| `docs/odg/C6_PROBE.sh` | `odg-sandbox-work/probe.sh` | `e94280362e94ec805e570b741fe9d9d7b7f3d40bcfb0889fafa24591fcf4a4c2` | equals the `probeSha256` pinned in `docs/odg/c6-certification-evidence.json`; the probe source was untracked, so the pin was unverifiable |
| `V317_MISSION_DRIVER.js` | `mission/mission-driver.js` | see `sha256sum` | harness that produced `V317_E2E_AUTONOMY_EVIDENCE.json` |
| `V318_DRIVER.js` | `mission-v318/driver.js` | see `sha256sum` | harness for `V318_NOVEL_SYNTHESIS_EVIDENCE.json` |
| `V319_DRIVER.js` | `mission-v319/driver.js` | see `sha256sum` | harness for `V319_HARDER_AUTONOMY_EVIDENCE.json` |
| `V320_DRIVER.js` | `mission-v320/driver.js` | see `sha256sum` | harness for `V320_MULTIMODULE_ROUTED_EVIDENCE.json` |

Limits (honest): the evidence JSONs are byte-identical to the committed ones, and each driver predates its evidence by
mtime, but no driver hash was ever pinned — that these are the exact producing versions is LIKELY, not PROVEN.
Follows the `V319B_DRIVER.js` precedent.
