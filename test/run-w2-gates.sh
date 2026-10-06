#!/bin/bash
# 窗2 重门(单driver, 阶段串行; 百局阶段4片正好占4核, 其后master/hint单进程)
# 启动前须保证无其他 node 评测在跑(pkill -x node)。增量结果全部落 test/logs/w2-*
cd /home/user/Doubao/chats/38444973861070338/xiangqi-lan || exit 1
L=test/logs; mkdir -p "$L"
G=$L/w2-gates.log
echo "### W2 GATES START $(date '+%F %T')" > "$G"

echo "=== STAGE1 百局: pro-vs-classic 100(SEED0 4040/4140 各50) + pro-selfplay 100(3001/3051 各50), 4片并行 ===" >> "$G"
GAMES=50 MS=900 SEED0=4040 JSON=$L/w2-pvc-4040.json node test/pro-vs-classic.mjs > "$L/w2-pvc-4040.log" 2>&1 &
P1=$!
GAMES=50 MS=900 SEED0=4140 JSON=$L/w2-pvc-4140.json node test/pro-vs-classic.mjs > "$L/w2-pvc-4140.log" 2>&1 &
P2=$!
GAMES=50 MS=800 SEED0=3001 JSON=$L/w2-sp-3001.json node test/pro-selfplay.mjs > "$L/w2-sp-3001.log" 2>&1 &
P3=$!
GAMES=50 MS=800 SEED0=3051 JSON=$L/w2-sp-3051.json node test/pro-selfplay.mjs > "$L/w2-sp-3051.log" 2>&1 &
P4=$!
wait $P1 $P2 $P3 $P4
echo "stage1 wait done $(date '+%H:%M')" >> "$G"
for f in w2-pvc-4040 w2-pvc-4140 w2-sp-3001 w2-sp-3051; do
  echo "--- $f :: $(tail -1 "$L/$f.log" 2>/dev/null)" >> "$G"
done

echo "=== STAGE2 ENGINE=pro master 全杀局(399) REP=1 ESCALATE=1 ===" >> "$G"
ENGINE=pro ATTACKER=master REP=1 ESCALATE=1 ATK_MS=2500 DEF_MS=2500 QUIET=1 JSON=$L/w2-master-pro.json node test/puzzle-ai-check.mjs >> "$G" 2>&1
echo "master rc=$? $(date '+%H:%M')" >> "$G"

echo "=== STAGE3 ENGINE=pro deep #276,#300 REP=3 ESCALATE=1 ===" >> "$G"
ENGINE=pro ATTACKER=master REP=3 ESCALATE=1 IDS=276,300 QUIET=1 JSON=$L/w2-deep-pro.json node test/puzzle-ai-check.mjs >> "$G" 2>&1
echo "deep rc=$? $(date '+%H:%M')" >> "$G"

echo "=== STAGE4 hint 三套(攻防时限三档, 走经典确定性 puzzleHintMove) ===" >> "$G"
ATTACKER=hint REP=1 ATK_MS=6000 DEF_MS=2500 QUIET=1 JSON=$L/w2-hint1.json node test/puzzle-ai-check.mjs >> "$G" 2>&1; echo "hint1 rc=$? $(date '+%H:%M')" >> "$G"
ATTACKER=hint REP=1 ATK_MS=3000 DEF_MS=2500 QUIET=1 JSON=$L/w2-hint2.json node test/puzzle-ai-check.mjs >> "$G" 2>&1; echo "hint2 rc=$? $(date '+%H:%M')" >> "$G"
ATTACKER=hint REP=1 ATK_MS=3000 DEF_MS=1000 QUIET=1 JSON=$L/w2-hint3.json node test/puzzle-ai-check.mjs >> "$G" 2>&1; echo "hint3 rc=$? $(date '+%H:%M')" >> "$G"

echo "### W2 GATES DONE $(date '+%F %T')" >> "$G"
