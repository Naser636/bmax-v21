ODG — FINAL MASTER GOVERNING + WORKING REFERENCE
FINAL · FROZEN · CANONICAL · COMPLETE · SEMANTIC-FUSED · OPERATIONALLY CONSOLIDATED · ECONOMICALLY HARDENED — FICHE 2/6
Canonical section range in this file: 95–174. The six files together form one continuous Master. No canonical section is intentionally omitted.

95. HISTORICAL FAILURE 22 --- SELF-VALIDATION
If the same pipeline generates and certifies its own proof, independence is weak.
Correct:
GENERATION ≠ VERIFICATION
Generator is not judge.

96. HISTORICAL FAILURE 23 --- INTERNAL ARTIFACT ≠ EXTERNAL PROOF
An internally generated report is not automatically independent evidence of external reality.

97. HISTORICAL FAILURE 24 --- RUNTIME TOO LARGE
Historical repository complexity grew faster than semantic certification.
The important principle:
COMPACT RUNTIME, NOT COMPACT SPECIFICATION.
Remove redundant permanent mechanisms.
Generate capabilities on demand.
Preserve verified reusable assets.

98. CORRECTIVE ARCHITECTURE
Canonical:
MISSION → INTENT → OBJECTIVES → SEMANTIC COMPILER → WORKGRAPH → STATE / CONTRACT / POLICY / AUTHORITY → RESOLVER → EXECUTOR → EVIDENCE → VERIFICATION → POSTCONDITION → MISSION OUTCOME
All above the nine primitives.

99. REPAIR ORDER
Canonical repair order:
TRUTH LOCK
SEMANTIC EXECUTION FORENSICS
SEMANTIC MISSION COMPILER
OBJECTIVE → OUTCOME PROOF
PROVENANCE / STATE / AUTHORITY
RECOVERY / IDEMPOTENCE
RUNTIME CONSOLIDATION
MASTER EXECUTION
SOVEREIGN EXECUTION / ANTI-CLONING
RUNTIME CERTIFICATION
166 CAPABILITY COVERAGE
LIVING OPERATOR
GENERAL / ECONOMIC OPERATOR
SELF-ENGINEERING / SUCCESSOR
Do not skip gates merely because later architecture sounds attractive.

100. CAMPAIGN 001 --- TRUTH LOCK
Before repair:
AUDIT CURRENT REPOSITORY.
Never assume the old repository still looks like historical documentation.
Baseline:
pwd
git status --short --branch
git rev-parse HEAD
git branch --show-current
git log -5 --oneline
git remote -v
Then identify:
current HEAD;
branch;
clean/dirty worktree;
modified files;
runtime entrypoints;
test entrypoints;
build commands;
mission entrypoints;
provider entrypoints;
current execution path.
Required output:
Repository Identity: - HEAD - BRANCH - WORKTREE - RUNTIME - BUILD - TEST - MISSION ENTRY
State: - PROVEN - OBSERVED - UNKNOWN
If repository state cannot be proven:
BLOCKED --- EVIDENCE INSUFFICIENT

101. FOUR PERSISTENT ODG NOTEBOOKS
Canonical governance scaffold:
odg-governance/
├── MASTER/
│   └── ODG_MASTER_FROZEN.md
├── TRUTH/
│   └── TRUTH_SNAPSHOT.md
├── LEDGER/
│   ├── MISSION_LEDGER.md
│   ├── CHECKPOINT_LEDGER.md
│   └── EVIDENCE_INDEX.md
└── ROADMAP/
    ├── GAP_MAP.md
    └── NEXT_ACTION.md
TRUTH_SNAPSHOT.md
Current verified repository reality: - HEAD; - branch; - worktree; - runtime entrypoint; - mission entrypoint; - build/test; - execution surfaces; - semantic sources; - known failures; - unknowns.
Regenerate/update from reality.
MISSION_LEDGER.md
Every campaign: - mission ID; - objective; - scope; - authority; - allowed write set; - start checkpoint; - result; - evidence; - commit; - end checkpoint; - next action.
CHECKPOINT_LEDGER.md
Continuity: - where we were; - what was proven; - what changed; - what remains unknown; - next gate.
EVIDENCE_INDEX.md
Map: - evidence ID; - mission; - tests; - runtime evidence; - artifacts; - commit; - verification; - scope; - status.

102. GAP MAP AND NEXT ACTION
GAP_MAP.md
Compare:
FROZEN MASTER TARGET vs CURRENT REPOSITORY TRUTH
Classify each gap:
PROVEN;
OBSERVED;
REPRODUCED;
PROVEN ROOT CAUSE;
PLANNED;
PATCHED;
VERIFIED;
BLOCKED;
UNKNOWN.
NEXT_ACTION.md
Must contain exactly the next authorized bounded action.
This prevents uncontrolled expansion.

103. THREE OPERATING MAPS
Execution-Surface Map
Surface Entry Used By Status --------- ------- --------- --------
Examples: - src/runtime; - runtime/core; - local pipeline; - provider route; - migrated route; - fallback route.
Semantic-Source Map
Source Contains Authority Used By Status -------- ---------- -----------
Goal:
MISSION SPEC → COMPILER → CANONICAL MISSION OBJECT
Root-Cause Matrix
Defect Surface Root Cause Minimal Fix Proof -------- ---------
Progress:
UNKNOWN → OBSERVED → REPRODUCED → PROVEN

104. REQUIREMENT REGISTER
Do not immediately convert every Master point into coding tickets.
After forensics, if useful, create:
odg-governance/requirements.yaml
Each requirement may contain: - stable ID; - category; - priority; - dependencies; - allowed paths; - acceptance tests; - status; - proof; - commit.
Statuses:
pending
blocked
planned
in_progress
implemented
verified
accepted
rejected
superseded

105. CAMPAIGN MAP
Current campaigns:
001 Truth Lock
002 Semantic Execution Forensics
003 Semantic Mission Compiler
004 Objective → Outcome Proof
005 Provenance / State / Authority
006 Recovery / Idempotence
007 Runtime Consolidation
008 Master Execution
009 Sovereign Execution / Anti-Cloning
010 Runtime Certification
011 166 Capability Coverage
012 Living Operator
013 General / Economic Operator
014 Self-Engineering / Successor
Authorized starting door:
Campaign 001 Truth Lock
then:
Campaign 002 Semantic Execution Forensics
No repair before reproduction.
No jumping ahead without evidence.

106. ONE-CAMPAIGN LAW
Every campaign has exactly:
ONE OBJECTIVE
ONE AUTHORITY BOUNDARY
ONE CHANGE SURFACE
ONE EVIDENCE OBLIGATION
ONE VERIFICATION CRITERION
ONE STOP CONDITION
Internal loop:
REPRODUCE → MEASURE → LOCALIZE → CLASSIFY → PROVE ROOT CAUSE → MINIMAL CHANGE → BUILD → TEST → REGRESSION → RUNTIME VERIFY → EVIDENCE → CHECKPOINT

107. CAMPAIGN 002 --- SEMANTIC EXECUTION FORENSICS
Select two genuinely different missions.
Do not choose two missions that differ only by ID.
Capture for each:
mission ID;
objective;
preconditions;
required capabilities;
dependencies;
actions;
workgraph;
postconditions;
verification.
Compare:
objectives;
dependencies;
capabilities;
actions;
order;
conditions;
workgraph;
postconditions;
verification.
If semantically different missions produce essentially the same graph without legitimate equivalence:
SEMANTIC EXECUTION DEFECT REPRODUCED
If historical defect does not reproduce on current HEAD:
historical finding = proven historical;
current defect = not reproduced;
patch = not authorized.
Then identify:
FIRST WRONG STATE
and the smallest surface containing the divergence.

108. ROOT-CAUSE STANDARD
Never accept:
"planner is bad."
Required trace:
OBSERVED FAILURE → FILE → FUNCTION → INPUT → TRANSFORMATION → FIRST WRONG STATE → ROOT CAUSE
Root cause must be evidenced.

109. MINIMAL PATCH STANDARD
Patch only after root cause is proven.
Ideal scope:
one function;
one contract;
one test.
Do not rewrite runtime unless evidence proves runtime-level defect.

110. OBJECTIVE → OUTCOME PROOF
For each objective:
EXPECTED POSTCONDITION vs ACTUAL STATE → COMPARISON → VERIFIED / FAILED / PARTIAL / UNKNOWN
Mission success requires:
MISSION VALID AND OBJECTIVES COMPILED AND WORKGRAPH VALID AND AUTHORITY VALID AND POLICY VALID AND PRECONDITIONS VALID AND ACTIONS EXECUTED AND POSTCONDITIONS SATISFIED AND EVIDENCE PRESENT AND VERIFICATION PASSED AND STATE COMMITTED AND RECOVERY SAFE
Only then:
VERIFIED

111. REPOSITORY MUTATION CONTROL
Before execution:
BASELINE
During execution:
ALLOWED WRITE SET
After execution:
ACTUAL DIFF
Required:
EXPECTED DIFF == ACTUAL DIFF
Unexpected mutation:
STOP
Mutation zones:
READ-ONLY
MISSION ARTIFACT
GENERATED ARTIFACT
SOURCE MUTATION

112. CLAUDE CODE --- ROLE
Claude Code is:
ENGINEERING EXECUTOR UNDER GOVERNED ODG AUTHORITY
Claude Code may: - inspect; - search; - read; - trace; - reproduce; - measure; - localize; - diagnose; - propose; - patch; - build; - test; - run; - collect evidence; - commit; - update checkpoints.
Claude Code may NOT: - change the Constitution; - add primitives; - create a new runtime/kernel; - change strategic identity; - redefine 166; - invent architecture; - perform broad cleanup; - delete the repository; - self-certify; - claim objective success without evidence; - alter authority/security roots autonomously.

113. RULE ZERO FOR CLAUDE CODE
Before repair:
AUDIT THE EXACT CURRENT REPOSITORY.
No: - "I know the old code." - "The Master says this exists." - "The previous version had it." - "The architecture should be this."
Current truth is:
CURRENT HEAD + WORKTREE + ACTUAL CODE + ACTUAL RUNTIME + ACTUAL TESTS + ACTUAL EVIDENCE

114. CLAUDE MODES
FORENSIC
READ / SEARCH / TRACE / RUN / MEASURE
No mutation.
DIAGNOSIS
LOCALIZE / ROOT CAUSE / PLAN
No mutation until root cause is proven.
REPAIR
PATCH MINIMUM / BUILD / TEST
Only authorized surface.
CERTIFICATION
RUNTIME / REGRESSION / EVIDENCE / CHECKPOINT
No functional redesign.

115. MASTER CLAUDE PROMPT
Use this as the standard operating prompt:
You are operating on the ODG repository under a FROZEN architecture.

Your role is ENGINEERING EXECUTOR, not architecture designer, governance authority, or strategic decision maker.

MISSION:
[ONE CURRENT CAMPAIGN OBJECTIVE]

RULES:
- no redesign
- no new primitives
- no new runtime/kernel
- no broad cleanup
- no blind deletion/migration
- no strategic drift
- no success claim without machine-verifiable evidence
- historical findings are hypotheses until reproduced on CURRENT HEAD
- forensic-first
- smallest change surface
- if evidence is insufficient, STOP with:
  BLOCKED — EVIDENCE INSUFFICIENT

METHOD:
REPRODUCE
→ MEASURE
→ LOCALIZE
→ CLASSIFY
→ PROVE ROOT CAUSE
→ MINIMAL CHANGE
→ BUILD
→ TEST
→ REGRESSION
→ RUNTIME VERIFY
→ EVIDENCE
→ CHECKPOINT

Before changing anything:
1. identify HEAD
2. identify branch
3. inspect worktree
4. identify runtime entrypoint
5. identify mission entrypoint
6. identify build/test entrypoints
7. identify semantic source
8. identify allowed write set

Do not proceed to the next campaign automatically.

FINAL REPORT:
STATUS:
CAMPAIGN:
HEAD:
OBJECTIVE:
RESULT:
ROOT CAUSE:
CHANGED:
NOT CHANGED:
TEST:
RUNTIME:
EVIDENCE:
UNKNOWN:
CHECKPOINT:
NEXT AUTHORIZED ACTION:

Keep the final report to approximately 20–30 lines.

If evidence is insufficient:
BLOCKED — EVIDENCE INSUFFICIENT

116. CLAUDE OUTPUT DISCIPLINE
Required report:
STATUS:
CAMPAIGN:
HEAD:
OBJECTIVE:
RESULT:
ROOT CAUSE:
CHANGED:
NOT CHANGED:
TEST:
RUNTIME:
EVIDENCE:
UNKNOWN:
CHECKPOINT:
NEXT AUTHORIZED ACTION:
Claude must not automatically continue into the next campaign.

117. COMMAND / SESSION DISCIPLINE
Preferred sequence:
/odg-start
/odg-plan
validate plan
/odg-execute
/odg-verify
correction if required
/odg-verify
/odg-checkpoint
close session
Do not mix: - architecture; - planning; - development; - refactoring; - cleanup
inside one uncontrolled prompt.

118. ONE BOUNDED ACTION AT A TIME
Prefer one bounded command/action at a time.
A single command may collect several safe facts if: - read-only; - bounded; - deterministic; - necessary for the current gate.
Historical command budgets are envelopes, not targets.
Use fewer commands if evidence is sufficient.
Use more only when evidence requires it.
The objective is not command count.
The objective is:
minimum evidence-producing work.

119. CLAUDE GOVERNANCE FILES
After Truth Lock confirms repository conventions, a target structure may be:
project/
├── CLAUDE.md
├── README.md
├── package.json / pyproject.toml / Cargo.toml
├── odg-governance/
│   ├── requirements.yaml
│   ├── state.json
│   ├── architecture-decisions.yaml
│   ├── dependency-graph.yaml
│   ├── master-version.txt
│   ├── allowed-write-sets/
│   ├── checkpoints/
│   ├── snapshots/
│   └── evidence/
├── docs/
│   ├── master/
│   ├── architecture/
│   ├── campaigns/
│   └── operations/
├── scripts/
│   ├── truth-lock
│   ├── verify-state
│   ├── verify-scope
│   ├── generate-report
│   └── checkpoint
├── .claude/
│   ├── settings.json
│   ├── rules/
│   ├── skills/
│   ├── agents/
│   └── hooks/
├── src/
├── tests/
└── .github/
    └── workflows/
Do not create this blindly.
Adapt to actual repository conventions.

120. CLAUDE.md PRINCIPLE
CLAUDE.md should be concise.
It should contain: - frozen ODG identity; - rules; - current workflow; - forbidden actions; - report format.
Do NOT put the full Master in CLAUDE.md.
Use: - .claude/rules/; - skills; - campaign docs; - checkpoints
for specialized knowledge.
The Master remains the supreme reference.

121. SKILLS / SUBAGENTS / HOOKS
Skills: - specialized campaign knowledge; - specialized verification; - specialized engineering methods.
Subagents: - isolated exploration; - security review; - dependency review; - test review; - architecture review.
Prefer read-only exploration.
Hooks can enforce: 1. Truth Lock; 2. allowed write set; 3. post-modification validation; 4. commit blocker; 5. secret detection.
Settings govern: - permissions; - tools; - hooks; - model; - MCP.
Use MCP/connectors sparingly.
High-level operations reduce context overhead.

122. PERMISSIONS
Recommended:
EXPLORATION: read-only
PLAN: planning permissions
IMPLEMENTATION: write limited to campaign paths
VALIDATION: no functional changes
Do not bypass repository permissions merely to make work easier.

123. GIT
Git is required for: - durable history; - rollback; - diff; - attribution; - checkpoints; - recovery.
A checkpoint is not a replacement for Git.

124. CHECKPOINT STANDARD
Example:
CHECKPOINT: CP-0027

MASTER:
ODG FROZEN

CAMPAIGN:
CAMP-04 OBJECTIVE → OUTCOME PROOF

HEAD:
a91f72c

OBJECTIVE:
Make objective postconditions machine-verifiable.

PROVEN:
- objective schema exists
- expected postcondition persisted
- actual state captured
- comparison implemented

CHANGED:
src/runtime/objective-proof.ts
tests/objective-proof.test.ts

NOT PROVEN:
- external outcome verification
- economic attribution

FAILED:
none

UNKNOWN:
external verification boundary

REGRESSION:
PASS

WORKTREE:
CLEAN

STATUS:
VERIFIED FOR PROVEN SCOPE

NEXT AUTHORIZED ACTION:
Investigate external/objective verification boundary.

STOP CONDITION:
Do not implement economic attribution yet.

125. ROLE SPLIT
User
Responsible for: - validating Master; - approving/refusing architectural changes; - approving blocked campaigns; - deciding product objectives; - deciding official release/promotion; - human authority for irreversible/external/economic/security actions.
Assistant / CTO function
Responsible for: - interpreting evidence; - comparing against frozen Master; - identifying gaps; - root-cause review; - designing bounded campaigns; - writing exact Claude prompts; - verifying evidence; - selecting next gate.
Claude Code
Responsible for: - bounded engineering execution; - inspect; - run; - trace; - patch; - test; - verify; - evidence; - commit; - checkpoint.
Practical loop:
YOU → ME → ONE EXACT CLAUDE PROMPT → CLAUDE CODE → 20--30 LINE REPORT → YOU SEND REPORT → ME ANALYZE EVIDENCE → NEXT EXACT PROMPT

126. GOLDEN RULE
Whenever Claude says:
"I fixed it."
Ask:
SHOW ME THE EVIDENCE.
Golden gate:
CLAIM → REPRODUCTION → EVIDENCE → ROOT CAUSE → CHANGE → TEST → RUNTIME VERIFICATION → CHECKPOINT
If any critical part is missing:
BLOCKED

127. COST / SPEED PRINCIPLE
The fastest and cheapest path is not maximum Claude activity.
It is:
prevent random exploration;
forensic search before coding;
root-cause-only repair;
immediate targeted test;
preserve evidence;
never repeat the same investigation;
reuse failure knowledge;
reuse Resolution Assets;
minimize context;
minimize mutation;
minimize permanent mechanisms.
The goal is:
minimum engineering work required to establish sufficient truth.

128. MINIMAL CONTEXT PRINCIPLE
When Claude works on code, load only relevant context:
touched files;
direct dependencies;
linked symbols;
relevant tests;
exact errors;
semantic contract;
current evidence.
Do not dump the entire repository unnecessarily.

129. INTENT-BASED CODE MODIFICATION
Prefer:
structured plan;
JSON change;
AST diff;
limited patch;
explicit file/function scope.
Avoid unrestricted free-form rewrites.

130. OUTPUT GUARDRAILS FOR CODE
Do not accept a patch when:
tests are broken;
scope is broader than authorized;
imports are inconsistent;
unauthorized side effects appear;
semantic contract is violated;
proof is insufficient;
write set is exceeded.

131. ENGINEERING MISSION CONTRACT
Canonical engineering mission:
INSPECT → REPRODUCE → MEASURE → LOCALIZE → PROVE ROOT CAUSE → PLAN MINIMUM PATCH → IMPLEMENT → BUILD → TEST → REGRESSION → RUNTIME VERIFY → EVIDENCE → COMMIT → CHECKPOINT

132. FAILURE CONTRACT
Any critical invariant fails:
STOP → CONTAIN → RECORD → CLASSIFY → RECOVER / REPAIR → VERIFY
Never:
CONTINUE → REPORT SUCCESS

133. HISTORICAL SUCCESS CONTRACT
Success requires:
MISSION LOADED AND MISSION SEMANTICS VALID AND OBJECTIVES COMPILED AND WORKGRAPH VALID AND AUTHORITY VALID AND POLICY VALID AND PRECONDITIONS VALID AND ACTIONS EXECUTED AND POSTCONDITIONS SATISFIED AND EVIDENCE PRESENT AND PROOF SUFFICIENT AND STATE COMMITTED AND RECOVERY STATUS SAFE
→
VERIFIED

134. ODG FIRST-CLASS EXECUTION MODEL
ODG should operate through: - semantic mission compilation; - contextual workgraphs; - policy; - authority; - state; - deterministic execution where possible; - intelligence where uncertainty exists; - evidence; - verification; - recovery; - attribution; - settlement.
No generic "agent loop" should replace this model.

135. CROSS-TENANT / CROSS-DOMAIN REUSE
Reuse must respect: - authorization; - privacy; - contracts; - provenance; - tenant boundaries; - legal scope; - domain validity.
A Resolution Asset may transfer only when transfer evidence supports it.
Never assume: "worked once" means: "works everywhere."

136. SECURITY / SAFETY
Security is integrated into: - identity; - policy; - authority; - evidence; - recovery; - provider governance.
Security controls should not become a second constitution.
No unauthorized: - surveillance; - scraping; - access; - credential use; - external action; - identity impersonation; - data disclosure.

137. ECONOMIC OPERATOR
The General / Economic Operator is the eventual state in which ODG can:
detect demand;
qualify value;
identify authority;
form offers;
compose capabilities;
allocate resources;
execute;
verify;
deliver;
invoice;
collect;
reconcile;
settle;
attribute;
learn;
reinvest;
expand.
This is not a new primitive.
It is the composition of existing governed capabilities.

138. LIVING OPERATOR
The Living Operator means ODG can continuously: - observe; - understand current state; - detect needs; - choose resolutions; - execute; - verify; - recover; - learn; - maintain; - improve.
It does not mean uncontrolled self-modification.

139. SELF-ENGINEERING / SUCCESSOR
Future self-engineering must remain governed.
ODG may: - inspect itself; - identify engineering opportunities; - propose improvements; - generate patches; - test patches; - compare versions; - create successor candidates.
But:
GENERATION ≠ AUTHORITY
SIMULATION ≠ PRODUCTION PROOF
SELF-HEALING ≠ SELF-AUTHORIZATION
A successor must pass: - structural verification; - behavioral verification; - objective verification; - security review; - regression; - runtime verification; - promotion governance.

140. SOVEREIGN EXECUTION / ANTI-CLONING
Sovereignty is not autonomy.
Sovereign execution means ODG retains: - semantic identity; - policy control; - authority boundaries; - evidence; - state integrity; - provider neutrality; - ability to substitute resources; - ability to recover; - ability to operate without being conceptually owned by one provider.
No provider should silently become ODG's strategy.
Anti-cloning principles should protect: - contracts; - policies; - semantic compilation; - provenance; - evidence; - state; - capability graph; - economic attribution.
Do not confuse "many providers" with sovereignty.

141. DISTRIBUTION
Distribution is:
CAPABILITY → TRUST → DISTRIBUTION → DEMAND → RESOLUTION → PROOF → TRUST
Distribution can include: - direct sales; - partners; - marketplaces; - content; - referrals; - integrations; - enterprise channels.
No channel becomes constitutional.

142. CAPITAL COMPOUNDING
Capital should reinforce:
verified capabilities;
repeatable resolutions;
trust;
evidence;
distribution;
commercial learning;
resilience.
Capital should not simply expand: - permanent infrastructure; - redundant agents; - unnecessary providers; - unverified capabilities.

143. ODG'S ULTIMATE COMPOUNDING LOOP
DEMAND → RESOLUTION → PROOF → ATTRIBUTION → CASH → LEARNING → RESOLUTION ASSET → CAPABILITY → TRUST → DISTRIBUTION → LOWER COST / HIGHER QUALITY / FASTER RESOLUTION → MORE DEMAND → MORE RESOLUTION → MORE PROOF → MORE CASH → MORE CAPABILITY
This is the intended compounding engine.

144. WHAT ODG MUST NEVER DO
Do not:
add a 10th primitive casually;
build a new kernel because of a new vertical;
create permanent agents for every capability;
equate AI output with truth;
equate memory with authority;
equate build success with objective success;
equate queue completion with mission completion;
equate evidence existence with verification;
silently change providers;
silently fallback;
silently expand scope;
silently mutate repositories;
self-authorize consequential actions;
claim economic value without attribution;
claim cash without collection evidence;
claim profit without verified costs;
treat simulation as reality;
treat one experiment as universal proof;
perform broad cleanup before forensic proof;
delete old code without dependency/evidence analysis;
rebuild everything;
create a new runtime to avoid fixing semantic execution;
implement 166 permanent modules;
trust old capability counts blindly;
trust historical defects without reproducing them;
optimize for agent count;
optimize for token count;
optimize for infrastructure size;
optimize for maximum internalization.

145. WHAT ODG SHOULD PREFER
Prefer:
semantics over machinery;
evidence over assertion;
deterministic mechanisms for deterministic truth;
intelligence for uncertainty;
local capability before external provider when appropriate;
reuse before build;
composition before duplication;
minimal repair;
explicit fallback;
provider neutrality;
temporary workgraphs;
Resolution Assets;
capability compounding;
adaptive human authority;
economic proof;
time-to-verified-resolution;
trust;
reversible actions;
safe stop;
abstention when proof is insufficient.

146. FINAL REPOSITORY REPAIR PHILOSOPHY
The old repository is:
RAW MATERIAL
not:
THE ARCHITECTURE
Transformation:
OLD REPOSITORY → FORENSIC TRUTH → VERIFIED MECHANISMS → MINIMUM REUSE → SMALL RUNTIME → 9 PRIMITIVES → SEMANTIC COMPILATION → WORKGRAPHS → VERIFIED EXECUTION → CAPABILITY COMPOUNDING → GENERAL OPERATOR → ECONOMIC OPERATOR

147. FINAL ROOT-CAUSE PRINCIPLE
DO NOT REPAIR SYMPTOMS.
Always:
REPRODUCE → MEASURE → LOCALIZE → PROVE ROOT CAUSE → PATCH MINIMUM → VERIFY → MEMORIZE

148. FINAL GOVERNANCE LAWS
PIPELINE HEALTH ≠ MISSION OUTCOME ≠ PROOF ≠ CERTIFICATION
BUILD GREEN ≠ SYSTEM CORRECT
MISSION ARCHIVED ≠ OBJECTIVE PROVEN
CAPABILITY REGISTERED ≠ CAPABILITY VERIFIED
AUTONOMY ≠ AUTHORITY
MEMORY ≠ PERMISSION
MODEL ≠ RUNTIME
PROVIDER ≠ STRATEGY
EVIDENCE ≠ VERIFICATION
VERIFICATION ≠ ATTRIBUTION
ATTRIBUTION ≠ CASH
CASH ≠ PROFIT

149. FINAL ARCHITECTURAL SENTENCE
لا نحتاج Runtime أكبر؛ نحتاج Runtime صغيراً يستطيع تحويل semantic objective إلى Workgraph صحيح، تنفيذ ذلك الـWorkgraph تحت authority/policy/state، ثم إثبات postcondition الحقيقي قبل أن يسمح للنظام بقول SUCCESS.

150. FINAL OPERATING SENTENCE
ODG should continuously transform:
UNCERTAIN REAL-WORLD DEMAND
into:
AUTHORIZED + RESOLVED + EXECUTED + VERIFIED + ATTRIBUTED + SETTLED VALUE
using the smallest safe and economically justified combination of: - deterministic mechanisms; - intelligence; - capabilities; - providers; - humans; - capital; - evidence.

151. FINAL HUMAN--AI OPERATING CONTRACT
The human decides: - strategy; - constitutional changes; - major economic commitments; - authority; - irreversible actions; - promotion; - final governance.
The Assistant/CTO function: - preserves the Master; - analyzes evidence; - structures campaigns; - prevents drift; - writes bounded prompts; - verifies claims.
Claude Code: - executes bounded engineering work; - proves changes; - records evidence; - checkpoints.
The repository: - is the source of implementation truth.
Runtime evidence: - proves actual behavior.
External evidence: - proves external outcomes where required.

152. FINAL WORKING LOOP FOR EVERY FUTURE SESSION
Before every serious ODG engineering session:
Read this Master.
Read the latest checkpoint.
Read TRUTH_SNAPSHOT.
Read GAP_MAP.
Read NEXT_ACTION.
Inspect current HEAD.
Confirm worktree.
Confirm authorized campaign.
Confirm allowed write set.
Reproduce before repairing.
Prove root cause.
Patch minimally.
Build.
Test.
Regression.
Runtime verify.
Capture evidence.
Commit.
Update checkpoint.
Define exactly one next authorized action.
Never skip the truth gate because the next step "looks obvious."

153. FINAL MASTER DECISION TREE
When a new idea arrives:
STEP 1 --- Is it strategic?
If yes: - compare to frozen identity; - do not change automatically.
STEP 2 --- Is it architectural?
If yes: - classify against nine primitives and A01--A54.
STEP 3 --- Is it a capability?
If yes: - add above the kernel.
STEP 4 --- Is it a workgraph?
If yes: - generate temporarily.
STEP 5 --- Is it a provider?
If yes: - govern as resource.
STEP 6 --- Is it a policy?
If yes: - govern permissions and constraints.
STEP 7 --- Is it an experiment?
If yes: - isolate and verify.
STEP 8 --- Is it an economic opportunity?
If yes: - qualify authority, value, cost, risk, proofability, time-to-cash.
STEP 9 --- Is it a new permanent mechanism?
Demand evidence for permanence.
STEP 10 --- Is it a new primitive?
Require extraordinary constitutional proof and explicit human approval.
Default:
NO NEW PRIMITIVE.

154. FINAL MASTER ACCEPTANCE CRITERIA
This Master is considered operationally complete when it remains the single reference for:
identity;
constitution;
nine primitives;
A01--A54;
50K semantic universe;
166 capability reference;
authority;
autonomy;
semantic compilation;
missions;
workgraphs;
proof;
evidence;
recovery;
memory;
learning;
adaptive resolution;
local intelligence;
providers;
Signal Engine;
commercial engine;
economic operating system;
attribution;
settlement;
capital;
capability compounding;
Resolution Assets;
Cinema;
Top Cinema;
ODG first client;
repository forensics;
repair order;
Claude Code method;
notebooks;
campaigns;
checkpoints;
mutation control;
certification;
living operator;
general/economic operator;
self-engineering;
sovereign execution.

155. FINAL NON-NEGOTIABLE CHECKLIST
Before claiming ODG capability:
[ ] Identity consistent
[ ] Frozen strategy preserved
[ ] Correct primitive classification
[ ] Authority proven
[ ] Contract valid where needed
[ ] Policy compatible
[ ] State valid
[ ] Objective explicit
[ ] Workgraph semantically correct
[ ] Preconditions verified
[ ] Actions authorized
[ ] Execution observed
[ ] Postconditions checked
[ ] Evidence captured
[ ] Provenance valid
[ ] Verification independent enough for risk
[ ] Recovery safe
[ ] Economic attribution established where relevant
[ ] Settlement evidence established where relevant
[ ] Repository diff controlled
[ ] Tests passed
[ ] Runtime verified
[ ] Checkpoint written
[ ] Scope explicitly stated
[ ] Unknowns explicitly stated
If any material item is missing:
DO NOT OVERCLAIM.
Use:
UNKNOWN
or
BLOCKED --- EVIDENCE INSUFFICIENT

156. FINAL GOLDEN RULE
When in doubt:
STOP. INSPECT. REPRODUCE. PROVE.
Do not invent.
Do not compress away meaning.
Do not confuse machinery with capability.
Do not confuse capability with authority.
Do not confuse execution with outcome.
Do not confuse evidence with verification.
Do not confuse verification with attribution.
Do not confuse revenue with cash.
Do not confuse cash with profit.
Do not confuse autonomy with sovereignty.
Do not confuse a model with the runtime.
Do not confuse a provider with strategy.
Do not create a new primitive merely because a new problem is interesting.

157. FINAL ODG NORTH STAR
ODG exists to resolve real-world demand into verified outcomes and legitimate economic value, under authority, policy, state, evidence, recovery, and economic governance --- while continuously converting successful resolutions into reusable capabilities that make the next resolution faster, safer, cheaper, more reliable, and more valuable.
ODG should become more capable without becoming permanently more complicated.
The specification may grow.
The semantic universe may grow.
The capability reference may grow.
The resolution assets may grow.
The distribution may grow.
The economic network may grow.
But the permanent kernel remains:
IDENTITY
STATE
CONTRACT
POLICY
RESOLVER
EXECUTOR
EVIDENCE
RECOVERY
ALLOCATOR
And the governing principle remains:
PRESERVE SEMANTICS.
COMPRESS MECHANISMS.
FINAL · FROZEN · CANONICAL

PART XLIII --- AUTONOMOUS MISSION DIRECTION AND PRODUCTION METHOD

158. CTO INTEGRATION DECISION --- AUTONOMOUS MISSION METHOD
The autonomous mission / production proposal is accepted as an operating capability above the existing nine primitives. It does NOT create a tenth primitive, a second kernel, a permanent agent swarm, or a separate Cinema runtime.
Its purpose is to make ODG capable of taking a human objective, compiling it into a governed mission, allocating the best available capabilities, executing the work, continuously verifying it, repairing failures, and returning only a verified result.
The canonical principle is:
MISSION-CENTRIC, NOT AGENT-CENTRIC.
ODG does not need a permanent "Creative Brain", "VFX Brain", "Editorial Brain", "Security Brain", etc. Those are temporary workgraph roles or capability compositions when useful.

159. AUTONOMOUS MISSION LOOP
Canonical autonomous operating loop:
UNDERSTAND → CONSTITUTION → COMPILE → PLAN → ALLOCATE
→ GENERATE / EXECUTE → OBSERVE → CRITIQUE → VERIFY
→ REPAIR → REGRESSION → ACCEPT → COMMIT → CONTINUE
For long-running missions, this loop is durable and checkpointed. It may pause, wait, replan, substitute a provider, escalate to a human, recover from failure, or safely stop.
Autonomy means reducing unnecessary human operational work. It does NOT mean removing human authority.

160. MISSION DIRECTOR
Mission Director is a capability that transforms human intent into a governed Mission Object.
Inputs:
human intent;
objective;
domain;
constraints;
contract;
authority;
quality requirements;
budget;
deadline;
risk tolerance;
available capabilities;
evidence requirements.
Outputs:
Mission Constitution;
objectives;
preconditions;
required capabilities;
resource bounds;
workgraph;
proof design;
escalation policy;
stop conditions;
recovery conditions;
acceptance conditions.
Mission Director does not become a new permanent primitive. It composes IDENTITY, STATE, CONTRACT, POLICY, RESOLVER, ALLOCATOR, EXECUTOR, EVIDENCE and RECOVERY.

161. MISSION CONSTITUTION
Each consequential mission may carry a local Mission Constitution containing:
Invariants --- things that must not change.
Variables --- things ODG may optimize.
Limits --- maximum budget, time, risk, resource use, provider exposure, human attention, or scope.
Degradation rules --- what may be reduced if constraints bind.
Stop conditions --- what forces safe stop or escalation.
Acceptance conditions --- what must be true before completion.
Example for Cinema:
INVARIANTS:
story intent, character identity, rights, must-have scenes,
minimum quality, contractual deliverables

VARIABLES:
provider, model, shot order, cache/reuse, batching,
render strategy, retry strategy, compute placement

LIMITS:
budget, duration, deadline, quality floor, rights scope

DEGRADATION:
reduce non-critical iteration, use cheaper validated method,
reuse verified assets, postpone optional enhancement

STOP:
rights uncertainty, critical continuity failure,
quality below contract, budget breach, unresolved authority
Optimization may change variables but must not silently violate invariants.

162. FIVE AUTONOMOUS CAPABILITY FAMILIES
The autonomous method is organized into five capability families:
A --- AUTONOMOUS MISSION DIRECTION Mission Director, Mission Constitution, durable mission state, objective compilation, planning, escalation.
B --- DOMAIN / CREATIVE RESOLUTION Canonical Domain State, domain reasoning, intent graphs, domain-specific constraints, resolution recipes.
C --- PRODUCTION / EXECUTION FACTORY Asset Factory, Shot Factory, execution workers, provider composition, deterministic tools, external capabilities.
D --- QUALITY / VERIFICATION / REPAIR Critics, validators, adversarial checks, regression, continuity, objective verification, local repair, acceptance.
E --- ECONOMIC / PROVIDER OPTIMIZATION Provider Intelligence, cost allocation, context reuse, batching, caching, champion/challenger, resource budgets, time-to-cash.
These are capability families, NOT permanent runtimes.

163. PRODUCTION TRUTH LAYER
Every consequential production mission should maintain a structured Production Truth Layer containing, where applicable:
mission_id;
mission_version;
objective_id;
current state;
domain state;
artifact identity;
artifact version;
source;
provider;
model;
parameters;
input assets;
output assets;
attempts;
failures;
repairs;
cost;
quality observations;
verification status;
rights/provenance;
approvals;
timestamps;
dependencies;
acceptance state.
The Production Truth Layer is an application of STATE + EVIDENCE + IDENTITY, not a new primitive.

164. QUALITY IS A CONSTRAINT, NOT A PROMPT
Quality must be represented as a vector of independently governed dimensions where relevant.
For Cinema, dimensions may include:
narrative coherence;
character consistency;
visual identity;
temporal continuity;
spatial continuity;
cinematography;
audio;
pacing;
aesthetic intent;
novelty;
cultural fit;
rights/safety;
technical mastering;
audience evidence.
Critical dimensions must not be hidden by one aggregate score.
A high average cannot compensate for a critical hard failure.

165. EVENT-DRIVEN HUMAN ESCALATION
Human intervention should be requested because an event requires authority or judgment, not because ODG reached an arbitrary workflow step.
Escalate when:
legal/rights authority is unclear;
contractual interpretation is ambiguous;
irreversible action is imminent;
material capital exposure exceeds policy;
creative ambiguity materially changes intent;
critical quality remains unresolved;
evidence contradicts itself;
repeated automated repair fails;
security or identity is uncertain;
policy conflict exists;
external authority is missing;
mission scope would materially change.
Do not escalate merely because a model is uncertain if deterministic evidence can resolve the issue safely.
Human escalation is a governed decision, not a second runtime.

166. AUTONOMOUS REPAIR LOOP
When an output fails verification:
CLASSIFY → LOCALIZE → DIAGNOSE → SELECT MINIMUM REPAIR
→ APPLY → TEST → VERIFY → REGRESSION → ACCEPT / ESCALATE
Repair must preserve causal traceability.
For Cinema, a continuity failure should preferably repair the smallest relevant asset/shot/transition rather than regenerate the entire film.
For software, a semantic defect should preferably repair the smallest code surface containing the root cause.
For economic operations, a reconciliation discrepancy should isolate the smallest transaction/state boundary that explains it.

167. FULL-MISSION REGRESSION
A change to one artifact may affect downstream dependencies.
Therefore, after material change:
CHANGED ARTIFACT
→ DEPENDENCY DISCOVERY
→ AFFECTED OBJECTIVES
→ TARGETED REGRESSION
→ OBJECTIVE VERIFICATION
→ ACCEPT / ROLLBACK
Cinema examples: changing wardrobe may affect later shots; changing dialogue may affect lip sync, subtitles, audio timing and edit duration; changing a character may affect downstream continuity.
Software examples: changing an API may affect callers, schemas, tests and deployment.
Regression scope is determined by dependency evidence, not by habit.

168. ASSET FACTORY
The Asset Factory is a reusable capability for governed production assets.
Each governed asset may carry:
asset_id;
type;
identity;
version;
source;
generation method;
provider/model;
transformations;
provenance;
rights;
quality evidence;
dependencies;
compatible contexts;
known failures;
recovery method;
reuse scope;
cost;
validity;
approval state.
An asset becomes reusable because it is verified and properly scoped, not merely because it exists.
The Asset Factory should reduce repeated generation and reduce total cost of verified resolution.

169. SHOT FACTORY
The Shot Factory turns a Shot Contract into candidate executions.
A Shot Contract should specify, where relevant:
narrative purpose;
duration;
camera;
lens;
framing;
position;
movement;
focus;
blocking;
action;
lighting;
continuity in/out;
audio intent;
quality target;
rights constraints;
generation strategy;
fallback strategy;
verification requirements;
budget.
The Shot Factory may use deterministic composition, 2D/latent methods, 3D blocking, image-to-motion, video generation, compositing, human intervention, or hybrid methods.
The resolver chooses the cheapest safe composition that satisfies the contract.

170. RESOLUTION RECIPES
A successful repeated mission pattern may become a Resolution Recipe before becoming a more permanent capability.
A recipe should capture:
situation;
prerequisites;
semantic objective;
recommended resolution;
required capabilities;
provider options;
cost profile;
expected quality;
evidence pattern;
failure modes;
recovery;
limitations;
transfer scope.
Recipes are reusable knowledge. They are not automatically new runtime components.

171. INDUSTRY PACKS
The universal kernel remains unchanged while domain capability packs provide:
domain state;
domain contracts;
policies;
capabilities;
verification methods;
workgraph templates;
asset models;
Resolution Recipes;
domain-specific evidence.
Initial pack candidates:
CINEMA
SOFTWARE
RESEARCH
ENGINEERING
DESIGN
MARKETING
OPERATIONS
EDUCATION
A new industry pack is a capability composition above the kernel, not a new kernel.

172. LONG-RUNNING DURABLE MISSIONS
ODG should support missions that survive:
process restarts;
provider outages;
temporary network failures;
machine replacement;
delayed human approval.
The mission state, evidence, and recovery context must remain durable enough to resume without silently losing authority or proof.

173. MISSION SUPERVISOR
Long-running missions require a supervisor that can:
observe mission state;
detect stalls;
distinguish waiting from failure;
request recovery;
preserve evidence;
respect authority boundaries;
avoid unauthorized escalation;
resume only from verified durable state.
The supervisor is not the authority. It operates under the mission contract, policy, and governance.

174. GOVERNED AUTONOMY METRICS
Autonomy must be measured through evidence, not impression.
Relevant metrics include:
missions completed;
missions blocked;
missions recovered;
verification success;
recovery success;
provider fallback;
cost per verified outcome;
time to verified outcome;
human intervention rate;
unauthorized-action count;
rollback count;
evidence completeness;
economic acceptance where required.
Autonomy is acceptable only where safety, authority, evidence, and economic/contractual acceptance are satisfied where required.
