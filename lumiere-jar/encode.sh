#!/bin/bash
# Сборка MP4 из кадров рендера: ./encode.sh <папка_с_кадрами> <выход.mp4>
# H.264, yuv420p, лёгкое «зерно» против бандинга на градиентах фона, плавные вход/выход из чёрного.
set -e
FRAMES=${1:?папка с кадрами f00000.png ...}
OUT=${2:-lumiere_jar.mp4}
N=$(ls "$FRAMES"/f*.png | wc -l)
FPS=24
FADE_OUT_START=$(python3 -c "print(max(0, $N/$FPS - 0.7))")
ffmpeg -y -framerate $FPS -i "$FRAMES/f%05d.png" \
  -vf "noise=alls=2:allf=t,fade=t=in:st=0:d=0.5,fade=t=out:st=$FADE_OUT_START:d=0.7,format=yuv420p" \
  -c:v libx264 -preset slow -crf 15 -profile:v high -movflags +faststart "$OUT"
