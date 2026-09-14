#!/usr/bin/env bash
# Full 2023-2025 climatology run: waves+wind first (3 parallel month groups),
# then currents (3 parallel month groups), then render. Resumable: finished
# months are skipped via done-markers in $AIMAR_DATA/logs. Run detached:
#   setsid nohup bash pipeline/climatology/run_all.sh > /media/pc/ext4TB/AiMar/logs/run_all.log 2>&1 &
set -u
cd "$(dirname "$0")/../.."
LOGS=/media/pc/ext4TB/AiMar/logs
run_source() {
  local src=$1
  python3 -m pipeline.climatology.accumulate "$src" --months 1 2 3 4   > "$LOGS/${src}_g1.log" 2>&1 &
  python3 -m pipeline.climatology.accumulate "$src" --months 5 6 7 8   > "$LOGS/${src}_g2.log" 2>&1 &
  python3 -m pipeline.climatology.accumulate "$src" --months 9 10 11 12 > "$LOGS/${src}_g3.log" 2>&1 &
  wait
}
echo "$(date -u +%FT%TZ) start waves"
run_source wave
echo "$(date -u +%FT%TZ) waves done, start currents"
run_source norkyst
echo "$(date -u +%FT%TZ) all done, rendering"
python3 -m pipeline.climatology.render > "$LOGS/render.log" 2>&1
echo "$(date -u +%FT%TZ) rendered"
