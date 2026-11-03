#!/bin/bash
# Сборка телефонных кадров зала (после phone_render.sh): кодирование в assets/house-hall/, постер, блок house.arch.
#   OUT=/tmp/zone/pf bash phone_build.sh
set -e
cd "$(dirname "$0")"
A=../../assets/house-hall; O=${OUT:-/tmp/zone/pf}
rm -rf $A/m $A/zm $A/jm
python3 encode_arch.py $O/bg_p $A/m --size 900x1600 --end 1.0 --q 90 --veil 0.26:0.034:0.62 | tail -n 1
rm -f $A/p-m.json                                                               # положения кадров на прокрутке общие с ПК (p-d.json)
python3 encode_depth.py depth $O/z_p $A/zm | tail -n 1
python3 encode_jar.py $O/jar_p $A/jm --q 92 | tail -n 1
cp $O/cam-p.json $A/cam-m.json
# постер зала на телефоне: последний кадр + баночка (как у ПК до замены на нулевой кадр пролёта)
python3 - <<PY
from PIL import Image
import json
A='$A/'
t=json.load(open('$O/track-p.json')); x,y,w,h=t['rects'][59]
b=Image.open(A+'m/059.webp').convert('RGBA'); j=Image.open(A+'jm/059.webp').convert('RGBA')
W,H=b.size
b.alpha_composite(j.resize((round(w*W),round(h*H)),Image.LANCZOS),(round(x*W),round(y*H)))
b.convert('RGB').save(A+'poster-m.webp',quality=80,method=6); print('poster-m ok', b.size)
PY
# блок house.arch: ПК берётся из прежней дорожки (рамки совпадают с данными), телефон — из новой
python3 apply_house.py --p $A/p-d.json --track-d /tmp/zone/track-d.json --track-p $O/track-p.json
echo "ГОТОВО phone_build $(date)"
