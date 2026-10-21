#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
const capabilityExecutors: any = require("./capability-executors");
const { admitPatchEdit }: any = require("./patch-action-contract");
const idempotency: any = require("./idempotency-guard");
const artifactState: any = require("./artifact-state");

const GENERATED_DIR = "runtime/generated";

const plan: any = JSON.parse(
  fs.readFileSync(path.join(GENERATED_DIR, "patch-plan.json"), "utf8")
);

// Paths this mission is authorized to modify. A real (file-modifying) patch may only touch a
// target inside one of these prefixes — the same scope the Validation Engine checks for evidence.
const authorizedPrefixes = (Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [])
  .map((p: any) => p.replace(/[*].*$/, "").replace(/\/+$/, ""))
  .filter(Boolean);

function isAuthorizedTarget(target: any): boolean {
  const norm = path.normalize(target);
  if (path.isAbsolute(norm) || norm === ".." || norm.startsWith(".." + path.sep)) return false;
  return authorizedPrefixes.some((pre: any) => norm === pre || norm.startsWith(pre + "/"));
}

// PROTECTED-GOVERNANCE PATHS (defense-in-depth, INDEPENDENT of authorized_paths). The governance
// subtree holds artifacts the protocol marks human-approval-only (ROADMAP / CTO directives). A broad
// write scope — notably the factory default "runtime/**" — structurally SUBSUMES this subtree, so
// authorized_paths ALONE would let a mission or a provider proposal overwrite it. authorized_paths is
// SCOPE, never AUTHORITY: being inside a granted scope does NOT authorize writing a governance artifact.
// (The EDG Constitution is already protected elsewhere by exact path; this closes the proven asymmetry
// that runtime/governance/** had no exact-path backstop at the write point.)
// SINGLE implementation of the protected-governance guard now lives in capability-executors.js (already
// required above) so the Patch Executor edits branch AND the ODG Synthetic Deliverable capability reuse
// ONE definition — no second copy. Behaviour is byte-for-byte identical (same prefixes, same boundary
// rule); the dedicated governance-guard test proves no regression at the real write point.
const { isProtectedGovernanceTarget } = capabilityExecutors;
// Writing a protected-governance path requires an EXPLICIT elevated authorization — the same opt-in idiom
// as the git protected-branch gate (allow_protected), NEVER derived from authorized_paths. It is read
// ONLY from the PLAN (the ODG-authored, mission-level decision), NEVER from the patch's own fields: a
// patch is authored by the worker/provider, so letting it carry its own authority would be exactly the
// self-authorization ("scope/worker becomes authority") this guard exists to prevent. Absent ⇒ not
// authorized (fail-closed).
function planAllowsProtectedGovernance(): boolean {
  return plan.allowProtectedGovernance === true;
}

/**
 * Apply a unified diff to `original` and return the resulting text.
 *
 * Deterministic and non-fuzzy: each hunk is anchored at its declared old-line number and every
 * context/removed line must match the file EXACTLY. Any mismatch throws — the executor then records
 * the patch as FAILED (which blocks validation) rather than writing a half-applied / corrupted file.
 * Hunk bodies are bounded by their declared line counts, so trailing noise (headers, blank tail from
 * the final split) is ignored.
 */
function applyUnifiedDiff(original: any, diffText: any): string {
  const origLines = original.split("\n");
  const diffLines = diffText.split("\n");
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  const result: any[] = [];
  let orig = 0; // 0-based cursor into origLines
  let i = 0;

  while (i < diffLines.length) {
    const m = diffLines[i].match(header);
    if (!m) { i++; continue; } // skip file headers (---/+++/diff) and any pre-hunk noise
    i++;

    const oldStart = parseInt(m[1], 10);
    const oldCount = m[2] === undefined ? 1 : parseInt(m[2], 10);
    const newCount = m[4] === undefined ? 1 : parseInt(m[4], 10);
    const hunkStart = oldStart - 1; // convert to 0-based

    if (hunkStart < orig) throw new Error(`overlapping or out-of-order hunk at line ${oldStart}`);
    while (orig < hunkStart) result.push(origLines[orig++]); // copy unchanged prefix

    let oldSeen = 0;
    let newSeen = 0;
    while (i < diffLines.length && (oldSeen < oldCount || newSeen < newCount)) {
      const raw = diffLines[i];
      if (raw === "\\ No newline at end of file") { i++; continue; }
      const tag = raw.length ? raw[0] : " ";
      const text = raw.length ? raw.slice(1) : "";
      if (tag === " ") {
        if (origLines[orig] !== text) throw new Error(`context mismatch at line ${orig + 1}`);
        result.push(origLines[orig++]); oldSeen++; newSeen++;
      } else if (tag === "-") {
        if (origLines[orig] !== text) throw new Error(`removal mismatch at line ${orig + 1}`);
        orig++; oldSeen++;
      } else if (tag === "+") {
        result.push(text); newSeen++;
      } else {
        throw new Error(`unexpected diff line: ${JSON.stringify(raw)}`);
      }
      i++;
    }
  }

  while (orig < origLines.length) result.push(origLines[orig++]); // copy unchanged suffix
  return result.join("\n");
}

// Deterministic report: no wall-clock stamp, so an identical mission produces an identical
// patch-execution.json (DETERMINISM_FIRST / reproducible).
const report: any = {
  mission: plan.mission,
  executed: []
};

// CTO Phase-03 — provenance attribution stamped on EVERY executed[] entry (author vs applicator vs
// authority, kept distinct). `authoredBy` is the PROVEN origin carried on the plan's patch (PROVIDER /
// CONTRACT / a retained memory precedent author / UNKNOWN); it is NEVER assumed to be ODG. `appliedBy` is
// ODG_EXECUTOR ONLY when THIS executor actually produced the effect this run. `authorizedBy` is ODG ONLY
// when an authorized effect actually occurred. `humanMandatory` is set ONLY where a human authority is
// demonstrably required (not merely because an action was blocked).
function plannedAuthor(patch: any): any {
  return (patch && typeof patch.authoredBy === "string" && patch.authoredBy) ? patch.authoredBy : "UNKNOWN";
}
function attribution(opts: any): any {
  return {
    authoredBy: opts.authoredBy,
    appliedBy: opts.appliedEffect === true ? "ODG_EXECUTOR" : null,
    authorizedBy: opts.authorized === true ? "ODG" : null,
    humanMandatory: opts.humanMandatory === true,
  };
}

fs.mkdirSync(GENERATED_DIR, { recursive: true });

// V5 Stage 5 — persistent idempotency journal (opt-in). Keyed by a patch's idempotencyKey so a REPLAY in
// a later run is detected as a DUPLICATE and performs zero new mutation. Loaded best-effort; only written
// back when a keyed patch actually applied, so missions that declare no idempotencyKey never touch it.
const IDEMPOTENCY_JOURNAL = path.join(GENERATED_DIR, "idempotency-journal.json");
let idemJournal: any = {};
try {
  const raw = JSON.parse(fs.readFileSync(IDEMPOTENCY_JOURNAL, "utf8"));
  if (raw && typeof raw === "object" && !Array.isArray(raw)) idemJournal = raw;
} catch { idemJournal = {}; }
let idemJournalChanged = false;

// V5 Decision A — reality artifact/resource state (canonical identity + versioned CAS). Opt-in per patch
// (actionContract.realityCas === true): only then is an edit's target read/CAS'd/transitioned against the
// reality store. Loaded best-effort; written back only when an opted-in write applied, so legacy patches
// never create or touch it. runtime/generated/artifact-state.json is git-ignored Runtime state.
const ARTIFACT_STATE_FILE = path.join(GENERATED_DIR, "artifact-state.json");
let artifactModel: any = artifactState.load(ARTIFACT_STATE_FILE);
let artifactModelChanged = false;

/**
 * Run `grep -RIn <pattern> <targets...>` and stream its stdout DIRECTLY to a
 * file descriptor instead of buffering it in memory.
 *
 * This is the definitive fix for the historical `spawnSync /bin/sh ENOBUFS`:
 *   - execSync() kept the whole child stdout in memory (default maxBuffer 1 MiB)
 *     and aborted with ENOBUFS once the output grew past it;
 *   - here the OS writes grep's output straight to disk, so the buffer size is
 *     irrelevant and ENOBUFS can never happen, whatever the output volume.
 *
 * We also exclude the generated/ output directories from the scan. Without this,
 * grep recursively re-scanned the reports it had itself produced
 * (todo-report.txt, fixme-report.txt, ...), each line of which contains the
 * searched keyword — a feedback loop that made the output explode run after run.
 * That runaway growth was the actual source of the ENOBUFS.
 *
 * grep exit codes: 0 = matches found, 1 = no match (not an error here), >1 = error.
 */
function grepToFile(pattern: any, targets: any, outFile: any, includes?: any): any {
  const fd = fs.openSync(outFile, "w");
  try {
    const includeArgs = (includes || []).map((glob: any) => "--include=" + glob);
    const res = spawnSync(
      "grep",
      [
        "-RIn",
        "--exclude-dir=generated",
        "--exclude-dir=.generated",
        "--exclude-dir=node_modules",
        "--exclude-dir=.git",
        ...includeArgs,
        pattern,
        ...targets
      ],
      { stdio: ["ignore", fd, "ignore"] }
    );
    if (res.error) throw res.error;
    if (typeof res.status === "number" && res.status > 1) {
      throw new Error("grep exited with status " + res.status);
    }
    if (res.signal) {
      throw new Error("grep terminated by signal " + res.signal);
    }
  } finally {
    fs.closeSync(fd);
  }
  return outFile;
}

/**
 * Parse a `path:line:content` dependency report and extract the module specifier
 * from `import ... from "x"`, `import "x"`, or `require("x")` lines.
 */
function extractModule(content: any): any {
  let m =
    content.match(/from\s+["']([^"']+)["']/) ||
    content.match(/require\(\s*["']([^"']+)["']\s*\)/) ||
    content.match(/import\s+["']([^"']+)["']/) ||
    content.match(/import\(\s*["']([^"']+)["']\s*\)/);
  return m ? m[1] : null;
}

function isInternal(mod: any): boolean {
  return (
    mod.startsWith("@/") ||
    mod.startsWith("./") ||
    mod.startsWith("../") ||
    mod.startsWith("/")
  );
}

function slugify(name: any): any {
  return name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function classify(name: any): any {
  const parts = name.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/);
  const pascal = parts
    .map((p: any) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return /^[A-Za-z]/.test(pascal) ? pascal : "Capability" + pascal;
}

// IDENTITY PRE-WRITE GATE (opt-in). Before mutating ANY file, a run that carries `edits` (a consequential
// source mutation) must pass the canonical Truth-Lock repo-safety policy. This covers DIRECT patch-executor
// spawns that bypass the odg-run entry gate (e.g. patch-proposal-apply spawning `node patch-executor.js`).
// Observational / no-`edits` runs skip entirely. Opt-in via ODG_TRUTH_LOCK_ENFORCE (default no-op ⇒
// byte-identical). Git facts read live (real git in cwd). Reuses the canonical gate — no second policy. A
// refusal writes an honest FAILED record and exits non-zero BEFORE the loop, so NOTHING is written.
{
  // R2: a run MUTATES if it carries `edits` OR any file-writing SYMBOLIC action (the legacy switch cases below
  // that fs.writeFileSync a report/scaffold). Both are gated uniformly so no file-mutating patch-executor run
  // bypasses the repo-safety gate under enforcement. (Keep this list in lockstep with the mutating switch cases.)
  const __MUTATING_SYMBOLIC = ["PROCESS_TODOS", "PROCESS_FIXMES", "ANALYZE_DEPENDENCIES", "OPTIMIZE_DEPENDENCIES", "IMPLEMENT_MISSING_CAPABILITIES"];
  const __hasMutatingWork = Array.isArray(plan.patches) && plan.patches.some((p: any) => (Array.isArray(p.edits) && p.edits.length > 0) || __MUTATING_SYMBOLIC.includes(p.action));
  const __tlEnforce = process.env.ODG_TRUTH_LOCK_ENFORCE === "1" || process.env.ODG_TRUTH_LOCK_ENFORCE === "true";
  if (__hasMutatingWork && __tlEnforce) {
    const { truthLockGate } = require("./truth-lock-gate");
    const __tl = truthLockGate({ mutating: true, enforce: true, mission: plan.mission });
    if (__tl.blocked) {
      for (const p of plan.patches) {
        report.executed.push({ action: p.action, objectiveId: p.objectiveId, status: "FAILED", code: "TRUTH_LOCK_REFUSED", detail: __tl.verdict.detail, ...attribution({ authoredBy: plannedAuthor(p), appliedEffect: false, authorized: false, humanMandatory: true }) });
      }
      fs.writeFileSync(path.join(GENERATED_DIR, "patch-execution.json"), JSON.stringify(report, null, 2));
      console.error("STOP: Truth Lock REFUSED a mutating patch run before any write —", __tl.verdict.detail);
      process.exit(1);
    }
  }
}

for (const patch of plan.patches) {
  console.log("EXECUTE:", patch.action);

  try {
    // Real (file-modifying) patch. A patch carrying `edits` actually applies each edit to its
    // target file — full-file `content` writes, or unified-`diff` application — instead of merely
    // recording the action. Symbolic patches (no `edits`) fall through to the legacy switch below,
    // so historical behavior is unchanged.
    if (Array.isArray(patch.edits) && patch.edits.length > 0) {
      // V5 Stage 2 admission gate (FICHE_01 §13/§15): a consequential WRITE passes through the
      // Action/Contract/Policy gate BEFORE any mutation. OBSERVE-THEN-ENFORCE — a patch that declares
      // an explicit Action Contract (or the plan/env opts in) is ENFORCED: a non-ALLOW decision throws
      // here, BEFORE any file is written (so a denied/escalated action mutates nothing, recorded FAILED
      // by the outer catch). A legacy patch with no Action Contract is OBSERVED: the decision is
      // recorded as audit (enforced:false) and the existing WRITE still executes — authorized_paths is
      // NEVER treated as authority, so the recorded decision is a truthful DENY, not a silent grant.
      const admissions = patch.edits.map((edit: any) => admitPatchEdit(patch, edit, plan));
      const refusals = admissions.filter((a: any) => a.enforced && a.decision !== "ALLOW");
      // A HARD refusal (contract/policy/state defect, malformed action, or MISUSED authority — expired,
      // cross-mission, revoked) is a real violation: throw BEFORE any write (recorded FAILED). Permission
      // reuse is NEVER downgraded into a friendly resumable state (least privilege preserved).
      const hardRefusal = refusals.find((a: any) => a.refusal && a.refusal.resumable === false);
      if (hardRefusal) {
        const why = hardRefusal.violations.length
          ? hardRefusal.violations.join("; ")
          : hardRefusal.escalation.reasons.join("; ");
        throw new Error(`action gate ${hardRefusal.decision} (${hardRefusal.target}): ${why || "not admitted"}`);
      }
      // A RESUMABLE refusal (ESCALATE for human authority, or authority simply not yet granted) is an
      // honest, resumable per-action BLOCKED — recorded with ZERO mutation (we stop before any write).
      // Independent sibling patches keep executing; the Validation Engine surfaces PARTIAL, and supplying
      // the authority lets a re-run resume this action to SUCCESS. This is NOT a no-op RECORDED and NOT a
      // FAILED error — it is the per-action authorization boundary made explicit.
      const resumableRefusal = refusals.find((a: any) => a.refusal && a.refusal.resumable === true);
      if (resumableRefusal) {
        report.executed.push({
          action: patch.action,
          objectiveId: patch.objectiveId || patch.action,
          status: "BLOCKED",
          decision: resumableRefusal.decision,
          needs: resumableRefusal.refusal.reason,
          target: resumableRefusal.target,
          ...attribution({
            authoredBy: plannedAuthor(patch),
            appliedEffect: false,
            authorized: false,
            humanMandatory: resumableRefusal.decision === "ESCALATE",
          }),
        });
        continue;
      }

      // PROTECTED-GOVERNANCE BOUNDARY — BEFORE idempotency / reality / any write (zero mutation). If ANY
      // edit targets the governance subtree and no EXPLICIT elevated authorization is present, this is a
      // resumable per-action BLOCKED (exactly like the authz boundary above): scope is not authority, so a
      // broad "runtime/**" grant never implicitly authorizes overwriting ROADMAP / CTO directives. Grant the
      // elevated authority (plan.allowProtectedGovernance / actionContract.allow_protected) and a re-run
      // resumes. Checked across ALL edits first so a multi-edit patch mutates nothing partially.
      const governanceEdit = patch.edits.find(
        (e: any) => e && typeof e.target === "string" && isProtectedGovernanceTarget(e.target),
      );
      if (governanceEdit && !planAllowsProtectedGovernance()) {
        report.executed.push({
          action: patch.action,
          objectiveId: patch.objectiveId || patch.action,
          status: "BLOCKED",
          decision: "ESCALATE",
          needs: `writing a protected governance path (${governanceEdit.target}) requires an explicit ODG-level elevated authorization (plan.allowProtectedGovernance); authorized_paths is scope, not authority, and a patch cannot self-authorize it`,
          target: governanceEdit.target,
          ...attribution({
            authoredBy: plannedAuthor(patch),
            appliedEffect: false,
            authorized: false,
            humanMandatory: true,
          }),
        });
        continue;
      }

      // V5 Stage 5 idempotency / compare-and-set — OPT-IN per patch via idempotencyKey. Order:
      // admission -> idempotency -> mutation. A declared key means the caller REQUIRES idempotency:
      //   DUPLICATE (key already applied) -> ZERO new mutation, reconcile to the prior result ;
      //   CONFLICT  (stale compare-and-set vs plan.stateVersion) -> throw BEFORE any write (FAILED) ;
      //   PROCEED   -> fall through to mutation, then record the key after APPLIED.
      // A patch with no idempotencyKey is unguarded (not protected — never a false promise). There is no
      // DUPLICATE->WRITE or CONFLICT->WRITE path: DUPLICATE `continue`s and CONFLICT throws before writes.
      const idemKey =
        (patch.actionContract && typeof patch.actionContract.idempotencyKey === "string" && patch.actionContract.idempotencyKey) ||
        (typeof patch.idempotencyKey === "string" && patch.idempotencyKey) ||
        null;
      if (idemKey) {
        const expectedPrev =
          patch.actionContract && patch.actionContract.expectedTransition
            ? patch.actionContract.expectedTransition.state_version_before
            : undefined;
        const req: any = { actionId: patch.action, idempotencyKey: idemKey };
        if (expectedPrev !== undefined) req.expectedPreviousState = expectedPrev;
        const verdict = idempotency.admit(req, idemJournal, plan.stateVersion);
        if (verdict.decision === "DUPLICATE") {
          report.executed.push({
            action: patch.action,
            objectiveId: patch.objectiveId || patch.action,
            status: "DUPLICATE",
            idempotencyKey: idemKey,
            reconciled: verdict.reconciledResult,
            ...attribution({
              authoredBy: plannedAuthor(patch),
              appliedEffect: false, // replay reconciled ⇒ no fresh effect this run
              authorized: false,
              humanMandatory: false,
            }),
          });
          continue; // replay ⇒ zero new mutation
        }
        if (verdict.decision === "CONFLICT") {
          throw new Error(`idempotency ${verdict.decision} (${idemKey}): ${verdict.detail}`);
        }
      }

      // V5 Decision A reality CAS — OPT-IN (actionContract.realityCas === true). Order:
      // admission -> idempotency -> REALITY READ + compare-and-set -> mutation -> reality transition.
      // For each edit we READ the target artifact's current reality version; if the edit declares an
      // `expectedVersion`, it MUST equal the current version, else CONFLICT -> throw BEFORE any write
      // (zero mutation, FAILED). The canonical identity is the normalized repo-relative path (Decision A);
      // authorized_paths is still SCOPE only, never authority/identity. Legacy patches (no realityCas) do
      // not touch the reality store — recorded version ≠ silent protection (no false promise).
      const realityCas =
        (patch.actionContract && patch.actionContract.realityCas === true) || patch.realityCas === true;
      if (realityCas) {
        for (const edit of patch.edits) {
          const id = artifactState.canonicalId(edit.target);
          if (id === null) throw new Error(`reality CAS: "${edit.target}" is not a valid canonical artifact identity`);
          if (Number.isInteger(edit.expectedVersion)) {
            const cur = artifactState.currentVersion(artifactModel, id);
            if (edit.expectedVersion !== cur) {
              throw new Error(`reality CONFLICT (${id}): expectedVersion ${edit.expectedVersion} != current ${cur} (stale)`);
            }
          }
        }
      }

      const applied: any[] = [];
      for (const edit of patch.edits) {
        if (!isAuthorizedTarget(edit.target)) {
          throw new Error(`target outside authorized_paths: ${edit.target}`);
        }
        if (typeof edit.content === "string") {
          fs.mkdirSync(path.dirname(edit.target), { recursive: true });
          fs.writeFileSync(edit.target, edit.content);
          applied.push({ target: edit.target, mode: "content", writtenContent: edit.content });
        } else if (typeof edit.diff === "string") {
          const original = fs.existsSync(edit.target)
            ? fs.readFileSync(edit.target, "utf8")
            : "";
          const next = applyUnifiedDiff(original, edit.diff);
          fs.mkdirSync(path.dirname(edit.target), { recursive: true });
          fs.writeFileSync(edit.target, next);
          applied.push({ target: edit.target, mode: "diff", writtenContent: next });
        } else {
          throw new Error(`edit for ${edit.target} has neither content nor diff`);
        }
      }
      // V5 Decision A — reality STATE TRANSITION after the OBSERVED EFFECT (the write). For an opted-in
      // patch each applied artifact's reality version increments by 1 (CAS on the pre-write current
      // version, which is unchanged in this single-process run) with the sha256 of the bytes actually
      // written. This makes the reality version authentic (tied to real content), not caller-supplied.
      const realityRecords: any[] = [];
      if (realityCas) {
        for (const a of applied) {
          const id = artifactState.canonicalId(a.target);
          const cur = artifactState.currentVersion(artifactModel, id);
          const r = artifactState.transition(artifactModel, a.target, {
            expectedPreviousVersion: cur,
            content: a.writtenContent,
            provenance: plan.mission,
          });
          if (!r.ok) throw new Error(`reality transition ${r.decision} (${id}): ${r.error}`);
          artifactModel = r.model;
          artifactModelChanged = true;
          realityRecords.push({ artifact: id, version: r.artifact.version, contentHash: r.artifact.contentHash });
        }
      }

      report.executed.push({
        action: patch.action,
        objectiveId: patch.objectiveId || patch.action,
        // The objective's goal — the mission-independent problem identity. Recorded on the APPLIED
        // evidence so post-release learning can key the reusable solution on the problem (reusable across
        // missions) rather than on the mission-specific objective id. Absent ⇒ learning falls back.
        ...(typeof patch.goal === "string" && patch.goal ? { goal: patch.goal } : {}),
        status: "APPLIED",
        files: applied.map((a: any) => ({ target: a.target, mode: a.mode })),
        // Audit the admission decision (truthful; never a success claim). For legacy patches this is
        // the observed decision under enforced:false — a visible compatibility state, not a bypass.
        admission: admissions.map((a: any) => ({ target: a.target, decision: a.decision, enforced: a.enforced })),
        // Reality state after the observed effect (present only for opted-in patches); authentic version.
        ...(realityRecords.length ? { reality: realityRecords } : {}),
        // Author = carried on the plan's patch (PROVIDER/CONTRACT/memory-origin/UNKNOWN — NEVER assumed
        // ODG); applicator = this ODG executor, which just performed the write; authority = ODG scope.
        ...attribution({ authoredBy: plannedAuthor(patch), appliedEffect: true, authorized: true, humanMandatory: false }),
      });
      // Record the applied idempotencyKey AFTER the observed effect, so a later replay reconciles to it.
      if (idemKey) {
        idemJournal = idempotency.record(idemJournal, idemKey, { status: "APPLIED", files: applied });
        idemJournalChanged = true;
      }
      continue;
    }

    switch (patch.action) {
      case "PROCESS_TODOS": {
        const out = grepToFile(
          "TODO",
          ["src", "runtime"],
          path.join(GENERATED_DIR, "todo-report.txt")
        );
        report.executed.push({ action: patch.action, status: "DONE", output: out, ...attribution({ authoredBy: "ODG_RULES", appliedEffect: true, authorized: true, humanMandatory: false }) });
        break;
      }

      case "PROCESS_FIXMES": {
        const out = grepToFile(
          "FIXME",
          ["src", "runtime"],
          path.join(GENERATED_DIR, "fixme-report.txt")
        );
        report.executed.push({ action: patch.action, status: "DONE", output: out, ...attribution({ authoredBy: "ODG_RULES", appliedEffect: true, authorized: true, humanMandatory: false }) });
        break;
      }

      case "ANALYZE_DEPENDENCIES": {
        // Restricted to *.js / *.ts to match the original behavior, which
        // filtered file types via `find -name "*.js" -o -name "*.ts"`.
        const out = grepToFile(
          "^import\\|require(",
          ["src", "runtime"],
          path.join(GENERATED_DIR, "dependency-report.txt"),
          ["*.js", "*.ts"]
        );
        report.executed.push({ action: patch.action, status: "DONE", output: out, ...attribution({ authoredBy: "ODG_RULES", appliedEffect: true, authorized: true, humanMandatory: false }) });
        break;
      }

      case "OPTIMIZE_DEPENDENCIES": {
        const src = path.join(GENERATED_DIR, "dependency-report.txt");
        if (!fs.existsSync(src)) {
          throw new Error(
            "dependency-report.txt not found — ANALYZE_DEPENDENCIES must run first"
          );
        }

        const lines = fs.readFileSync(src, "utf8").split("\n");
        const moduleCount = new Map();       // module -> total import count
        const perFileModule = new Map();     // "file\0module" -> count (NUL separator, parity with the .js)
        let totalImports = 0;
        let internal = 0;
        let external = 0;

        for (const line of lines) {
          if (!line) continue;
          const m = line.match(/^(.*?):(\d+):(.*)$/);
          if (!m) continue;
          const file = m[1];
          const content = m[3];
          const mod = extractModule(content);
          if (!mod) continue;

          totalImports++;
          moduleCount.set(mod, (moduleCount.get(mod) || 0) + 1);
          if (isInternal(mod)) internal++;
          else external++;

          const key = file + "\0" + mod;
          perFileModule.set(key, (perFileModule.get(key) || 0) + 1);
        }

        const topModules = [...moduleCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([module, count]) => ({ module, count }));

        const duplicateImports = [...perFileModule.entries()]
          .filter(([, count]) => count > 1)
          .map(([key, count]) => {
            const [file, module] = key.split("\0");
            return { file, module, count };
          })
          .sort((a, b) => b.count - a.count);

        const suggestions: any[] = [];
        for (const t of topModules) {
          if (t.count >= 10) {
            suggestions.push(
              `Module "${t.module}" is imported ${t.count} times — consider a shared barrel/facade to centralize it.`
            );
          }
        }
        for (const d of duplicateImports.slice(0, 20)) {
          suggestions.push(
            `Duplicate import of "${d.module}" in ${d.file} (${d.count}×) — merge into a single import.`
          );
        }
        if (suggestions.length === 0) {
          suggestions.push("No optimization opportunities detected.");
        }

        const optimization = {
          generatedAt: new Date().toISOString(),
          source: src,
          totalImports,
          uniqueModules: moduleCount.size,
          externalVsInternal: { internal, external },
          topModules,
          duplicateImports,
          suggestions
        };

        const out = path.join(GENERATED_DIR, "dependency-optimization.json");
        fs.writeFileSync(out, JSON.stringify(optimization, null, 2));
        report.executed.push({ action: patch.action, status: "DONE", output: out, ...attribution({ authoredBy: "ODG_RULES", appliedEffect: true, authorized: true, humanMandatory: false }) });
        break;
      }

      case "IMPLEMENT_MISSING_CAPABILITIES": {
        const registryPath = path.join(GENERATED_DIR, "capability-registry.json");
        if (!fs.existsSync(registryPath)) {
          throw new Error("capability-registry.json not found");
        }

        const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        const missing = Array.isArray(registry.missingCapabilities)
          ? registry.missingCapabilities
          : [];

        const scaffoldDir = path.join(GENERATED_DIR, "capabilities");
        fs.mkdirSync(scaffoldDir, { recursive: true });

        const implemented: any[] = [];
        for (const name of missing) {
          const slug = slugify(name);
          const className = classify(name);
          const filePath = path.join(scaffoldDir, slug + ".js");

          const moduleSource =
            '"use strict";\n' +
            "/**\n" +
            " * Auto-generated capability scaffold: " + name + "\n" +
            " * Produced by patch-executor IMPLEMENT_MISSING_CAPABILITIES.\n" +
            " * This is a minimal, safe stub — flesh out with the real implementation.\n" +
            " */\n\n" +
            "const CAPABILITY_NAME = " + JSON.stringify(name) + ";\n\n" +
            "class " + className + " {\n" +
            "  constructor(options = {}) {\n" +
            "    this.name = CAPABILITY_NAME;\n" +
            "    this.options = options;\n" +
            "    this.status = \"SCAFFOLD\";\n" +
            "  }\n\n" +
            "  describe() {\n" +
            "    return { name: this.name, status: this.status, implemented: false };\n" +
            "  }\n\n" +
            "  async initialize() {\n" +
            "    return { name: this.name, ready: true };\n" +
            "  }\n" +
            "}\n\n" +
            "module.exports = { " + className + ", CAPABILITY_NAME };\n";

          fs.writeFileSync(filePath, moduleSource);
          implemented.push({
            capability: name,
            slug,
            className,
            scaffold: filePath,
            status: "SCAFFOLDED"
          });
        }

        const summary = {
          generatedAt: new Date().toISOString(),
          source: registryPath,
          requested: missing.length,
          implemented: implemented.length,
          capabilities: implemented
        };

        const out = path.join(GENERATED_DIR, "implemented-capabilities.json");
        fs.writeFileSync(out, JSON.stringify(summary, null, 2));
        report.executed.push({ action: patch.action, status: "DONE", output: out, ...attribution({ authoredBy: "ODG_RULES", appliedEffect: true, authorized: true, humanMandatory: false }) });
        break;
      }

      default: {
        // Mission-driven objective step. FIRST try to map the objective to a REAL capability
        // executor (capability-executors.js). If one matches, it actually runs the capability's
        // business logic and produces an evidence artifact — closing the Mission → Capability →
        // Execution → Evidence chain that was previously a no-op. A capability that throws falls to
        // the outer catch and is recorded FAILED (which blocks validation).
        const executor = capabilityExecutors.resolve(patch);
        if (executor) {
          const result = executor.run();
          report.executed.push({
            action: patch.action,
            objectiveId: patch.objectiveId || patch.action,
            status: "EXECUTED",
            capability: result.capability,
            evidence: result.evidence,
            // A registered ODG capability executor authored AND ran this (ODG business logic), under ODG scope.
            ...attribution({ authoredBy: "ODG_CAPABILITY", appliedEffect: true, authorized: true, humanMandatory: false }),
          });
          break;
        }
        // No capability maps to this objective. TWO distinct cases:
        //   (a) The objective DECLARES it requires a capability (requiresCapability / blockedReason) and
        //       none is available/registered: this is the "requested capability is unavailable" boundary.
        //       Record an honest, resumable per-action BLOCKED — NOT a no-op RECORDED — so independent
        //       siblings still execute and the Validation Engine surfaces PARTIAL (resumable once the
        //       capability is provisioned). This is the per-action evaluation the mission requires.
        //   (b) Otherwise it is a genuinely read-only/planning objective, discharged by planning +
        //       evidence: RECORD it (A3 behaviour unchanged — not SKIPPED, not FAILED).
        if (patch.requiresCapability === true || typeof patch.blockedReason === "string") {
          report.executed.push({
            action: patch.action,
            objectiveId: patch.objectiveId || patch.action,
            status: "BLOCKED",
            decision: "CAPABILITY_UNAVAILABLE",
            needs: (typeof patch.blockedReason === "string" && patch.blockedReason)
              ? patch.blockedReason
              : `no registered capability resolves objective "${patch.objectiveId || patch.action}"`,
            // A missing capability is a capability gap, NOT a demonstrated human-authority requirement.
            ...attribution({ authoredBy: plannedAuthor(patch), appliedEffect: false, authorized: false, humanMandatory: false }),
          });
          break;
        }
        // RC-3: make the capability-resolution MISS EXPLICIT without fabricating success and without
        // weakening any gate. The status STAYS "RECORDED" on purpose — validation-engine.noRecordedNoOp
        // and self-diagnostic's recorded-noop both key on that exact status and MUST keep firing (a
        // rename would silence both). For a WRITE-SCOPE (engineering) objective we attach an explicit
        // `reason` so the no-op is diagnosable at the source; a read-only/planning objective (no
        // authorized paths) is a legitimate RECORDED and stays byte-identical to before.
        const recorded: any = {
          action: patch.action,
          objectiveId: patch.objectiveId || patch.action,
          status: "RECORDED",
        };
        // A read-only/planning RECORDED entry stays byte-identical {action,objectiveId,status} — a locked
        // control (patch-executor.test.js §2 + downstream selectors). Attribution is therefore added ONLY to
        // the WRITE-SCOPE RECORDED (alongside `reason`); the read-only no-op carries none and fail-closes to
        // UNKNOWN at measurement (never counted as autonomous). Documented limit — not a silent omission.
        if (authorizedPrefixes.length > 0) {
          Object.assign(recorded, attribution({ authoredBy: plannedAuthor(patch), appliedEffect: false, authorized: false, humanMandatory: false }));
          recorded.reason =
            "no capability executor resolved for this objective and no real edits were produced; " +
            "a write-scope objective discharged as a no-op is not real work and fails closed at validation";
        }
        report.executed.push(recorded);
      }
    }
  } catch (e: any) {
    report.executed.push({
      action: patch.action,
      status: "FAILED",
      error: String(e.stack || e),
      // A failure produced no authorized effect; author carried from the plan (UNKNOWN if none).
      ...attribution({ authoredBy: plannedAuthor(patch), appliedEffect: false, authorized: false, humanMandatory: false }),
    });
  }
}

// Persist the idempotency journal ONLY when a keyed patch actually applied — missions that declare no
// idempotencyKey never create or touch this file (byte-for-byte unchanged behaviour for legacy patches).
if (idemJournalChanged) {
  fs.writeFileSync(IDEMPOTENCY_JOURNAL, JSON.stringify(idemJournal, null, 2));
}

// Persist the reality artifact-state ONLY when an opted-in (realityCas) patch applied — legacy patches
// never create or touch it (byte-for-byte unchanged behaviour).
if (artifactModelChanged) {
  artifactState.save(ARTIFACT_STATE_FILE, artifactModel);
}

fs.writeFileSync(
  path.join(GENERATED_DIR, "patch-execution.json"),
  JSON.stringify(report, null, 2)
);

console.log("======================================");
console.log("PATCH EXECUTOR v4");
console.log("======================================");
console.log("Executed :", report.executed.length);
console.log("======================================");
