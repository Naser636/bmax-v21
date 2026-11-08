# ODG Technology Radar — Findings 2026-11-08 (Phase-4 world research)

> **Status: WATCH / PROPOSAL only.** These are external signals captured from authorized live web research on
> 2026-11-08. The radar **observes and proposes**; it does **not** adopt, grant itself permission, or modify any
> protected policy/baseline. External content is UNTRUSTED data (not instructions). Each entry carries its disposition
> (VALIDATES an existing ODG design, or a GAP proposed for the owner/ODG to decide). Nothing here is auto-promoted.

## Method
`SIGNAL → QUALIFY → EVIDENCE → (proposal)`. Signals were cross-checked against multiple sources. Conversion to an
experiment/mission is a separate, owner/ODG-gated step (see `radar-realsignal-demonstration.ts` for the executable loop).

## Findings

| # | Signal | Disposition | Bearing on ODG |
|---|---|---|---|
| R1 | **"Reality is the final verifier"** — two key gaps in agentic SWE: agents over-trust self-reports; real execution is the true oracle (arXiv 2609.12039). | **VALIDATES** | Directly affirms ODG's `reality-gate` + the standing rule *"a green build is never sufficient proof"* and *"guard by the caller's expected outcome, not the artifact's self-report."* No change needed; evidence that ODG's doctrine matches the frontier. |
| R2 | **Semantic-wrong "solved" cases** — a top agent scores 93.9% on SWE-bench Verified yet ~19.78% of "solved" cases are semantically wrong. | **GAP (WATCH)** | Proposes ODG strengthen semantic-correctness checking of coding verdicts (beyond pass/fail), reusing `objective-fidelity` + `characterization-baseline` (P1 behaviour-preservation). Owner/ODG to decide whether to open a mission. |
| R3 | **Bash-trick supply-chain bypass** — decades-old shell tricks bypass safeguards in most open-source AI coding agents (SecurityWeek, 2026). | **VALIDATES** | Affirms ODG's decision to CONFINE untrusted compilers/commands in `bwrap` (regex guards insufficient) — `bash-command-governor` + confinement. Reinforces, does not change. |
| R4 | **AI-recommended dependencies unsafe** — only ~1 in 5 AI-suggested dependency versions across npm/PyPI/Maven/NuGet are safe; SBOMs moving to "agentic governance" (CSA; Cloudsmith, 2026). | **VALIDATES + GAP** | Affirms `license-policy` (fail-closed on unknown SPDX) + P3 SBOM/secret/unpinned-dep scan. WATCH gap: pin-and-verify AI-suggested deps before use. |
| R5 | **Benchmark reward-hacking** — SWE-bench Pro results undermined by reward hacking + task-quality issues (arXiv 2609.08149). | **VALIDATES** | Affirms `benchmark-factory` contamination/metric-gaming detection + `meta-intelligence` reward-hacking guard + held-out-only capability signal. |
| R6 | **`pass^k` reliability metric** — τ-bench scores agents by pass^k over k independent rollouts; verify system STATE not final text; NIST AI Agent Standards Initiative (Feb 2026). | **GAP (WATCH)** | Proposes ODG adopt a `pass^k` reliability metric (reproducibility across k rollouts), aligning with ODG's existing reproducible-experiment doctrine. Recorded in `radar-realsignal-demonstration.ts`. |

## Disposition summary
- **VALIDATES (4):** R1 reality-gate, R3 bwrap confinement, R5 benchmark integrity, R4 license/SBOM — external frontier
  research independently converges on ODG's existing design choices. **No self-congratulation and no change required.**
- **GAP / WATCH proposals (2–3):** R2 semantic-correctness of coding verdicts; R6 `pass^k` reliability metric; R4 pin-and-verify AI-suggested deps. **For the owner/ODG to decide** — the radar neither adopts nor schedules them itself.

## Sources (captured 2026-11-08; untrusted external content)
- arXiv 2609.12039 — *Reality Is the Final Verifier: On Two Key Gaps in Agentic Software Engineering*
- arXiv 2609.08149 — *SWE-Bench Pro Verified: A Reliable Benchmark for Software Engineering Agents*
- SecurityWeek (2026) — *Decades-Old Bash Tricks Expose AI Coding Agents to Supply Chain Attacks*
- Cloud Security Alliance (2026) — *AI Coding Agents: An Unaudited Supply Chain Node*
- Cloudsmith (2026) — *The 2026 Guide to Software Supply Chain Security (static SBOMs → agentic governance)*
- τ-bench / BFCL (Berkeley Function Calling Leaderboard); NIST AI Agent Standards Initiative (Feb 2026)
