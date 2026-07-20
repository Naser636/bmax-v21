#!/usr/bin/env node

/**
 * ODG Runtime Bootstrap
 * =====================
 * Prepares a clean checkout (empty runtime/generated) so the Runtime pipeline
 * can execute, WITHOUT versioning any generated artifact and WITHOUT touching
 * the pipeline, its stages, or their ordering.
 *
 * Scope — this materializes only the single "orphan generated" prerequisite:
 *
 *   runtime/generated/project-context.json
 *     - read by mission-loader.js (stage 2), which embeds it opaquely into
 *       mission-plan.json (plan.project). No stage produces it, so on a clean
 *       clone with an empty runtime/generated it is absent and stage 2 crashes.
 *     - It is DERIVED data (a project inventory + git metadata), never an
 *       authored seed, so it must be regenerated here rather than committed.
 *
 * Everything else is already covered and is intentionally NOT handled here:
 *   - Authored seeds (runtime/constitution, runtime/policies,
 *     runtime/governance/state-machine.json, runtime/brain/MASTER_PLAN.md,
 *     runtime/governance/RUNTIME_ROADMAP.md) are versioned SOURCE and must be
 *     present in the clone — nothing to generate.
 *   - runtime-context.json self-heals at stage 8 (decision-engine ->
 *     runtime-context-loader -> project-context-engine).
 *   - All other runtime/generated/*.json are produced in-run by an earlier
 *     stage before their consumer runs.
 *
 * Idempotent: files are (re)generated ONLY when absent, so a second run is a
 * no-op and existing outputs are preserved. No runtime data is invented — the
 * file list is a real filesystem scan and git metadata is read from git (null
 * when git is unavailable, never a fabricated value).
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const GENERATED_DIR = "runtime/generated";
const PROJECT_CONTEXT = path.join(GENERATED_DIR, "project-context.json");

// Directories excluded from the project inventory. Mirrors the IGNORED set of
// runtime/core/project-context-engine.js so the two scanners stay consistent.
const IGNORED = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  "coverage"
]);

function scanFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (IGNORED.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push("./" + path.relative(root, full).split(path.sep).join("/"));
      }
    }
  }
  out.sort();
  return out;
}

function gitInfo() {
  const read = (args) => {
    const r = spawnSync("git", args, { encoding: "utf8" });
    if (r.error || r.status !== 0) return null;
    return r.stdout.trim() || null;
  };
  return {
    gitCommit: read(["rev-parse", "--short", "HEAD"]),
    branch: read(["rev-parse", "--abbrev-ref", "HEAD"])
  };
}

function bootstrap() {
  const created = [];

  // 1. Ensure the (git-ignored) generated directory exists.
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  // 2. Materialize project-context.json only if absent (idempotent).
  if (!fs.existsSync(PROJECT_CONTEXT)) {
    const { gitCommit, branch } = gitInfo();
    const context = {
      files: scanFiles("."),
      generatedAt: new Date().toISOString(),
      gitCommit,
      branch
    };
    fs.writeFileSync(PROJECT_CONTEXT, JSON.stringify(context, null, 2));
    created.push(PROJECT_CONTEXT);
  }

  return created;
}

module.exports = { bootstrap };

if (require.main === module) {
  const created = bootstrap();
  console.log("======================================");
  console.log("ODG BOOTSTRAP");
  console.log("======================================");
  if (created.length === 0) {
    console.log("Nothing to do — prerequisites already present.");
  } else {
    for (const f of created) console.log("Created :", f);
  }
  console.log("======================================");
}
