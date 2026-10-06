#!/bin/bash
# 定稿增强引擎完整评测流水线(脱离会话运行, 结果写 test/logs/final-*.json)
cd /home/user/Doubao/chats/38444973861070338/xiangqi-lan || exit 1
mkdir -p test/logs
echo "PIPELINE START $(date)" > test/logs/pipeline.log

# ---- 阶段1: 完整 200 局(4 进程并行, 占满 4 核) ----
GAMES=50 MS=800 SEED0=3001 JSON=test/logs/final-sp-a.json node test/pro-selfplay.mjs  > test/logs/final-sp-a.log 2>&1 &
P1=$!
GAMES=50 MS=800 SEED0=3051 JSON=test/logs/final-sp-b.json node test/pro-selfplay.mjs  > test/logs/final-sp-b.log 2>&1 &
P2=$!
GAMES=50 MS=900 SEED0=4040 JSON=test/logs/final-pvc-a.json node test/pro-vs-classic.mjs > test/logs/final-pvc-a.log 2>&1 &
P3=$!
GAMES=50 MS=900 SEED0=4140 JSON=test/logs/final-pvc-b.json node test/pro-vs-classic.mjs > test/logs/final-pvc-b.log 2>&1 &
P4=$!
wait $P1 $P2 $P3 $P4
echo "STAGE1 TOURNAMENTS DONE $(date)" >> test/logs/pipeline.log

# ---- 阶段2(计时门, 必须独占 CPU, 串行): pro master 全量 377 REP=1 ESCALATE ----
ENGINE=pro ATTACKER=master ATK_MS=3000 DEF_MS=2500 REP=1 ESCALATE=1 JSON=test/logs/master-pro-rep1.json QUIET=1 \
  node test/puzzle-ai-check.mjs > test/logs/master-pro-rep1.log 2>&1
echo "STAGE2 MASTER-PRO DONE $(date) rc=$?" >> test/logs/pipeline.log

# ---- 阶段3: pro 深局 #276/#300 REP=3 ----
ENGINE=pro ATTACKER=master ATK_MS=3000 DEF_MS=2500 REP=3 ESCALATE=1 IDS=276,300 JSON=test/logs/master-pro-deep.json QUIET=1 \
  node test/puzzle-ai-check.mjs > test/logs/master-pro-deep.log 2>&1
echo "STAGE3 MASTER-PRO-DEEP DONE $(date) rc=$?" >> test/logs/pipeline.log

# ---- 阶段4: classic 深局 #276/#300 REP=3 对照(ai.js 未改, 全量沿用上轮基线) ----
ENGINE=classic ATTACKER=master ATK_MS=3000 DEF_MS=2500 REP=3 ESCALATE=1 IDS=276,300 JSON=test/logs/master-classic-deep.json QUIET=1 \
  node test/puzzle-ai-check.mjs > test/logs/master-classic-deep.log 2>&1
echo "STAGE4 MASTER-CLASSIC-DEEP DONE $(date) rc=$?" >> test/logs/pipeline.log

# ---- 阶段5: hint 精确路径三套(与引擎解耦) ----
ATTACKER=hint ATK_MS=6000 DEF_MS=2500 JSON=test/logs/hint-6000-2500.json QUIET=1 node test/puzzle-ai-check.mjs > test/logs/hint-6000-2500.log 2>&1
echo "STAGE5 HINT1 DONE $(date) rc=$?" >> test/logs/pipeline.log
ATTACKER=hint ATK_MS=3000 DEF_MS=2500 JSON=test/logs/hint-3000-2500.json QUIET=1 node test/puzzle-ai-check.mjs > test/logs/hint-3000-2500.log 2>&1
echo "STAGE6 HINT2 DONE $(date) rc=$?" >> test/logs/pipeline.log
ATTACKER=hint ATK_MS=3000 DEF_MS=1000 JSON=test/logs/hint-3000-1000.json QUIET=1 node test/puzzle-ai-check.mjs > test/logs/hint-3000-1000.log 2>&1
echo "STAGE7 HINT3 DONE $(date) rc=$?" >> test/logs/pipeline.log

# ---- 阶段6: 458 穷举 ----
node test/puzzle-check.js > test/logs/puzzle-check-458.log 2>&1
echo "STAGE8 PUZZLE-CHECK DONE $(date) rc=$?" >> test/logs/pipeline.log

# ---- 阶段7: 快速回归 ----
for t in engine ai analyze openings-check rep-rule ai-diversity ai-pro-diversity; do
  node test/$t.test.mjs > test/logs/reg-$t.log 2>&1
  echo "REG $t rc=$? $(date)" >> test/logs/pipeline.log
done
echo "PIPELINE ALL DONE $(date)" >> test/logs/pipeline.log
