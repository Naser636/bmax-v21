#!/usr/bin/env tsx
/*
 * MIGRATION SELECTOR (CTO outcome-driven loop) — reproducible, tested ranking of the remaining
 * JavaScript migration candidates, replacing the manual per-turn precheck. NOT a second orchestrator and
 * NOT a new permanent primitive: a pure decision-support function over the real inventory, reusing the
 * authoritative §12 EXCLUSIONS (migration-campaign) — the same role js-inventory/migration-campaign play.
 *
 * Risk-first, deterministic score (LOWER = safer, migrate first), from each candidate's observable risk
 * factors (benefit side: a testable/low-risk file unblocks the next lot fastest and is reversible):
 *   +3 per spawn/exec/fork call   (child-process dispatch — needs spawn-path dual-wiring)
 *   +2 per fs write               (side effect — parity needs snapshot/restore)
 *   +5 if it uses __dirname       (breaks at runtime/dist depth — the odg-cockpit bug class)
 *   +ceil(lines/50)               (porting surface / transcription risk)
 *   -4 if a dedicated *.test.js   (testable parity contract already exists → safer to accept)
 * Excluded entirely: §12-frozen (reserved), already-dual-port (.ts sibling), and non-live (dead/poc).
 * Pure scoring (scoreCandidate) is separable from the FS probe (profile) so it is unit-testable with
 * fixtures and no real child processes. Deterministic ⇒ re-running after a migration naturally RESUMES:
 * the migrated file drops out (it now has a .ts sibling) and the next-safest becomes the recommendation.
 */
import * as fs from "fs";
import * as path from "path";
import { EXCLUSIONS } from "@/runtime/migration-campaign";

const FROZEN = new Set<string>(EXCLUSIONS as readonly string[]);

export type RiskFactors = { lines: number; writes: number; spawns: number; usesDirname: boolean; hasTest: boolean };
export type Candidate = { file: string; base: string; score: number; factors: RiskFactors };

/** PURE deterministic risk score (lower = safer). Separated from FS so it is unit-testable. */
export function scoreCandidate(f: RiskFactors): number {
  return f.spawns * 3 + f.writes * 2 + (f.usesDirname ? 5 : 0) + Math.ceil(f.lines / 50) + (f.hasTest ? -4 : 0);
}

/** Read a candidate file's observable risk factors (FS probe; no execution). */
export function profile(absPath: string): RiskFactors {
  let src = "";
  try { src = fs.readFileSync(absPath, "utf8"); } catch { /* unreadable ⇒ zeros */ }
  const count = (re: RegExp) => (src.match(re) || []).length;
  const base = path.basename(absPath, ".js");
  const dir = path.dirname(absPath);
  return {
    lines: src ? src.split(/\r?\n/).length : 0,
    writes: count(/writeFileSync|mkdirSync|renameSync|unlinkSync/g),
    spawns: count(/spawnSync|execSync|\bexecFile|\bfork\(|\bspawn\(/g),
    usesDirname: /__dirname/.test(src),
    hasTest: fs.existsSync(path.join(dir, base + ".test.js")),
  };
}

/**
 * Rank the LIVE js-only migration candidates (not §12-frozen, no .ts sibling, not dead/poc) under the
 * given dirs, safest-first. Deterministic: ties broken by base name. Returns the full ranking; the
 * caller takes [0] as the recommendation.
 */
export function rankCandidates(repoRoot: string, dirs: string[] = ["runtime/bin", "runtime/core"]): Candidate[] {
  const out: Candidate[] = [];
  for (const d of dirs) {
    let entries: string[] = [];
    try { entries = fs.readdirSync(path.join(repoRoot, d)); } catch { continue; }
    for (const name of entries) {
      if (!name.endsWith(".js") || name.endsWith(".test.js")) continue;
      const base = name.replace(/\.js$/, "");
      if (FROZEN.has(base)) continue;                                   // §12 reserved
      if (fs.existsSync(path.join(repoRoot, d, base + ".ts"))) continue; // already dual-port
      const abs = path.join(repoRoot, d, name);
      const factors = profile(abs);
      out.push({ file: path.join(d, name), base, score: scoreCandidate(factors), factors });
    }
  }
  out.sort((a, b) => (a.score !== b.score ? a.score - b.score : a.base < b.base ? -1 : a.base > b.base ? 1 : 0));
  return out;
}

export function recommendNext(repoRoot: string, dirs?: string[]): Candidate | null {
  const ranked = rankCandidates(repoRoot, dirs);
  return ranked.length ? ranked[0] : null;
}

if (require.main === module) {
  const ranked = rankCandidates(process.cwd());
  const rec = ranked[0] || null;
  process.stdout.write(JSON.stringify({ recommendation: rec, ranked: ranked.slice(0, 10) }, null, 2) + "\n");
}
