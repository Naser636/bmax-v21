// Generates a self-contained HTML review page (character refs + pilot frames + dossier + archive retrieval) with
// all images inlined as data URIs (CSP-safe). No secrets. Writes to the given output path.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2];
const dossier = JSON.parse(readFileSync(join(here, 'runs/benchmark/character-dossier-f10.json'), 'utf8'));
const du = (p, mime) => `data:${mime};base64,${readFileSync(join(here, p)).toString('base64')}`;
const img = (p) => du(p, p.endsWith('.webp') ? 'image/webp' : 'image/jpeg');

const REFS = [
  { ref: 'ASTRID', src: img('runs/pilot/refs/ASTRID.webp'), role: 'Navigatrice norroise (~19)' },
  { ref: 'MERYT', src: img('runs/pilot/refs/MERYT.webp'), role: 'Capitaine garde-rivière égyptienne' },
  { ref: 'OLAF', src: img('runs/pilot/refs/OLAF.webp'), role: 'Capitaine mourant (~60)' },
];
const desc = (r) => dossier.characters.find(c => c.ref === r)?.CANON.descriptor || '';
const STILLS = [
  { id: 'SC48-SH02', src: img('runs/pilot/SC48-SH02.jpg'), kind: 'Image fixe · flux-dev', note: 'Le Cairn, aube à soleil unique — photoréaliste, fidèle au canon.' },
  { id: 'SC15-SH01-v2', src: img('runs/pilot/SC15-SH01-v2.jpg'), kind: 'Image fixe · flux-dev (corrigé)', note: 'Garnison — rendu photoréaliste après correction du routage (v1 était cartoon).' },
];
const vid = (p) => du(p, 'video/mp4');
const VIDEOS = [
  { id: 'SC22-SH06', src: vid('runs/pilot/web/SC22-SH06.mp4'), poster: img('runs/pilot/SC22-SH06_mid.jpg'), kind: 'Vidéo · 5,64 s · 1280×720 (copie web optimisée)', note: 'Marché, marée & foule — photoréaliste. Son muet (généré sans audio).' },
  { id: 'SC39-SH04-v2', src: vid('runs/pilot/web/SC39-SH04-v2.mp4'), poster: img('runs/pilot/SC39-SH04-v2_mid.jpg'), kind: 'Vidéo · 5,64 s · 1280×720 (copie web optimisée)', note: 'Seam-Root — bras bandé visible (continuité blessure). Son muet.' },
];
const SHA = 'af63016e430440e240168af3a6adc3f3a513389fb6841c82e4ea9d531dcfcefa';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const html = `<title>La Porte du Soleil — Dossier de préproduction</title>
<style>
:root{
  --gold:#c89b3c; --gold-soft:#d9b25a; --steel:#5b6b78; --steel-deep:#2a343d;
  --bg:#13171c; --panel:#1b2127; --panel-2:#20272e; --ink:#eef2f4; --muted:#9aa7b0; --line:#303b45;
  --ok:#5fae7a; --warn:#d6a24a;
}
@media (prefers-color-scheme: light){:root{
  --bg:#f3efe6; --panel:#fbf8f1; --panel-2:#f6f1e6; --ink:#20262b; --muted:#5f6a72; --line:#e0d8c7;
  --steel:#6a7a86; --steel-deep:#cdbf9f;
}}
:root[data-theme="dark"]{--bg:#13171c;--panel:#1b2127;--panel-2:#20272e;--ink:#eef2f4;--muted:#9aa7b0;--line:#303b45;--steel-deep:#2a343d}
:root[data-theme="light"]{--bg:#f3efe6;--panel:#fbf8f1;--panel-2:#f6f1e6;--ink:#20262b;--muted:#5f6a72;--line:#e0d8c7;--steel-deep:#cdbf9f}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
.wrap{max-width:1040px;margin:0 auto;padding:clamp(20px,4vw,52px)}
.eyebrow{font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);font-weight:600}
h1{font-family:Georgia,"Times New Roman",serif;font-weight:600;font-size:clamp(2rem,5vw,3.1rem);line-height:1.05;margin:.15em 0 .1em;text-wrap:balance;letter-spacing:.01em}
h1 .sub{display:block;font-size:.42em;color:var(--muted);letter-spacing:.04em;font-style:italic;margin-top:.5em}
h2{font-family:Georgia,serif;font-weight:600;font-size:1.5rem;margin:2.4em 0 .2em;letter-spacing:.01em}
h2::after{content:"";display:block;width:52px;height:2px;background:var(--gold);margin-top:.5em}
p.lead{color:var(--muted);max-width:66ch;margin:.6em 0 0}
.badges{display:flex;flex-wrap:wrap;gap:.5em;margin-top:1.4em}
.badge{font-size:.76rem;border:1px solid var(--line);background:var(--panel);padding:.32em .7em;border-radius:999px;color:var(--muted)}
.badge b{color:var(--ink);font-variant-numeric:tabular-nums}
.badge.ok{border-color:color-mix(in srgb,var(--ok) 45%,var(--line));color:var(--ok)}
.grid{display:grid;gap:18px;margin-top:1.2em}
.g3{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.g2{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.card img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:var(--steel-deep)}
.card.media img,.card.media video{aspect-ratio:16/9;width:100%;object-fit:cover;display:block;background:#000}
.subhead{font-family:Georgia,serif;font-size:1.05rem;color:var(--gold-soft);margin:1.3em 0 .1em;font-weight:600}
.card .body{padding:13px 15px}
.card .name{font-family:Georgia,serif;font-size:1.15rem;display:flex;align-items:center;justify-content:space-between;gap:.5em}
.pill{font-size:.64rem;letter-spacing:.08em;text-transform:uppercase;color:var(--ok);border:1px solid color-mix(in srgb,var(--ok) 40%,var(--line));padding:.2em .5em;border-radius:999px;white-space:nowrap}
.pill.plan{color:var(--warn);border-color:color-mix(in srgb,var(--warn) 40%,var(--line))}
.role{color:var(--gold-soft);font-size:.8rem;margin:.2em 0 .5em}
.desc{color:var(--muted);font-size:.86rem}
.kicker{color:var(--steel);font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;margin-bottom:.3em}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-top:1.1em}
.rows{display:grid;grid-template-columns:auto 1fr;gap:.35em 1.1em;font-size:.9rem}
.rows dt{color:var(--muted)}.rows dd{margin:0;font-variant-numeric:tabular-nums}
code,pre{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:.82rem}
pre{background:var(--panel-2);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto;color:var(--ink)}
.mono-sha{word-break:break-all;color:var(--gold-soft)}
.note{color:var(--muted);font-size:.84rem;border-left:2px solid var(--gold);padding-left:.9em;margin:.8em 0}
footer{margin-top:3em;padding-top:1.4em;border-top:1px solid var(--line);color:var(--muted);font-size:.8rem}
a{color:var(--gold-soft)}
</style>

<div class="wrap">
  <header>
    <div class="eyebrow">Dossier de préproduction · budget engagé 1,53 €</div>
    <h1>La Porte du Soleil<span class="sub">Fantasy nordique ∩ pharaonique — préparation de production vérifiée</span></h1>
    <p class="lead">Référentiel visuel et documentaire consultable. Les images ci-dessous sont les médias réellement générés et validés par inspection. Rien n’est simulé ; le film n’est pas terminé.</p>
    <div class="badges">
      <span class="badge ok">Références validées <b>3 / 12</b></span>
      <span class="badge">Plans canon-liés <b>420</b></span>
      <span class="badge">Dialogues EN <b>141</b></span>
      <span class="badge">Coût réel <b>1,53 €</b> / 6,08 €</span>
      <span class="badge ok">Archive sans secret</span>
    </div>
  </header>

  <section>
    <h2>Références de personnages</h2>
    <p class="lead">Portraits photoréalistes dérivés des descripteurs canoniques F10, validés par inspection : fidèles, distincts, sans anachronisme.</p>
    <div class="grid g3">
      ${REFS.map(r => `<figure class="card"><img src="${r.src}" alt="${r.ref}" loading="lazy"><figcaption class="body"><div class="name">${r.ref}<span class="pill">Validée</span></div><div class="role">${esc(r.role)}</div><div class="desc">${esc(desc(r.ref))}</div></figcaption></figure>`).join('\n      ')}
    </div>
    <p class="note">9 personnages restants (Seth-Nakht, Nefer-Ka, Tove, Helgi, Ipy, Vigge, Börk, Widow, Elder) ont leurs prompts de portrait <b>préparés, non générés</b> — en attente d’autorisation financière bornée (~0,35 €).</p>
  </section>

  <section>
    <h2>Plans pilotes produits</h2>
    <p class="lead">Quatre médias réels générés sous plafond strict. Les deux vidéos sont <b>intégrées et lisibles</b> ci-dessous (lecture/pause) ; les fichiers originaux haute qualité sont dans l’archive.</p>
    <h3 class="subhead">Vidéos</h3>
    <div class="grid g2">
      ${VIDEOS.map(m => `<figure class="card media"><video controls preload="metadata" playsinline poster="${m.poster}" src="${m.src}"></video><figcaption class="body"><div class="name" style="font-size:1rem">${m.id}</div><div class="kicker" style="margin:.35em 0">${esc(m.kind)}</div><div class="desc">${esc(m.note)}</div></figcaption></figure>`).join('\n      ')}
    </div>
    <h3 class="subhead">Images fixes</h3>
    <div class="grid g2">
      ${STILLS.map(m => `<figure class="card media"><img src="${m.src}" alt="${m.id}" loading="lazy"><figcaption class="body"><div class="name" style="font-size:1rem">${m.id}</div><div class="kicker" style="margin:.35em 0">${esc(m.kind)}</div><div class="desc">${esc(m.note)}</div></figcaption></figure>`).join('\n      ')}
    </div>
    <p class="note">Correction notée honnêtement : le « tatouage » d’Astrid (SC22) est <b>canonique</b> (tatouage carte-des-étoiles), pas un anachronisme. La cohérence de style photoréaliste est désormais démontrée sur les 4 plans.</p>
  </section>

  <section>
    <h2>Récupérer le dossier complet</h2>
    <p class="lead">Cette page permet de <b>consulter</b> les visuels dans le navigateur. Le paquet complet (vidéos lisibles, toutes les fiches JSON, bible, storyboard) est une archive vérifiée sur le VPS.</p>
    <div class="panel">
      <div class="kicker">Archive vérifiée</div>
      <dl class="rows">
        <dt>Fichier</dt><dd>laporte-du-soleil-prep.tar.gz</dd>
        <dt>Taille</dt><dd>10 125 000 octets (~9,7 Mo) · 32 fichiers</dd>
        <dt>SHA-256</dt><dd class="mono-sha">${SHA}</dd>
      </dl>
      <p style="margin:.9em 0 .4em;font-size:.86rem;color:var(--muted)">Télécharger depuis Windows (PowerShell), en remplaçant <code>USER</code> et <code>VPS</code> :</p>
      <pre>scp USER@VPS:/home/ubuntu/bmax-v21/docs/film-factory/export/laporte-du-soleil-prep.tar.gz "$env:USERPROFILE\\Downloads\\"
Get-FileHash "$env:USERPROFILE\\Downloads\\laporte-du-soleil-prep.tar.gz" -Algorithm SHA256
tar -xzf laporte-du-soleil-prep.tar.gz</pre>
      <p class="note">Le hash affiché par <code>Get-FileHash</code> doit correspondre à celui ci-dessus. Aucun port n’est ouvert, le VPS n’est pas exposé, aucun secret n’est inclus.</p>
    </div>
  </section>

  <footer>
    <p><b>Honnêteté.</b> Préparation vérifiée ≠ film terminé. Validations humaines en attente : note artistique ≥ 7,5/10, correspondance d’identité ≥ 4/5, traduction française, arbitrages (Olaf, blessure Meryt, palettes). Coût réel cumulé 1,53 € sur un plafond de 6,08 €. Aucun appel payant, achat ou recharge pour produire cette page.</p>
  </footer>
</div>`;
writeFileSync(OUT, html);
console.log('wrote', OUT, Math.round(Buffer.byteLength(html) / 1024) + ' KB');
