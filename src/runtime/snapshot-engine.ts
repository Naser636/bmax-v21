import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { RuntimeMetadata } from "./runtime-types";

/**
 * SnapshotEngine — produces a reusable, structured Runtime Snapshot.
 *
 * This is the TypeScript-native producer of the artifact previously generated
 * ad-hoc as `runtime/generated/ODG_SNAPSHOT_V1_*.md`. It reuses the same
 * conventions already established in the Runtime (resilient `execSync` git
 * access — see ProjectContext — and `fs` directory inventories) and returns a
 * plain structured object so any caller (facade, reporter, CLI) can consume it.
 *
 * Single responsibility: capture the current state of the repository as a
 * Runtime Snapshot. It never mutates the tree.
 */

export const SNAPSHOT_ENGINE_VERSION = "SNAPSHOT_ENGINE_V1";

export interface GitSnapshot {
  /** Current branch name, or "" when unavailable. */
  branch: string;
  /** Short HEAD commit hash, or "" when unavailable. */
  commit: string;
  /** Porcelain working-tree status lines (empty when clean/unavailable). */
  status: string[];
}

export interface TodoEntry {
  file: string;
  line: number;
  text: string;
}

export interface RuntimeSnapshot extends RuntimeMetadata {
  git: GitSnapshot;
  /** Runtime source inventory (e.g. src/runtime/*.ts). */
  runtime: string[];
  /** Provider source inventory (e.g. src/providers/*.ts). */
  providers: string[];
  /** Mission contract inventory (e.g. runtime/missions/*.json). */
  missions: string[];
  /** Most recent commits, oldest-last, in `<short> <subject>` form. */
  recentCommits: string[];
  /** TODO/FIXME markers discovered across the scanned paths. */
  todos: TodoEntry[];
}

export interface SnapshotEngineOptions {
  /** Repository root the snapshot is captured against. Defaults to process.cwd(). */
  cwd?: string;
  /** Directory scanned for the runtime inventory. */
  runtimeDir?: string;
  /** Directory scanned for the provider inventory. */
  providersDir?: string;
  /** Directory scanned for the mission inventory. */
  missionsDir?: string;
  /** Number of recent commits to capture. */
  commitLimit?: number;
  /** Paths scanned for TODO/FIXME markers. */
  todoScanPaths?: string[];
}

export class SnapshotEngine {

  private readonly cwd: string;
  private readonly runtimeDir: string;
  private readonly providersDir: string;
  private readonly missionsDir: string;
  private readonly commitLimit: number;
  private readonly todoScanPaths: string[];

  constructor(options: SnapshotEngineOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.runtimeDir = options.runtimeDir ?? "src/runtime";
    this.providersDir = options.providersDir ?? "src/providers";
    this.missionsDir = options.missionsDir ?? "runtime/missions";
    this.commitLimit = options.commitLimit ?? 10;
    this.todoScanPaths = options.todoScanPaths ?? ["src", "runtime/missions"];
  }

  /** Capture the current repository state as a structured Runtime Snapshot. */
  capture(): RuntimeSnapshot {
    return {
      version: SNAPSHOT_ENGINE_VERSION,
      generatedAt: new Date().toISOString(),
      git: this.captureGit(),
      runtime: this.inventory(this.runtimeDir, ".ts"),
      providers: this.inventory(this.providersDir, ".ts"),
      missions: this.inventory(this.missionsDir, ".json"),
      recentCommits: this.captureCommits(),
      todos: this.captureTodos(),
    };
  }

  private captureGit(): GitSnapshot {
    return {
      branch: this.git("git branch --show-current"),
      commit: this.git("git rev-parse --short HEAD"),
      status: this.gitLines("git status --porcelain"),
    };
  }

  private captureCommits(): string[] {
    const limit = Math.max(1, this.commitLimit);
    return this.gitLines(`git log --oneline -n ${limit}`);
  }

  /**
   * List files directly under `dir` (relative to cwd) matching `ext`, returned
   * as repo-relative POSIX paths, sorted. Missing directories yield [].
   */
  private inventory(dir: string, ext: string): string[] {
    const abs = path.resolve(this.cwd, dir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter(e => e.isFile() && e.name.endsWith(ext))
      .map(e => `${dir}/${e.name}`)
      .sort();
  }

  private captureTodos(): TodoEntry[] {
    const existing = this.todoScanPaths.filter(p =>
      fs.existsSync(path.resolve(this.cwd, p))
    );
    if (existing.length === 0) return [];

    // grep is resilient: `|| true` keeps a no-match (exit 1) from throwing.
    const raw = this.exec(
      `grep -RIn --exclude-dir=backup "TODO\\|FIXME" ${existing.join(" ")} || true`
    );

    return raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => this.parseGrepLine(line))
      .filter((e): e is TodoEntry => e !== null);
  }

  private parseGrepLine(line: string): TodoEntry | null {
    // Format: <file>:<line>:<text>
    const match = /^(.+?):(\d+):(.*)$/.exec(line);
    if (!match) return null;
    return {
      file: match[1],
      line: Number(match[2]),
      text: match[3].trim(),
    };
  }

  /** Run a git command, returning trimmed stdout or "" on any failure. */
  private git(command: string): string {
    return this.exec(command).trim();
  }

  /** Run a git command, returning non-empty trimmed lines, or [] on failure. */
  private gitLines(command: string): string[] {
    return this.exec(command)
      .split(/\r?\n/)
      .map(l => l.trimEnd())
      .filter(l => l.length > 0);
  }

  private exec(command: string): string {
    try {
      return execSync(command, {
        cwd: this.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return "";
    }
  }

  /**
   * Render a snapshot as Markdown, matching the layout of the ODG_SNAPSHOT_V1
   * artifact so existing tooling/readers stay compatible.
   */
  render(snapshot: RuntimeSnapshot): string {
    const section = (title: string, lines: string[]): string =>
      `## ${title}\n${lines.length ? lines.join("\n") : "(none)"}`;

    const todoLines = snapshot.todos.map(t => `${t.file}:${t.line}:${t.text}`);

    return [
      "# ODG Snapshot",
      "",
      section("Git", [
        snapshot.git.branch,
        snapshot.git.commit,
        ...snapshot.git.status,
      ].filter(Boolean)),
      "",
      section("Runtime", snapshot.runtime),
      "",
      section("Providers", snapshot.providers),
      "",
      section("Missions", snapshot.missions),
      "",
      section("Last commits", snapshot.recentCommits),
      "",
      section("TODO/FIXME", todoLines),
      "",
    ].join("\n");
  }
}
