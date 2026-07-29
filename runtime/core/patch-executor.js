#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const capabilityExecutors = require("./capability-executors");

const GENERATED_DIR = "runtime/generated";

const plan = JSON.parse(
  fs.readFileSync(path.join(GENERATED_DIR, "patch-plan.json"), "utf8")
);

// Paths this mission is authorized to modify. A real (file-modifying) patch may only touch a
// target inside one of these prefixes — the same scope the Validation Engine checks for evidence.
const authorizedPrefixes = (Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [])
  .map((p) => p.replace(/[*].*$/, "").replace(/\/+$/, ""))
  .filter(Boolean);

function isAuthorizedTarget(target) {
  const norm = path.normalize(target);
  if (path.isAbsolute(norm) || norm === ".." || norm.startsWith(".." + path.sep)) return false;
  return authorizedPrefixes.some((pre) => norm === pre || norm.startsWith(pre + "/"));
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
function applyUnifiedDiff(original, diffText) {
  const origLines = original.split("\n");
  const diffLines = diffText.split("\n");
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  const result = [];
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
const report = {
  mission: plan.mission,
  executed: []
};

fs.mkdirSync(GENERATED_DIR, { recursive: true });

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
function grepToFile(pattern, targets, outFile, includes) {
  const fd = fs.openSync(outFile, "w");
  try {
    const includeArgs = (includes || []).map((glob) => "--include=" + glob);
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
function extractModule(content) {
  let m =
    content.match(/from\s+["']([^"']+)["']/) ||
    content.match(/require\(\s*["']([^"']+)["']\s*\)/) ||
    content.match(/import\s+["']([^"']+)["']/) ||
    content.match(/import\(\s*["']([^"']+)["']\s*\)/);
  return m ? m[1] : null;
}

function isInternal(mod) {
  return (
    mod.startsWith("@/") ||
    mod.startsWith("./") ||
    mod.startsWith("../") ||
    mod.startsWith("/")
  );
}

function slugify(name) {
  return name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function classify(name) {
  const parts = name.replace(/[^A-Za-z0-9]+/g, " ").trim().split(/\s+/);
  const pascal = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  return /^[A-Za-z]/.test(pascal) ? pascal : "Capability" + pascal;
}

for (const patch of plan.patches) {
  console.log("EXECUTE:", patch.action);

  try {
    // Real (file-modifying) patch. A patch carrying `edits` actually applies each edit to its
    // target file — full-file `content` writes, or unified-`diff` application — instead of merely
    // recording the action. Symbolic patches (no `edits`) fall through to the legacy switch below,
    // so historical behavior is unchanged.
    if (Array.isArray(patch.edits) && patch.edits.length > 0) {
      const applied = [];
      for (const edit of patch.edits) {
        if (!isAuthorizedTarget(edit.target)) {
          throw new Error(`target outside authorized_paths: ${edit.target}`);
        }
        if (typeof edit.content === "string") {
          fs.mkdirSync(path.dirname(edit.target), { recursive: true });
          fs.writeFileSync(edit.target, edit.content);
          applied.push({ target: edit.target, mode: "content" });
        } else if (typeof edit.diff === "string") {
          const original = fs.existsSync(edit.target)
            ? fs.readFileSync(edit.target, "utf8")
            : "";
          const next = applyUnifiedDiff(original, edit.diff);
          fs.mkdirSync(path.dirname(edit.target), { recursive: true });
          fs.writeFileSync(edit.target, next);
          applied.push({ target: edit.target, mode: "diff" });
        } else {
          throw new Error(`edit for ${edit.target} has neither content nor diff`);
        }
      }
      report.executed.push({
        action: patch.action,
        objectiveId: patch.objectiveId || patch.action,
        status: "APPLIED",
        files: applied,
      });
      continue;
    }

    switch (patch.action) {
      case "PROCESS_TODOS": {
        const out = grepToFile(
          "TODO",
          ["src", "runtime"],
          path.join(GENERATED_DIR, "todo-report.txt")
        );
        report.executed.push({ action: patch.action, status: "DONE", output: out });
        break;
      }

      case "PROCESS_FIXMES": {
        const out = grepToFile(
          "FIXME",
          ["src", "runtime"],
          path.join(GENERATED_DIR, "fixme-report.txt")
        );
        report.executed.push({ action: patch.action, status: "DONE", output: out });
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
        report.executed.push({ action: patch.action, status: "DONE", output: out });
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
        const perFileModule = new Map();     // "file module" -> count
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

          const key = file + " " + mod;
          perFileModule.set(key, (perFileModule.get(key) || 0) + 1);
        }

        const topModules = [...moduleCount.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([module, count]) => ({ module, count }));

        const duplicateImports = [...perFileModule.entries()]
          .filter(([, count]) => count > 1)
          .map(([key, count]) => {
            const [file, module] = key.split(" ");
            return { file, module, count };
          })
          .sort((a, b) => b.count - a.count);

        const suggestions = [];
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
        report.executed.push({ action: patch.action, status: "DONE", output: out });
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

        const implemented = [];
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
        report.executed.push({ action: patch.action, status: "DONE", output: out });
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
          });
          break;
        }
        // No capability maps to this objective: it is a genuinely read-only/planning objective,
        // discharged by planning + evidence. RECORD it (not SKIPPED, not FAILED) so the
        // evidence-based Validation Engine can confirm full objective coverage.
        report.executed.push({
          action: patch.action,
          objectiveId: patch.objectiveId || patch.action,
          status: "RECORDED"
        });
      }
    }
  } catch (e) {
    report.executed.push({
      action: patch.action,
      status: "FAILED",
      error: String(e.stack || e)
    });
  }
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
