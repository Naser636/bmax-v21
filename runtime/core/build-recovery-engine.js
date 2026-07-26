#!/usr/bin/env node

/*
 * Build Recovery Engine — capability BUILD_GATE_AUTONOMY.
 *
 * WHY THIS EXISTS
 * ---------------
 * Historically the Validation Engine treated a red build / TypeScript gate as a terminal STOP: the
 * pipeline halted and the mission could never progress locally. That made a single compiler error
 * an unrecoverable dead-end and pushed every such mission straight to a (paid) Provider.
 *
 * The Validation Engine now DELEGATES a red gate to this engine instead of stopping. The engine runs
 * a bounded, evidence-guarded self-repair loop and hands control BACK to the Validation Engine with
 * one of two verdicts:
 *   - build === true && typescript === true   → the gate recovered locally; validation continues.
 *   - no improvement could be demonstrated     → the Provider is authorized (and ONLY then).
 *
 * THE LOOP (contract)
 *   1. run the build / typecheck;
 *   2. collect every TypeScript error;
 *   3. classify the errors by root cause;
 *   4. apply ONLY authorized local fixes (runtime/config/build-recovery.json), ONLY inside the
 *      mission's authorized paths;
 *   5. re-run the build automatically;
 *   6. keep going WHILE the total error count strictly decreases;
 *   7. return control when build && typescript are green, OR when no improvement is demonstrated —
 *      in that last case only, authorize the Provider.
 *
 * SAFETY INVARIANT
 *   Every iteration is snapshotted before edits and REVERTED if the error count did not strictly
 *   decrease. The engine therefore can never make the tree worse: the worst case is "no net change,
 *   Provider authorized". This is what lets the fixers be pragmatic text transforms rather than a
 *   full type-aware refactor — an unhelpful edit is rolled back, not kept.
 *
 * It is deterministic given the same sources (no wall-clock in the decision path; timestamps only
 * decorate the evidence report) and never touches the Roadmap, the Scheduler or the Mission Engine.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CONFIG = path.join(ROOT, "runtime", "config", "build-recovery.json");
const REPORT_PATH = path.join(ROOT, "runtime", "generated", "build-recovery-report.json");
const PROVIDER_AUTH_PATH = path.join(ROOT, "runtime", "generated", "provider-authorization.json");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function loadConfig(configPath) {
    const p = configPath || DEFAULT_CONFIG;
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
        typecheckCommand: raw.typecheckCommand || ["npx", "tsc", "--noEmit", "--pretty", "false"],
        buildCommand: raw.buildCommand || ["npm", "run", "build"],
        buildTimeoutMs: typeof raw.buildTimeoutMs === "number" ? raw.buildTimeoutMs : 420000,
        maxIterations: typeof raw.maxIterations === "number" ? raw.maxIterations : 12,
        fixers: Array.isArray(raw.authorizedFixers) ? raw.authorizedFixers : [],
    };
}

// ---------------------------------------------------------------------------
// TypeScript diagnostics
// ---------------------------------------------------------------------------

// Match `path/to/file.ts(12,34): error TS1234: message`
const DIAG_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

function collectErrors(cfg, cwd) {
    const [cmd, ...args] = cfg.typecheckCommand;
    const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const diagnostics = [];
    for (const line of out.split(/\r?\n/)) {
        const m = DIAG_RE.exec(line.trim());
        if (!m) continue;
        diagnostics.push({
            file: m[1].trim(),
            line: parseInt(m[2], 10),
            col: parseInt(m[3], 10),
            code: m[4],
            message: m[5].trim(),
        });
    }
    return diagnostics;
}

function runBuild(cfg, cwd) {
    const [cmd, ...args] = cfg.buildCommand;
    const r = spawnSync(cmd, args, {
        cwd,
        encoding: "utf8",
        timeout: cfg.buildTimeoutMs,
        stdio: "ignore",
    });
    // A non-zero status, a signal (e.g. timeout SIGTERM), or a spawn error all mean "build not green".
    return r.status === 0 && !r.signal && !r.error;
}

// ---------------------------------------------------------------------------
// Scope + classification
// ---------------------------------------------------------------------------

// Normalize authorized paths (drop glob tails like /** or *) to a prefix match — identical to the
// Validation Engine's own scope check, so "in scope" means the same thing to both engines.
function scopePrefixes(authorizedPaths) {
    return (authorizedPaths || [])
        .map((p) => p.replace(/[*].*$/, "").replace(/\/+$/, ""))
        .filter((p) => p.length > 0);
}

function inScope(file, prefixes) {
    if (prefixes.length === 0) return false;
    const norm = file.replace(/\\/g, "/");
    return prefixes.some((pre) => norm === pre || norm.startsWith(pre + "/") || norm.startsWith(pre));
}

function rootCauseFor(code, fixers) {
    const hit = fixers.find((f) => f.code === code);
    return hit ? hit.rootCause : "uncategorized-type-error";
}

// ---------------------------------------------------------------------------
// Authorized fixers — each returns true iff it modified `lines` in place.
// All are LINE-LOCAL (edit or remove a single line) so they compose safely when
// applied bottom-up (highest line number first) within one file.
// ---------------------------------------------------------------------------

// TS6133 — remove an unused *import* specifier only. Never removes a plain local binding, which the
// compiler also flags with TS6133 but which may exist for a side effect.
function removeUnusedImport(diag, lines) {
    const idx = diag.line - 1;
    if (idx < 0 || idx >= lines.length) return false;
    const nameMatch = /^'(.+?)' is declared but its value is never read/.exec(diag.message);
    if (!nameMatch) return false;
    const name = nameMatch[1];
    const line = lines[idx];
    if (!/^\s*import\b/.test(line)) return false; // imports only

    // Named import inside braces: remove just this specifier, cleaning up commas.
    const braces = /\{([^}]*)\}/.exec(line);
    if (braces) {
        const specifiers = braces[1].split(",").map((s) => s.trim()).filter(Boolean);
        const kept = specifiers.filter((s) => {
            // Handles `Foo` and `Foo as Bar` (the local binding is the flagged name).
            const local = s.split(/\s+as\s+/).pop().trim();
            return local !== name && s.trim() !== name;
        });
        if (kept.length === specifiers.length) return false; // name not a named specifier here
        if (kept.length === 0) {
            // No named specifiers left. If there is also a default import (`import X, { Y } from ...`),
            // keep the default; otherwise the whole statement is now dead.
            const stripped = line.replace(/\{[^}]*\}/, "").replace(/,\s*from/, " from");
            if (/import\s+[A-Za-z_$][\w$]*\s+from/.test(stripped)) {
                lines[idx] = stripped.replace(/import\s+/, "import ").replace(/\s+from/, " from");
                return true;
            }
            lines.splice(idx, 1);
            return true;
        }
        lines[idx] = line.replace(/\{[^}]*\}/, `{ ${kept.join(", ")} }`);
        return true;
    }

    // Whole-line default/namespace import of exactly this name → dead statement.
    if (new RegExp(`^\\s*import\\s+(\\*\\s+as\\s+)?${escapeRe(name)}\\s+from`).test(line)) {
        lines.splice(idx, 1);
        return true;
    }
    return false;
}

// TS2304 / TS2551 / TS2552 — apply the compiler's own "Did you mean 'Y'?" rename.
function applySuggestion(diag, lines) {
    const idx = diag.line - 1;
    if (idx < 0 || idx >= lines.length) return false;
    const m = /'(.+?)'.*?Did you mean '(.+?)'\?/.exec(diag.message);
    if (!m) return false;
    const [, wrong, right] = m;
    const line = lines[idx];
    // Replace the wrong identifier at (or nearest at/after) the reported column, word-bounded.
    const re = new RegExp(`\\b${escapeRe(wrong)}\\b`, "g");
    let match;
    let target = -1;
    while ((match = re.exec(line)) !== null) {
        if (match.index + 1 >= diag.col) { target = match.index; break; }
        target = match.index; // fall back to the last occurrence before the column
    }
    if (target < 0) return false;
    lines[idx] = line.slice(0, target) + right + line.slice(target + wrong.length);
    return true;
}

// TS2783 — `{ X, ...rest }` silently overwrites the explicit X. Move X after the spread so the
// explicit value wins (single-line object literals only; multi-line is left for the Provider).
function reorderSpreadOverwrite(diag, lines) {
    const idx = diag.line - 1;
    if (idx < 0 || idx >= lines.length) return false;
    const m = /'(.+?)' is specified more than once/.exec(diag.message);
    if (!m) return false;
    const name = m[1];
    const line = lines[idx];
    // `{ X, ...rest }`  →  `{ ...rest, X }`  (X shorthand, before a spread, same literal)
    const re = new RegExp(`\\{\\s*${escapeRe(name)}\\s*,\\s*(\\.\\.\\.[^}]+?)\\s*\\}`);
    if (!re.test(line)) return false;
    lines[idx] = line.replace(re, (_full, spread) => `{ ${spread.trim()}, ${name} }`);
    return true;
}

const FIXERS = { removeUnusedImport, applySuggestion, reorderSpreadOverwrite };

function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// One repair iteration
// ---------------------------------------------------------------------------

// Apply every authorized, in-scope fixer for the current diagnostics. Returns the set of files it
// wrote and the pre-edit snapshot of each so the caller can roll the whole iteration back.
function applyFixers(diagnostics, cfg, prefixes, cwd) {
    const byFile = new Map();
    for (const d of diagnostics) {
        const fixerSpec = cfg.fixers.find((f) => f.code === d.code);
        if (!fixerSpec) continue; // no authorized fixer for this root cause
        if (!inScope(d.file, prefixes)) continue; // outside the mission's authorized paths
        if (!byFile.has(d.file)) byFile.set(d.file, []);
        byFile.get(d.file).push({ ...d, fixer: fixerSpec.fixer });
    }

    const snapshot = new Map();
    const modified = new Set();

    for (const [file, diags] of byFile) {
        const abs = path.isAbsolute(file) ? file : path.join(cwd, file);
        let original;
        try { original = fs.readFileSync(abs, "utf8"); } catch { continue; }
        const lines = original.split("\n");
        // Apply bottom-up so line removals never shift not-yet-processed diagnostics.
        diags.sort((a, b) => b.line - a.line || b.col - a.col);
        let changed = false;
        for (const d of diags) {
            const fn = FIXERS[d.fixer];
            if (fn && fn(d, lines)) changed = true;
        }
        if (changed) {
            snapshot.set(abs, original);
            fs.writeFileSync(abs, lines.join("\n"));
            modified.add(file);
        }
    }
    return { snapshot, modified };
}

function restore(snapshot) {
    for (const [abs, content] of snapshot) fs.writeFileSync(abs, content);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the bounded self-repair loop.
 * @param {object} opts
 * @param {string[]} opts.authorizedPaths  Mission scope; fixers never write outside it.
 * @param {string}   [opts.cwd]            Project root (defaults to repo root).
 * @param {string}   [opts.configPath]     Override the allow-list config.
 * @param {boolean}  [opts.runBuild]       Confirm the real build once TS is green (default true).
 * @param {string}   [opts.mission]        Mission id (for evidence + provider authorization).
 * @returns {{build:boolean,typescript:boolean,improved:boolean,providerAuthorized:boolean,
 *            iterations:number,rootCauses:string[],modifiedFiles:string[],
 *            initialErrors:number,finalErrors:number}}
 */
function recover(opts = {}) {
    const cwd = opts.cwd || ROOT;
    const cfg = loadConfig(opts.configPath);
    // Command overrides (used by the test harness, which runs against a temp project outside the
    // repo where `npx tsc` cannot resolve). Production leaves them undefined and uses the config.
    if (Array.isArray(opts.typecheckCommand)) cfg.typecheckCommand = opts.typecheckCommand;
    if (Array.isArray(opts.buildCommand)) cfg.buildCommand = opts.buildCommand;
    const prefixes = scopePrefixes(opts.authorizedPaths);
    const wantBuild = opts.runBuild !== false;

    const rootCauses = new Set();
    const modifiedFiles = new Set();

    let diagnostics = collectErrors(cfg, cwd);
    const initialErrors = diagnostics.length;
    let prevCount = diagnostics.length;
    let iterations = 0;
    let improved = false;

    // Loop while errors remain AND we keep strictly reducing them (contract step 6).
    while (diagnostics.length > 0 && iterations < cfg.maxIterations) {
        for (const d of diagnostics) rootCauses.add(rootCauseFor(d.code, cfg.fixers));

        const { snapshot, modified } = applyFixers(diagnostics, cfg, prefixes, cwd);
        if (modified.size === 0) break; // nothing authorized/in-scope to try → no improvement

        iterations += 1;
        const after = collectErrors(cfg, cwd);

        if (after.length < prevCount) {
            improved = true;
            for (const f of modified) modifiedFiles.add(f);
            prevCount = after.length;
            diagnostics = after;
            continue;
        }

        // No strict improvement → revert this iteration and stop (contract step 7, second branch).
        restore(snapshot);
        break;
    }

    const finalDiagnostics = diagnostics.length === 0 ? [] : collectErrors(cfg, cwd);
    const typescript = finalDiagnostics.length === 0;
    const build = typescript ? (wantBuild ? runBuild(cfg, cwd) : true) : false;
    const providerAuthorized = !(build && typescript);

    // Root cause reflects what actually remained relevant: on success, what we fixed; on escalation,
    // what is still blocking.
    const finalRootCauses = typescript
        ? [...rootCauses]
        : [...new Set(finalDiagnostics.map((d) => rootCauseFor(d.code, cfg.fixers)))];

    return {
        build,
        typescript,
        improved,
        providerAuthorized,
        iterations,
        rootCauses: finalRootCauses.length ? finalRootCauses : [...rootCauses],
        modifiedFiles: [...modifiedFiles],
        initialErrors,
        finalErrors: finalDiagnostics.length,
    };
}

// ---------------------------------------------------------------------------
// Evidence + Provider authorization
// ---------------------------------------------------------------------------

function writeReport(mission, result, stamp) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(
        REPORT_PATH,
        JSON.stringify({ mission: mission || null, generatedAt: stamp, ...result }, null, 2)
    );
}

// The ODG-owned decision (runtime-mode.json: providerActivation="MANUAL_ONLY"): the Provider is
// authorized ONLY when local recovery is provably exhausted. Writing this artifact is the single
// place the engine escalates; when recovery succeeds it removes any stale authorization so the
// Provider is never invoked on a green gate.
function writeProviderAuthorization(mission, result, stamp) {
    if (result.providerAuthorized) {
        fs.mkdirSync(path.dirname(PROVIDER_AUTH_PATH), { recursive: true });
        fs.writeFileSync(
            PROVIDER_AUTH_PATH,
            JSON.stringify(
                {
                    mission: mission || null,
                    authorized: true,
                    reason: "BUILD_GATE_AUTONOMY: local recovery demonstrated no further improvement.",
                    build: result.build,
                    typescript: result.typescript,
                    remainingErrors: result.finalErrors,
                    rootCauses: result.rootCauses,
                    authorizedAt: stamp,
                },
                null,
                2
            )
        );
    } else {
        try { fs.unlinkSync(PROVIDER_AUTH_PATH); } catch { /* none to clear */ }
    }
}

// The one and only permitted final output (task contract: "afficher uniquement ...").
function printSummary(result, validation) {
    const rc = result.rootCauses.length ? result.rootCauses.join(", ") : "(none)";
    const files = result.modifiedFiles.length ? result.modifiedFiles.join(", ") : "(none)";
    console.log("======================================");
    console.log("BUILD_GATE_AUTONOMY");
    console.log("======================================");
    console.log("Root Cause      :", rc);
    console.log("Fichier(s)      :", files);
    console.log("Itérations Build:", result.iterations);
    console.log("Build           :", result.build);
    console.log("TypeScript      :", result.typescript);
    console.log("Validation      :", validation.validated ? "PASSED" : "BLOCKED");
    console.log("Mission promue  :", validation.promoted === true);
    console.log("======================================");
    if (result.providerAuthorized) {
        console.log("Provider        : AUTHORIZED (no local improvement demonstrated)");
    }
}

module.exports = {
    recover,
    writeReport,
    writeProviderAuthorization,
    printSummary,
    REPORT_PATH,
    PROVIDER_AUTH_PATH,
    // exported for tests
    _internal: { collectErrors, applyFixers, FIXERS, loadConfig, scopePrefixes, inScope },
};

// ---------------------------------------------------------------------------
// CLI: `node runtime/core/build-recovery-engine.js [MISSION] [--paths a,b]`
// Runs recovery stand-alone and prints the focused summary. Exits 0 when the gate is green,
// 1 when the Provider had to be authorized.
// ---------------------------------------------------------------------------

if (require.main === module) {
    const argv = process.argv.slice(2);
    const mission = argv.find((a) => !a.startsWith("--")) || null;
    const pathsArg = argv.find((a) => a.startsWith("--paths="));
    const authorizedPaths = pathsArg
        ? pathsArg.slice("--paths=".length).split(",").map((s) => s.trim()).filter(Boolean)
        : ["src/", "runtime/"];

    const result = recover({ authorizedPaths, mission });
    const stamp = new Date().toISOString();
    writeReport(mission, result, stamp);
    writeProviderAuthorization(mission, result, stamp);
    printSummary(result, { validated: result.build && result.typescript, promoted: result.build && result.typescript });
    process.exit(result.build && result.typescript ? 0 : 1);
}
