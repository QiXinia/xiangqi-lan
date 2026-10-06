# 修正版引擎自证 + 杀局分片复审报告（audit-sound）

本报告基于 **修正版副本**（`generated/engine-fixed.mjs`、`generated/ai-fixed.mjs`、`generated/notation-fixed.mjs`）。
相对 `js/engine.js` 仅两处经典规则修正（见 `bug-engine-ai.md` Bug#1 马腿、Bug#2 长将方向）；揭棋 Zobrist（Bug#3）经典残局用不到，未改。
**未改动 `js/`、`test/`、任何 shard JSON。**

---

## 一、修正自证（fixed 引擎）

### 1. 马腿最小复现双向正确（/tmp/fixed-selfproof.mjs）
- FP（真实马腿 (3,8) 被堵，马应被蹩）：`pieceTargets` 不含帅位 **且** `isInCheck(r)=false` ✅
- FN（真实马腿 (3,8) 空，马正在将军）：`isInCheck(r)=true` ✅
- （初版复现 FEN 曾因黑将与红帅同列被飞将污染，已把黑将移到 x5 排除干扰。）

### 2. legalMoves 泄漏 = 0（/tmp/fixed-selfproof.mjs）
- 随机对局采样：**47,172 个局面 / 1,796,289 个候选着法**，走完后用正向 `pieceTargets`+飞将规则复核“己方王是否仍被攻击”：
- **leaks = 0**（修正前为 3,231，且 100% 为马）。

### 3. 现有测试基线（/tmp 副本改 import 到 fixed 后运行）
- `engine.test.mjs` → **✅ 89 pass / 0 fail**
- `ai.test.mjs` → **✅ 14 pass / 0 fail**
- 旁证：修正后随机对局将杀数上升（揭棋 checkmate 91→99，经典 45→48），说明马腿修复解开了被旧 bug 漏判的真实杀。

### 4. 长将方向（/tmp/fixed-selfproof.mjs）
- 红方连续长将 → `status=blackwin, reason=perpetual` ✅（长将方红判负）。

### 5. 旧 PUZZLES 54 关复核（/tmp/puzzle-check.fixed.mjs，fixed 引擎穷举最短杀）
- **50 关通过**；**4 关在正确规则下不成立**：
  | 关 | 名称 | 问题 |
  |----|------|------|
  | #9  | 全士马后炮 | 标注 2 步杀，实际最短 **3** 步 |
  | #16 | 挂角马 | **初始黑方已被马将军**（红马 (6,1) 吊黑将 (4,0)，旧引擎漏判）→ 开局局面非法 |
  | #25 | 车马炮成杀 | 标注 2 步杀，实际最短 **3** 步 |
  | #40 | 车马炮闹宫 | 主变走完未红胜（playing） |
- **关于 S8 提示的 #2「困宫车」**：在正确规则下 **仍成立**，是合法的 1 步困毙杀（`车一平四` → redwin/stalemate）。S8 的“无解”是旧（有马腿 bug）引擎的产物，**在 fixed 规则下澄清为成立**。

---

## 二、杀局分片复审（/tmp 用 fixed 引擎 + fixed notation，机器可读结果见 `audit-drops.json`）

复审项：① 初始双方均不被将军（正确马腿+飞将）；② 最短强制杀 == 标注 mate（手工 make/unmake 加速，合法性/将军一律调 fixed 引擎）；③ mate4/mate5p 额外复核无更短杀与连将性；④ 主变逐着 `playLine` 合法、终局 `redwin`、黑将全程存活；⑤ 跨分片 + 对 PUZZLES54 按棋子位置签名去重。

| 分片 | 通过 / 总数 |
|------|------------|
| shard-mate1.json  | **42 / 46** |
| shard-mate2.json  | **41 / 45** |
| shard-mate3.json  | **43 / 57** |
| shard-mate4.json  | **11 / 20** |
| shard-mate5p.json | **0 / 11**（初步，见下注） |

- **确认淘汰 38 条**（证据见 `audit-drops.json` 的 `drops`）；**不确定（求解预算耗尽）7 条**（见 `inconclusive`）。
- 淘汰主因（与马腿 bug 同源，旧分片用有 bug 引擎生成/校验所致）：
  - **初始黑已被马将**（mate1 #12/#13/#14/#29）；
  - **主变里“最顽强应着”非法**，典型如 `士4进5` 在 fixed 规则下不成立（黑只能 `将5进1`），导致主变第 4/6 手非法或终局未红胜；
  - **最短杀与标注不符**（`最短杀<mate` 标注偏长 / `最短杀>mate` 或无解 标注偏短）；
  - mate4/5p **连将性**断裂（某手后黑未被将）。
- **注意**：`shard-mate5p.json` 此刻仍可能被另一 agent 续写（本次落盘 11 条，上次为 10 条），其 0/11 为**初步结论**；其中 7 条含“求解预算耗尽”的不确定项，待其定稿后应重跑 `node generated/audit-sound.mjs` 出终版。脚本可重复运行，不修改任何 shard。

---

## 三、产物清单
- `generated/engine-fixed.mjs`、`generated/ai-fixed.mjs`、`generated/notation-fixed.mjs`（修正版副本）
- `generated/audit-sound.mjs`（可重复复审脚本）
- `generated/audit-drops.json`（机器可读：perShard + drops + inconclusive）
