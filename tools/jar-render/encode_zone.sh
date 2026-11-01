#!/bin/bash
# Кодирование кадров зала дома (результат render_zone.sh в $OUT) в assets/house-hall/ и запись блока house.arch в data/redesign.json.
#   OUT=/tmp/zone bash encode_zone.sh
cd "$(dirname "$0")" || exit 1
O=${OUT:-/tmp/zone}
A=../../assets/house-hall
mkdir -p "$A"
python3 blackcheck.py "$O/bg_d" ; python3 blackcheck.py "$O/bg_p"          # пустая строка — кадры чистые (порог — /tmp/blackmax)
python3 encode_arch.py "$O/bg_d" "$A/d" --size 1920x1080 --end 1.0 --q 90 --veil 0.26:0.034:0.62
python3 encode_arch.py "$O/bg_p" "$A/m" --size 900x1600  --end 1.0 --q 90 --veil 0.26:0.034:0.62
python3 encode_depth.py depth "$O/z_d" "$A/zd"
python3 encode_depth.py depth "$O/z_p" "$A/zm"
python3 encode_jar.py "$O/jar_d" "$A/j"  --q 92
python3 encode_jar.py "$O/jar_p" "$A/jm" --q 92
cp "$O/cam-d.json" "$A/cam-d.json"; cp "$O/cam-p.json" "$A/cam-m.json"
python3 apply_house.py --p "$A/p-d.json" --track-d "$O/track-d.json" --track-p "$O/track-p.json"
