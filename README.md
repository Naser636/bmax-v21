# BMax ODG Runtime

ODG is a self-governing engineering **Runtime**: a deterministic pipeline that plans, executes,
validates and certifies missions, with an autonomy loop that advances a roadmap and a provider
boundary that can delegate engineering work to Claude Code.

## Quick start

```bash
npm install
./runtime/bin/odg            # health dashboard (default)
```

## Runtime CLI (`runtime/bin/odg`)

| Command | What it does |
|---|---|
| `odg` / `odg health` | Refresh coherent state, then render the unified health dashboard |
| `odg state` | Rebuild the coherent Runtime model into `runtime/generated/*.json` |
| `odg status` | Foundation dashboard (runtime / capabilities / next mission) |
| `odg mission <NAME>` | Run a mission. Engineering missions route through the provider; local/deterministic missions fall back to the Mission-Standard engine (`mse`) |
| `odg autonomy` | Run the autonomy loop: pick the first roadmap mission not yet proven, execute, advance |
| `odg verify` | Canonical verifier — writes `runtime/generated/runtime-verify.json` (build / typescript / gitClean / documentationProof) |
| `odg freeze` | Freeze the current runtime state |

## Architecture (live execution path)

```
runtime/bin/odg (bash launcher)
  ├─ odg-state.js  → runtime/core/runtime-model.js   (single writer of the coherent model)
  ├─ odg-health.js / odg-status.js                   (read-only renderers of generated JSON)
  ├─ odg-verify.js                                   (canonical build/tsc/git verifier)
  ├─ mission → src/runtime/mission-cli.ts            (provider route via autonomy-runtime-adapter)
  │            └─ fallback: runtime/mission-standard/bin/mse (deterministic engine)
  └─ autonomy → src/runtime/autonomy-cli.ts          (RuntimeAutonomy loop)
```

- **`runtime/core/*.js`** — the CommonJS runtime the CLIs execute (model, pipeline, validation,
  ledger, patch, loaders, build-recovery).
- **`src/runtime/*.ts`** — the TypeScript engines reached via `tsx` (autonomy adapter, autonomous
  execution, persistent-autonomy controller, root-cause engine, snapshot engine, provider failover).
- **`src/providers/*.ts`** — the Claude Code provider boundary (see
  `docs/CLAUDE_PROVIDER_CONTRACT_v1.md`).
- **`runtime/mission-standard/`** — the deterministic Mission-Standard engine and its per-mission
  evidence store (certificates / passports / reports — regenerated per run, kept on disk, untracked).

## Working rules

`DETERMINISM_FIRST` · `REUSE_BEFORE_CREATE` · `EVIDENCE_REQUIRED` ·
`ONE_RESPONSIBILITY_PER_COMPONENT` · `ARTIFACTS_ARE_IMMUTABLE` ·
`ROLLBACK_MUST_ALWAYS_BE_POSSIBLE` · `PIPELINE_IS_REPRODUCIBLE`

## Verification

```bash
npx tsc --noEmit     # types
npm run build        # Next.js production build
npm test             # full test suite (src/tests/*.test.ts)
./runtime/bin/odg verify
```
