// Identity reference INJECTION helper (local, €0). Given a shot's characters + available reference images, adds the
// correct reference-image input field per model (minimax/video-01 => subject_reference [clean character-consistency
// mechanism]; flux-dev => image [img2img, identity-only use is weaker]). It does NOT generate. Honest: a reference
// is a control base — passing it raises consistency but does NOT guarantee the provider keeps the exact face.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const REFDIR = join(here, 'runs', 'pilot', 'refs');
export function availableRefs() {
  const r = {};
  for (const c of ['ASTRID', 'MERYT', 'OLAF', 'SETH-NAKHT', 'TOVE', 'NEFER-KA', 'HELGI', 'IPY', 'VIGGE']) {
    const p = join(REFDIR, c + '.webp'); if (existsSync(p)) r[c] = p;
  }
  return r;
}
// input: the base generation input; primaryChar: the identity to lock; model: target model. Returns input + injection meta.
export function injectIdentity(input, primaryChar, model, refs = availableRefs()) {
  const ref = refs[primaryChar];
  if (!ref) return { input, injected: false, reason: `no reference image for ${primaryChar}` };
  const out = { ...input };
  let field;
  if (/minimax\/video/.test(model)) { out.subject_reference = ref; field = 'subject_reference'; }
  else if (/flux/.test(model)) { out.image = ref; field = 'image'; }
  else return { input, injected: false, reason: `no reference-image field known for ${model}` };
  return { input: out, injected: true, field, refPath: ref, note: 'raises identity consistency; NOT a guarantee the face is preserved' };
}
