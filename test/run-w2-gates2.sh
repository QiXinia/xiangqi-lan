#!/bin/bash
# 窗2 分片增量: 每片 GAMES=10 独立 JSON, 4 并行占4核
cd /home/user/Doubao/chats/38444973861070338/xiangqi-lan || exit 1
L=test/logs; mkdir -p "$L"; G=$L/w3-gates.log
echo "### W3 START $(date '+%F %T')" > "$G"

run4() { # $@ = 4 "env... cmd" lines already launched; helper just waits
  wait
}

echo "=== STAGE1 PVC batches ===" >> "$G"
# pvc 10 seed segments, 4 at a time
PVC="4040 4050 4060 4070 4080 4140 4150 4160 4170 4180"
arr=($PVC)
for ((i=0;i<${#arr[@]};i+=4)); do
  for ((j=0;j<4 && i+j<${#arr[@]};j++)); do
    s=${arr[i+j]}
    GAMES=10 MS=900 SEED0=$s JSON=$L/w3-pvc-$s.json node test/pro-vs-classic.mjs > $L/w3-pvc-$s.log 2>&1 &
  done
  wait
  echo "pvc batch $i done $(date '+%H:%M')" >> "$G"
done

echo "=== STAGE1 SP batches ===" >> "$G"
SP="3001 3011 3021 3031 3041 3051 3061 3071 3081 3091"
arr=($SP)
for ((i=0;i<${#arr[@]};i+=4)); do
  for ((j=0;j<4 && i+j<${#arr[@]};j++)); do
    s=${arr[i+j]}
    GAMES=10 MS=800 SEED0=$s JSON=$L/w3-sp-$s.json node test/pro-selfplay.mjs > $L/w3-sp-$s.log 2>&1 &
  done
  wait
  echo "sp batch $i done $(date '+%H:%M')" >> "$G"
done
echo "### W3 STAGE1 DONE $(date '+%F %T')" >> "$G"
