// §9 sound-raccord audit (local, €0, read-only). For each of the 48 scene transitions, assesses DOCUMENTED audio
// continuity from the sound plan + dialogue data: ambience change (location), dialogue at the boundary (hard voice
// cut vs J/L-cut opportunity), music-cue presence, and silence beats. It NEVER invents audio and NEVER declares a
// sound raccord validated — real mix/levels/sync require produced media (marked INSUFFICIENT_INFO). Output:
// sound-raccord-audit-f10.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const sl = JSON.parse(readFileSync(join(here, 'shot-list-f10.json'), 'utf8'));
const dlg = JSON.parse(readFileSync(join(here, 'dialogues-f10.json'), 'utf8')).lines;

const order = [...new Set(sl.shots.map(s => s.scene))].sort((a, b) => parseInt(a.slice(2)) - parseInt(b.slice(2)));
const dlgByScene = {}; for (const l of dlg) (dlgByScene[l.scene] ??= []).push(l);
function sceneSound(sc) {
  const shots = sl.shots.filter(s => s.scene === sc);
  const lines = dlgByScene[sc] || [];
  return { sc, setting: shots[0]?.setting || '', hasDialogue: lines.length > 0,
    firstSpeaker: lines[0]?.speaker || null, lastSpeaker: lines.at(-1)?.speaker || null,
    musicCues: shots.filter(s => s.mediaCategory === 'MUSIC_CUE').length,
    dialogueLines: lines.length };
}
const info = Object.fromEntries(order.map(sc => [sc, sceneSound(sc)]));

const transitions = [];
for (let i = 1; i < order.length; i++) {
  const A = info[order[i - 1]], B = info[order[i]];
  const ambienceChange = A.setting !== B.setting;
  const voiceBoundary = A.hasDialogue && B.hasDialogue; // dialogue ends A, starts B
  const silenceBeat = !A.hasDialogue || !B.hasDialogue;
  const music = A.musicCues > 0 || B.musicCues > 0;

  let severity = 'LOW', issue = 'ambience/voice continuity plausible', correction = null;
  if (ambienceChange && voiceBoundary) {
    severity = 'MEDIUM';
    issue = 'location (ambience) changes AT a voice-to-voice boundary — risk of an abrupt audio cut between beds';
    correction = 'crossfade ambience beds across the cut; consider an L-cut (carry A\'s voice/ambience briefly into B) or a J-cut (pre-lap B\'s ambience) — editor call';
  } else if (ambienceChange) {
    severity = 'LOW';
    issue = 'ambience changes with a silence/non-voice boundary — natural place for a bed swap';
    correction = 'swap ambience on the cut; confirm no jarring level jump (needs real mix)';
  } else if (silenceBeat) {
    severity = 'INFO'; issue = 'a wordless/silence beat at the boundary — likely intentional'; correction = 'confirm the silence is intentional (director)';
  }
  transitions.push({ from: A.sc, to: B.sc, ambienceChange, voiceBoundary, silenceBeat, musicPresent: music,
    aLastSpeaker: A.lastSpeaker, bFirstSpeaker: B.firstSpeaker, severity,
    issue, proposedCorrection: correction,
    unverifiable: ['actual mix levels', 'dialogue intelligibility', 'sync', 'LUFS/clipping', 'real ambience content'] });
}
const sev = {}; for (const t of transitions) sev[t.severity] = (sev[t.severity] || 0) + 1;
const out = {
  generated: '2026-10-24', totalTransitions: transitions.length, bySeverity: sev,
  method: 'metadata-based (dialogue presence/speakers, setting/ambience change, music-cue counts). NO real audio exists; mix/levels/sync are INSUFFICIENT_INFO.',
  soundInventory: { dialoguesFR: 141, dialoguesStatus: 'PROPOSED-translation / 0 audio produced', musicCues: sl.shots.filter(s => s.mediaCategory === 'MUSIC_CUE').length, ambiencesByLocation: new Set(sl.shots.map(s => s.setting)).size },
  honesty: 'No audio track exists except the temporary synthesized bed on reel_v2. No sound raccord is validated.',
  transitions,
};
writeFileSync(join(here, 'runs/benchmark/sound-raccord-audit-f10.json'), JSON.stringify(out, null, 1));
console.log(`sound-raccord: ${transitions.length} transitions | severity ${JSON.stringify(sev)}`);
console.log('MEDIUM (ambience change at voice boundary):', transitions.filter(t => t.severity === 'MEDIUM').map(t => `${t.from}->${t.to}`).join(', ') || 'none');
