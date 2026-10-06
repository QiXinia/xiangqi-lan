#!/bin/bash
# 修复后定稿增强引擎 完整上线门流水线(仅在 ai-pro.js 验证达标、不再改动后启动; setsid 脱离会话)
cd /home/user/Doubao/chats/38444973861070338/xiangqi-lan || exit 1
mkdir -p test/logs
LOG=test/logs/pipeline-fixed.log
echo "FIXED PIPELINE START $(date)" > $LOG

# ---- STAGE1: 修复后完整 200 局(4 进程; 对抗沿用 4040/4140 seed 段以便与修复前直接对照) ----
GAMES=50 MS=800 SEED0=3001 JSON=test/logs/fixed-sp-a.json node test/pro-selfplay.mjs   > test/logs/fixed-sp-a.log 2>&1 &
P1=$!
GAMES=50 MS=800 SEED0=3051 JSON=test/logs/fixed-sp-b.json node test/pro-selfplay.mjs   > test/logs/fixed-sp-b.log 2>&1 &
P2=$!
GAMES=50 MS=900 SEED0=4040 JSON=test/logs/fixed-pvc-a.json node test/pro-vs-classic.mjs > test/logs/fixed-pvc-a.log 2>&1 &
P3=$!
GAMES=50 MS=900 SEED0=4140 JSON=test/logs/fixed-pvc-b.json node test/pro-vs-classic.mjs > test/logs/fixed-pvc-b.log 2>&1 &
P4=$!
wait $P1 $P2 $P3 $P4
echo "STAGE1 FIXED-200 DONE $(date)" >> $LOG

# ---- STAGE2: 修复后 pro master 全量 377(独占, REP=1 ESCALATE) ----
ENGINE=pro ATTACKER=master ATK_MS=3000 DEF_MS=2500 REP=1 ESCALATE=1 JSON=test/logs/fixed-master-pro-rep1.json QUIET=1 \
  node test/puzzle-ai-check.mjs > test/logs/fixed-master-pro-rep1.log 2>&1
echo "STAGE2 MASTER-PRO rc=$? $(date)" >> $LOG

# ---- STAGE3: pro 深局 #276/#300 REP=3 ----
ENGINE=pro ATTACKER=master ATK_MS=3000 DEF_MS=2500 REP=3 ESCALATE=1 IDS=276,300 JSON=test/logs/fixed-master-pro-deep.json QUIET=1 \
  node test/puzzle-ai-check.mjs > test/logs/fixed-master-pro-deep.log 2>&1
echo "STAGE3 MASTER-PRO-DEEP rc=$? $(date)" >> $LOG

# ---- STAGE4: classic 深局对照 ----
ENGINE=classic ATTACKER=master ATK_MS=3000 DEF_MS=2500 REP=3 ESCALATE=1 IDS=276,300 JSON=test/logs/fixed-master-classic-deep.json QUIET=1 \
  node test/puzzle-ai-check.mjs > test/logs/fixed-master-classic-deep.log 2>&1
echo "STAGE4 MASTER-CLASSIC-DEEP rc=$? $(date)" >> $LOG

# ---- STAGE5: hint 精确路径三套(与引擎解耦) ----
ATTACKER=hint ATK_MS=6000 DEF_MS=2500 JSON=test/logs/fixed-hint-6000-2500.json QUIET=1 node test/puzzle-ai-check.mjs > test/logs/fixed-hint-6000-2500.log 2>&1
echo "STAGE5 HINT1 rc=$? $(date)" >> $LOG
ATTACKER=hint ATK_MS=3000 DEF_MS=2500 JSON=test/logs/fixed-hint-3000-2500.json QUIET=1 node test/puzzle-ai-check.mjs > test/logs/fixed-hint-3000-2500.log 2>&1
echo "STAGE6 HINT2 rc=$? $(date)" >> $LOG
ATTACKER=hint ATK_MS=3000 DEF_MS=1000 JSON=test/logs/fixed-hint-3000-1000.json QUIET=1 node test/puzzle-ai-check.mjs > test/logs/fixed-hint-3000-1000.log 2>&1
echo "STAGE7 HINT3 rc=$? $(date)" >> $LOG

# ---- STAGE6: 458 穷举 ----
node test/puzzle-check.js > test/logs/fixed-puzzle-check.log 2>&1
echo "STAGE8 PUZZLE-CHECK rc=$? $(date)" >> $LOG

# ---- STAGE7: 快速回归(含 notation) ----
for t in engine ai analyze notation openings-check rep-rule ai-diversity ai-pro-diversity; do
  node test/$t.test.mjs > test/logs/fixed-reg-$t.log 2>&1
  echo "REG $t rc=$? $(date)" >> $LOG
done
echo "FIXED PIPELINE ALL DONE $(date)" >> $LOG
