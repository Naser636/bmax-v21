# Evidence — AUTONOMOUS_CONTRACT_EVOLUTION

Capability: Contract On Demand is usable **end-to-end** by `delegate`, `autonomy` and future missions.
An unknown mission no longer blocks autonomy, Verify validates the generated contracts, and Converge
treats them as normal Runtime proofs. Governed like every other capability.

## Deliverables

| Artifact | Role |
| --- | --- |
| `src/runtime/autonomy-runtime-adapter.ts` | New `materialiseOnDemand(mission)`. `generateContract` and `readCorrectiveQueue` now synthesize a missing contract (when authorized) instead of throwing/deferring — an unknown mission no longer blocks the loop. |
| `runtime/bin/odg-verify.js` | New `verifyGeneratedContracts()`: every `generatedBy:"mission-contract-factory"` contract is re-validated with the Mission Loader guard. `runtime-verify.json` gains `generatedContracts` + `generatedContractsValid`. Purely additive — build/typescript/gitClean gates unchanged. |
| `runtime/bin/odg-generate-contracts.js` | Converge Step 1: audits factory-generated contracts and exits non-zero if any is invalid, so `odg converge` surfaces a PARTIAL contract step instead of building on a broken contract. |
| `runtime/policies/runtime-policies.json` | `contractOnDemand.capabilities` registers both capabilities (governance). |
| `runtime/governance/ROADMAP.json` | Both capabilities added — governed and ordered like the others. |

## Reuse (no new framework, no duplication)

- The CJS Mission Contract Factory is the **sole author** of contracts; the adapter/loader/verify/
  converge all call it — no schema or logic is re-implemented.
- `delegate` and `autonomy` inherit Contract On Demand for free: they route through the same Mission
  Loader / adapter that now materialise on demand.
- Provider Routing untouched; Kernel, Governance, Ledger, Evidence, Runtime & Mission Lifecycle
  preserved. The only escalation change is behind the existing `isOnDemandEnabled` policy gate.

## Proof (no regression)

```
npx tsc --noEmit                                  → clean
node_modules/.bin/tsx src/runtime/converge-cli.test.ts        → ALL PASS
node_modules/.bin/tsx src/tests/corrective-queue-intake.test.ts → Corrective-queue intake OK
node_modules/.bin/tsx src/tests/runtime-autonomy.test.ts      → Runtime Autonomy OK
node_modules/.bin/tsx src/tests/claude-provider-adapter.test.ts → Claude Provider Adapter OK
node runtime/core/mission-contract-factory.test.js            → 39 assertions passed
```

The generated-contract audit logic returns `{total, valid, invalid}` with `generatedContractsValid`
true whenever no factory-generated contract is structurally broken (verified standalone).
