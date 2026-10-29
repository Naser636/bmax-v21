#!/usr/bin/env bash
# ODG local audio+montage build (€0, no network/credit). Produces reel_v2 = the 4 real shots with CROSSFADE
# transitions + a SYNTHESIZED TEMP soundtrack (sea/wind ambience + an open-fifth tonal music bed + one low impact).
# This is SCRATCH/TEMP audio (no French dialogue — that needs a TTS/credit) and placeholder music — clearly NOT a
# final scored mix. All sound is synthesized locally (no licensing). Verified afterwards by CIQE + ffprobe.
set -euo pipefail
cd "$(dirname "$0")"
FFMPEG=vendor/node_modules/ffmpeg-static/ffmpeg
B=runs/benchmark; OUT=runs/benchmark/export
N="scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,format=yuv420p"
T=0.6

# Pass A — crossfaded (not hard-cut) video, silent
"$FFMPEG" -hide_banner -y \
 -i "$B/SC01-video.mp4" -i "$B/SC40.mp4" -i "$B/SC22.mp4" -loop 1 -t 4 -i "$B/SC01-still.webp" \
 -filter_complex "[0:v]$N[v0];[1:v]$N[v1];[2:v]$N[v2];[3:v]$N[v3];\
[v0][v1]xfade=transition=fade:duration=$T:offset=5.04[x1];\
[x1][v2]xfade=transition=fade:duration=$T:offset=10.08[x2];\
[x2][v3]xfade=transition=dissolve:duration=$T:offset=15.12[v]" \
 -map "[v]" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 25 "$OUT/_tmp_video.mp4"

# Pass B — synthesized temp soundtrack, loudness-normalized to avoid clipping
DUR=19.12
"$FFMPEG" -hide_banner -y \
 -f lavfi -t $DUR -i "anoisesrc=color=brown:r=48000" \
 -f lavfi -t $DUR -i "sine=frequency=110:r=48000" \
 -f lavfi -t $DUR -i "sine=frequency=164.81:r=48000" \
 -f lavfi -t 1.4 -i "sine=frequency=55:r=48000" \
 -filter_complex "\
[0]lowpass=f=500,volume=0.6,aformat=channel_layouts=stereo[amb];\
[1]volume=0.16[m1];[2]volume=0.10[m2];\
[m1][m2]amix=inputs=2:normalize=0,aecho=0.8:0.9:900:0.3,afade=t=in:d=2,afade=t=out:st=16.6:d=2.4,aformat=channel_layouts=stereo[mus];\
[3]volume=0.5,afade=t=out:d=1.4,adelay=10200|10200,aformat=channel_layouts=stereo[sfx];\
[amb][mus][sfx]amix=inputs=3:normalize=0,loudnorm=I=-18:TP=-1.5,aformat=channel_layouts=stereo[a]" \
 -map "[a]" -ac 2 -ar 48000 "$OUT/_tmp_audio.wav"

# Pass C — mux video + soundtrack
"$FFMPEG" -hide_banner -y -i "$OUT/_tmp_video.mp4" -i "$OUT/_tmp_audio.wav" \
 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart \
 "$OUT/ODG_prototype_reel_v2.mp4"
rm -f "$OUT/_tmp_video.mp4" "$OUT/_tmp_audio.wav"
echo "WROTE $OUT/ODG_prototype_reel_v2.mp4"
