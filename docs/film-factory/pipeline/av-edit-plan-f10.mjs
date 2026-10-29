// Detailed AUDIOVISUAL EDIT PLAN for F10 — per-scene editorial/sound spec: picture cut, FR voice + sync, ambience,
// music, SFX, transitions, continuity. A PLAN only (OSS tools, $0). Every step that needs real media is marked
// NEEDS_REAL_MEDIA; nothing is declared edited/mixed/validated. Built from existing registers. READ-ONLY, €0.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildRealization } from './realization-plan-f10.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const SL = read('shot-list-f10.json'); const vb = read('fr-voice-bible-f10.json');
const real = buildRealization();
const speakers = Object.fromEntries(vb.voices.map(v => [v.character, v]));
const scenes = [...new Set(SL.shots.map(s => s.scene))];

const plan = scenes.map(scId => {
  const ss = SL.shots.filter(s => s.scene === scId);
  const rr = real.shots.filter(s => s.scene === scId);
  const head = ss[0].sceneHead;
  const dlg = ss.filter(s => s.mediaCategory === 'AUDIO_LINE');
  const music = ss.filter(s => s.mediaCategory === 'MUSIC_CUE').length;
  const videoShots = ss.filter(s => s.mediaCategory === 'PREMIUM_VIDEO').length;
  const stillShots = ss.filter(s => s.mediaCategory === 'STILL_ANIMATABLE').length;
  const silent = dlg.length === 0;
  const vocalChars = [...new Set(dlg.map(s => (s.subjectAction.split(' — ')[0]).trim()))];
  return {
    scene: scId, head,
    pictureCut: { tool: 'DaVinci Resolve (free)', shots: ss.length, video: videoShots, stills: stillShots, order: ss.map(s => s.id), status: 'PLANNED', note: 'assemble in shot order; still shots animated (Ken-Burns/parallax); NEEDS_REAL_MEDIA to cut' },
    voice: silent ? { status: 'N/A', note: 'silent scene' } : { tool: 'FR TTS (voice bible) + Audacity cleanup', lines: dlg.length, characters: vocalChars, directions: vocalChars.map(c => speakers[c] ? `${c}: ${speakers[c].pitchTexture}; ${speakers[c].pace}` : `${c}: (voice bible)`), sync: 'lip-sync to picture', status: 'NEEDS_REAL_MEDIA', note: 'FR delivery + lip-sync verified only on real audio+picture' },
    ambience: { design: silent ? 'room-tone/elemental bed carries the silence' : 'location ambience bed under dialogue', status: 'PLANNED' },
    music: { cues: music, intent: music ? 'scored cue (overlay) — must support, not mask' : 'none/scored sparingly', status: music ? 'PLANNED' : 'N/A', caution: 'music does NOT replace action/performance' },
    sfx: { intent: 'diegetic FX (tide TONE, water, armour, blade) tied to on-screen events', status: 'PLANNED', caution: 'generic sound must not mask a visual weakness' },
    transitions: { inPoint: scId === scenes[0] ? 'cold open' : 'cut/dissolve per picture', status: 'PLANNED' },
    continuity: { carry: 'identity/costume/wounds/props/light/eyelines per continuity-ledger + bible', status: 'NEEDS_REAL_MEDIA', note: 'continuity confirmed only on real frames' },
    silenceIntentional: silent,
  };
});

const out = {
  generated: 'F10 AV edit plan (PREP; plan only, NOT an edit)', reference: '37_SCREENPLAY_60MIN_F10.md',
  budgetAuthorizedThisMission: 0, scenes: plan.length, tools: 'DaVinci Resolve (free) + Audacity + ffmpeg — all $0 OSS',
  mediaDependentStatuses: { picture: 'NEEDS_REAL_MEDIA', voiceSync: 'NEEDS_REAL_MEDIA', continuity: 'NEEDS_REAL_MEDIA', mixAndExport: 'BLOCKED (needs real media + ffmpeg/gate 12)' },
  note: 'No edit performed; no mix; no export. All media-dependent steps remain NEEDS_REAL_MEDIA/BLOCKED. Music/SFX never substitute for required motion or performance.',
  plan,
};
writeFileSync(join(here, 'av-edit-plan-f10.json'), JSON.stringify(out, null, 1));
console.log(`av-edit-plan-f10: ${plan.length} scenes | voice-sync + picture + continuity = NEEDS_REAL_MEDIA; mix/export = BLOCKED; tools OSS $0`);
