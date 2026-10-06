#!/bin/bash
# 窗2 阶段0 快速门(串行单进程, 避免4核超卖): 数据穷举 + 经典AI重测试
cd /home/user/Doubao/chats/38444973861070338/xiangqi-lan || exit 1
L=test/logs; mkdir -p "$L"
echo "STAGE0 START $(date)"

node test/puzzle-check.js > "$L/w2-puzzle483.log" 2>&1
echo "puzzle483 rc=$? :: $(tail -1 "$L/w2-puzzle483.log")"

node test/openings-check.mjs > "$L/w2-openings60.log" 2>&1
echo "openings60 rc=$? :: $(tail -1 "$L/w2-openings60.log")"

node test/ai.test.mjs > "$L/w2-ai14.log" 2>&1
echo "ai14 rc=$? ::"; tail -5 "$L/w2-ai14.log"

node test/ai-diversity.test.mjs > "$L/w2-aidiv.log" 2>&1
echo "ai-diversity rc=$? ::"; tail -4 "$L/w2-aidiv.log"

echo "STAGE0 DONE $(date)"
