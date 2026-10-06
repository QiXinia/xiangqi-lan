#!/bin/bash
# 窗B2 剩余全量安全门（clean2 定稿 ai-pro；master377 已 377/377 单独落盘 clean4-master-pro.json）
cd /home/user/Doubao/chats/38444973861070338/xiangqi-lan || exit 1
G=test/logs/clean4-gates.log
echo "### GATES START $(date '+%F %T')" > "$G"

echo "=== DEEP pro #276,#300 REP=3 ESCALATE ===" >> "$G"
ENGINE=pro ATTACKER=master REP=3 ESCALATE=1 IDS=276,300 QUIET=1 JSON=test/logs/clean4-deep-pro.json node test/puzzle-ai-check.mjs >> "$G" 2>&1
echo "deep rc=$? $(date '+%H:%M')" >> "$G"

echo "=== HINT 6000/2500 ===" >> "$G"
ATTACKER=hint ATK_MS=6000 DEF_MS=2500 QUIET=1 JSON=test/logs/clean4-hint1.json node test/puzzle-ai-check.mjs >> "$G" 2>&1
echo "hint1 rc=$? $(date '+%H:%M')" >> "$G"

echo "=== HINT 3000/2500 ===" >> "$G"
ATTACKER=hint ATK_MS=3000 DEF_MS=2500 QUIET=1 JSON=test/logs/clean4-hint2.json node test/puzzle-ai-check.mjs >> "$G" 2>&1
echo "hint2 rc=$? $(date '+%H:%M')" >> "$G"

echo "=== HINT 3000/1000 ===" >> "$G"
ATTACKER=hint ATK_MS=3000 DEF_MS=1000 QUIET=1 JSON=test/logs/clean4-hint3.json node test/puzzle-ai-check.mjs >> "$G" 2>&1
echo "hint3 rc=$? $(date '+%H:%M')" >> "$G"

echo "=== PUZZLE 458 ===" >> "$G"
node test/puzzle-check.js >> "$G" 2>&1
echo "puzzle458 rc=$? $(date '+%H:%M')" >> "$G"

echo "=== REGRESS ===" >> "$G"
for t in engine ai analyze notation rep-rule ai-diversity ai-pro-diversity; do
  echo "--- $t.test ---" >> "$G"
  node test/$t.test.mjs >> "$G" 2>&1
  echo "$t rc=$? $(date '+%H:%M')" >> "$G"
done
echo "--- openings-check(53) ---" >> "$G"
node test/openings-check.mjs >> "$G" 2>&1
echo "openings rc=$? $(date '+%H:%M')" >> "$G"

echo "### GATES DONE $(date '+%F %T')" >> "$G"
