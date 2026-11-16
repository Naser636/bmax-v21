#!/usr/bin/env node
"use strict";
/* V213 §5/E — radar video sources. Proves: the 2 owner-designated videos recorded with exact URLs; content NOT_ANALYZED
 * (no fabrication); owner transcript ⇒ ANALYSIS_ELIGIBLE; not a second radar. */
const V = require("./odg-radar-video-sources.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

function main() {
  const r = V.register();
  check("the 2 owner-designated videos recorded with exact canonical URLs", r.count === 2 && r.videos.some((x: any) => x.id === "UeHmxZMdw2g" && /UeHmxZMdw2g/.test(x.url)) && r.videos.some((x: any) => x.id === "2uyhavEACdo" && /2uyhavEACdo/.test(x.url)));
  check("content NOT_ANALYZED by default (no video/transcript access)", r.videos.every((x: any) => x.analysis === "NOT_ANALYZED" && x.transcriptSupplied === false) && r.defaultStatus.status === "NOT_ANALYZED");
  // V226: real licit metadata from the official YouTube oEmbed API — IDENTITY only, content still NOT_ANALYZED, title ≠ content.
  check("metadata identified via official oEmbed (title/author), content still NOT_ANALYZED (identity ≠ content)", r.videos.every((x: any) => x.metadataIdentified === true && x.metadata && typeof x.metadata.title === "string" && x.metadata.source === "YouTube oEmbed API" && x.analysis === "NOT_ANALYZED") && r.videos.find((x: any) => x.id === "UeHmxZMdw2g").metadata.author === "NOCT SENSEI" && r.videos.find((x: any) => x.id === "2uyhavEACdo").metadata.author === "Mark Tilbury");
  check("title-only relevance is honestly labelled LOW (consumer content, not a technical talk) — never a content assessment", r.videos.every((x: any) => /LOW/.test(x.titleRelevanceToOdgEngineering) && /title-only/.test(x.titleRelevanceToOdgEngineering)) && /title is identity, not content/i.test(r.note) && /ToS-gated captions/.test(r.note));
  check("honesty: titles/arguments NEVER invented; no summary without a real transcript", /NEVER invented/.test(r.defaultStatus.rule) && /not produced/i.test(r.defaultStatus.rule));
  check("recovered from directive continuity (not a repo file); designation = owner-designated V12.4 §6.5", r.videos.every((x: any) => /owner-designated \(V12\.4 master directive §6\.5/.test(x.designation)) && /not a repo file/.test(V.RADAR_VIDEO_SOURCES_CONTRACT.invariants[0]));

  // owner-supplied transcript ⇒ ANALYSIS_ELIGIBLE (still not fabricated)
  const withT = V.register({ transcripts: { UeHmxZMdw2g: "a real transcript text supplied by the owner" } });
  check("owner transcript ⇒ that video becomes ANALYSIS_ELIGIBLE; the other stays NOT_ANALYZED", withT.videos.find((x: any) => x.id === "UeHmxZMdw2g").analysis.startsWith("ANALYSIS_ELIGIBLE") && withT.videos.find((x: any) => x.id === "2uyhavEACdo").analysis === "NOT_ANALYZED");

  check("contract: recorded, NOT_ANALYZED/no-fabrication, transcript-gated, not a 2nd radar", V.RADAR_VIDEO_SOURCES_CONTRACT.invariants.some((i: string) => /NEVER invented/.test(i)) && V.RADAR_VIDEO_SOURCES_CONTRACT.invariants.some((i: string) => /NOT a second radar/.test(i)));
  check("deterministic + frozen", JSON.stringify(V.register().videos) === JSON.stringify(r.videos) && Object.isFrozen(r) && Object.isFrozen(V.CANONICAL_VIDEOS));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — radar-video-sources (V213 §5/E: 2 owner-designated videos recorded with exact URLs; content NOT_ANALYZED [no fabrication]; owner-transcript⇒ANALYSIS_ELIGIBLE; not a 2nd radar)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
