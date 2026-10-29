# Dockerfile/lint (hadolint) — checksum-verified install runbook (owner-gated)

**Status: PREPARED, NOT EXECUTED.** The `Dockerfile` adapter is wired in `runtime/core/code-execution.ts` and is
honestly `UNSUPPORTED` until `hadolint` is on PATH (the probe fails ⇒ never a decoy). hadolint is **not** in the
enabled apt repos, so it requires an **external binary** from the official GitHub release — a third-party source, hence
owner-authorized. This runbook makes that step reproducible and integrity-checked; it is **not run autonomously**.

## Why external (the exact blocker)

`apt-cache policy hadolint` → no candidate in the enabled universe repos. The maintained distribution is the GitHub
release `hadolint/hadolint` (asset `hadolint-linux-x86_64`). Since v2.15 the release publishes a single
`checksums.sha256` (sha256sum binary-mode) covering `hadolint-linux-x86_64` and `hadolint-linux-arm64`.

## Owner-authorized install (integrity-verified; pick a pinned version)

```
VER="v2.15.1"            # pin an explicit release; do NOT use a moving 'latest'
BASE="https://github.com/hadolint/hadolint/releases/download/${VER}"
cd "$(mktemp -d)"
curl -fsSLO "${BASE}/hadolint-linux-x86_64"
curl -fsSLO "${BASE}/checksums.sha256"
# verify integrity BEFORE trusting the binary (fail-closed: do not install on mismatch):
grep -i 'hadolint-linux-x86_64' checksums.sha256 | sha256sum -c -        # must print "OK"
sudo install -m 0755 hadolint-linux-x86_64 /usr/local/bin/hadolint
hadolint --version                                                       # confirm on PATH
```

Do **not** proceed if `sha256sum -c` does not print `OK`. Record the pinned version + verified digest in the closure
register evidence when activating.

## After install (ODG, no further human step)

1. `npx tsx -e 'console.log(require("./runtime/core/code-execution.js").detectToolchain().Dockerfile)'` → expect `true`.
2. Flip `TARGET_TAXONOMY` `Dockerfile/lint` to `supported: true` in `runtime/core/broad-it-eval.ts` and add a
   `Dockerfile/lint` corpus slice (clean + lint-dirty cases) — the adapter already runs; this takes coverage to 12/12.
   broad-IT stays **NO_DATA** regardless (mode-coverage + independent-labelling gates unchanged).
3. Add a real-subprocess test case for hadolint (guarded on availability, like Shell/SQL/Go/Rust/Java/C#).

## Resume test (verifiable precondition after the human action)

`runSyntaxCheck({language:"Dockerfile", content:"FROM alpine\nRUN echo hi\n"})` returns `PASS` (clean) and a
lint-dirty Dockerfile (e.g. `FROM alpine:latest` + unpinned `apk add`) returns `FAIL`.

## Minimal human action required

Authorize + run the integrity-verified install above (downloads a third-party binary, uses sudo to place it on PATH).
Nothing else is blocked on a human: the adapter, taxonomy flip plan, and tests are prepared.

## Security notes

- Pinned version + sha256 verification before trust (no blind `curl | sh`).
- hadolint reads one local Dockerfile, no network; runs under the existing bounded runner (timeout + output cap + minimal env).
- No global apt source added; a single verified binary in `/usr/local/bin`.
