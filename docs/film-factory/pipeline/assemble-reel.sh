#!/usr/bin/env bash
# ODG local assembly — builds ONE continuous MP4 from the real generated shots using the vendored static ffmpeg.
# €0, no network, no credit. Normalizes every shot to 1280x720 25fps yuv420p, concatenates in narrative order,
# and attaches a SILENT stereo AAC track (placeholder — real dialogue/music/SFX are NOT yet generated; blocked on
# credit). This is a prototype REEL assembled from ~17s of real footage + a 4s still-hold — NOT a 10-minute film.
set -euo pipefail
cd "$(dirname "$0")"
FFMPEG=vendor/node_modules/ffmpeg-static/ffmpeg
B=runs/benchmark
OUT=runs/benchmark/export
mkdir -p "$OUT"

N="scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25,format=yuv420p"

"$FFMPEG" -hide_banner -y \
  -i "$B/SC01-video.mp4" \
  -i "$B/SC40.mp4" \
  -i "$B/SC22.mp4" \
  -loop 1 -t 4 -i "$B/SC01-still.webp" \
  -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=48000 \
  -filter_complex "[0:v]$N[v0];[1:v]$N[v1];[2:v]$N[v2];[3:v]$N[v3];[v0][v1][v2][v3]concat=n=4:v=1:a=0[vout]" \
  -map "[vout]" -map 4:a \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 25 \
  -c:a aac -b:a 128k -shortest \
  -movflags +faststart \
  "$OUT/ODG_prototype_reel.mp4"

echo "WROTE $OUT/ODG_prototype_reel.mp4"
