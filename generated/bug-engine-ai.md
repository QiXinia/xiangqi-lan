# 中国象棋引擎与 AI 正确性审查报告（engine.js / ai.js）

审查方式：通读 `js/engine.js`、`js/ai.js` 后，每个可疑点均在 `/tmp` 写最小 Node(ESM) 复现脚本并**实际运行**确认；AI 正确性用独立 `pieceTargets` 正向生成 + 飞将规则作“地面真值”交叉核验。**未改动 `js/` 与 `test/` 下任何文件。**

- 项目根：`/home/user/Doubao/chats/38444973861070338/xiangqi-lan/`
- 基线测试（只读运行）：
  - `node test/engine.test.mjs` → **✅ pass=89 fail=0**（经典 100 局 + 揭棋 200 局随机对弈，异常 0）
  - `node test/ai.test.mjs` → **✅ pass=14 fail=0**（AI 自对弈 illegal=0）

---

## 确认问题清单

| # | 标题 | 位置 | 严重度 |
|---|------|------|--------|
| 1 | fastIsAttacked 马腿点方向反了（相对目标格而非相对马源点） | `js/engine.js:353-360`（核心行 359） | **致命** |
| 2 | 长将（perpetual）把胜判给了“长将方”本身，方向颠倒 | `js/engine.js:546-550`（核心行 550） | **高** |
| 3 | 揭棋暗子翻开第一步时，增量 Zobrist 与全量 boardKey 不一致，污染置换表 | `js/ai.js:208-214`（zApply，核心行 209/211） | **中** |

---

## Bug 1（致命）：fastIsAttacked 马腿点方向错误

**文件:行**：`js/engine.js:353-360`，关键行 359
```js
const horseLegs = [ [1,2,0,1], [-1,2,0,1], ... ];   // dx,dy 马源相对目标; lx,ly
for (const [dx,dy,lx,ly] of horseLegs) {
  const p = at(kx + dx, ky + dy);                  // 马源 S = 目标 + (dx,dy)
  if (isEnemy(p,'N') && !at(kx + lx, ky + ly)) ... // *** 腿点相对目标 (kx,ky)，错 ***
}
```

**机理**：正向 `pieceTargets`（`engine.js:235-248`）生成马着法时，马腿检查的是**紧靠马源 S** 一侧的“肘点”。反向 `fastIsAttacked` 从目标格（将/帅位 `kx,ky`）反推马源 `S=(kx+dx,ky+dy)` 时，却用 `(kx+lx,ky+ly)`——即**紧靠目标格**的点——当作马腿。几何上马腿应为 `S + 前进一步` = `(kx+dx,ky+dy) + 前进步`，代码少加了 `(dx,dy)`，8 个方向全部系统性错位。

**复现脚本**：`/tmp/horse-leg.mjs`
```
场景 FP: 红帅(4,9) 被黑马(3,7) 攻击；真实马腿 (3,8) 被红兵堵住（马应被蹩、不攻击）。
  pieceTargets(马) 目标格不含 (4,9)  →  地面真值：不攻击
  isInCheck(红)=true / fastIsAttacked=true   → 引擎误判“正在将军”
场景 FN: 同上，但把堵腿子放到 (4,8)（并非真实马腿），真实马腿 (3,8) 空。
  pieceTargets 目标格含 (4,9)          → 地面真值：正在将军
  isInCheck(红)=false / fastIsAttacked=false → 引擎漏判将军
```
运行输出（节选）：
```
FP: pieceTargets says does NOT attack but isInCheck says IN CHECK   *** MISMATCH
FN: pieceTargets says ATTACKS but isInCheck says NOT in check      *** MISMATCH
```

**连带后果（已运行量化）**：`/tmp/legal-fuzz.mjs` 在 46,949 个局面、1,789,337 个候选着法上做独立核验（走完后用正向 `pieceTargets`+飞将规则复核“己方王是否仍被攻击”）：
- `legalMoves` 泄漏 **3,231 个非法着法**（走完后己方王仍被马攻击）；
- 攻击者分布 **100% 为马**：`{"N":3212, "N+N":19}`，车/炮/兵/仕/相/王 **0** 泄漏。

这正是并行分片 S2 观察到的“合法应着里存在走完仍被将军、对方能下一步吃将”的根因——**不是 S2 自研 make/unmake 的问题，是引擎攻击判定本身的假阴性**。它同时污染 AI 搜索（`legalMovesScored` 复用同一 `isInCheck`）与终局判定（当将军方是马时，将死/困毙会被错判）。

**期望 vs 实际**：
- 期望：`fastIsAttacked` 的马腿判定与 `pieceTargets` 正向生成完全一致（马腿恒为紧靠马源的肘点）。
- 实际：反向用了紧靠目标格的点，既会把蹩腿马误判为正在将军（假阳性），也会把合法马将军漏判（假阴性）。

**严重度**：致命。属于与“兵正面将军方向”同级的规则正确性错误，直接破坏合法性过滤、终局胜负判定与 AI。

**修复建议（只建议不改码）**：反向马腿应相对马源 `S=(kx+dx,ky+dy)` 计算，即把腿点改为 `(kx+dx+lx', ky+dy+ly')`，其中 `(lx',ly')` 是“从马源向目标走第一步的正交邻点”；最稳妥的做法是令反向表直接复用正向 `pieceTargets` 的腿定义（或对每个候选马源调用一次 `pieceTargets` 判目标格是否在列），保证正/反定义同源。

---

## Bug 2（高）：长将把胜判给了长将方

**文件:行**：`js/engine.js:546-550`，核心行 550
```js
if (checks.length >= 3) {
  const checkedSide = checks[0];
  if (checks.every(s => s === checkedSide))
    perpetual = checkedSide === 'r' ? 'b' : 'r';   // perpetual = 长将方(行将者)
}
if (perpetual) {
  state.status = perpetual === 'r' ? 'redwin' : 'blackwin';  // *** 判给了长将方本人 ***
  state.reason = 'perpetual';
}
```

`perpetual` 变量记录的是**不断将军的一方**（长将方）。按中国象棋规则，长将方**判负**，即应判给对方。此处 `perpetual==='r'?'redwin':'blackwin'` 却把胜场给了 `perpetual` 自己。

**复现脚本**：`/tmp/endgame-perp.mjs`
```js
// 黑将(5,0)；红车(5,2)将军；红帅(3,9)。黑将只能在 5,0<->4,0 间躲，红车在 5,2<->4,2 间跟将。
const s = E.createState({ fen: '5k3/9/5R3/9/9/9/9/9/9/3K5 b' });
// 手动走 8 手完成 3 次重复，期间红车每步都将军：
seq = [[5,0],[4,0]],[[5,2],[4,2]],[[4,0],[5,0]],[[4,2],[5,2]],
      [[5,0],[4,0]],[[5,2],[4,2]],[[4,0],[5,0]],[[4,2],[5,2]];
```
运行输出：
```
status= redwin  reason= perpetual   turn= b
```
**期望 vs 实际**：红方长将 → 红方判负 → 应 `blackwin`；实际引擎给出 `redwin`（长将方反而赢）。黑方长将时同理反置。

**严重度**：高。触发条件（单方连续长将三重复）出现即判反胜负。

**修复建议**：胜负应判给长将方的对方：
`state.status = perpetual === 'r' ? 'blackwin' : 'redwin';`
（即把三目表达式两个结果对调。）

---

## Bug 3（中）：揭棋暗子翻开第一步，增量 Zobrist 与全量 boardKey 不一致

**文件:行**：`js/ai.js:208-214`（`zApply`），核心行 209/211
```js
function zApply(key, u) {
  const pt = u.wasHidden ? u.orig : u.piece.t;   // *** 翻开后仍用表观类型 orig ***
  key ^= Z[u.piece.c][pt][u.fy*9+u.fx];          // 源格：正确(翻开前 boardKey 用 orig)
  key ^= Z[u.piece.c][pt][u.ty*9+u.tx];          // 目标格：应为真实 t，却用了 orig
  if (u.cap) key ^= Z[u.cap.c][u.cap.hidden?u.cap.orig:u.cap.t][u.ty*9+u.tx];
  return (key ^ ZTURN) >>> 0;
}
```

**机理**：`smake` 把暗子 `hidden=false` 后，`boardKey`（`ai.js:120-128`）在目标格用的是 `p.t`（**真身**）；而 `zApply` 对目标格仍 XOR `orig`（表观类型）。当某暗子真身 ≠ 表观类型（揭棋常态，例如“兵行”翻开是车）时，增量键与全量重算键分叉。根键 `rootKey=boardKey(state)` 是对的，但搜索子节点经 `zApply` 后偏离，置换表存/查用错键，导致错误裁剪（经典模式无暗子，不受影响）。

**复现脚本**：`/tmp/zobrist.mjs`（按 ai.js 完全相同的 `zRng(0x58514348)`、`ZTYPES`、`ZTURN` 复刻）
```
红暗子(真车 R、表观 P) 从 (0,6) 走到 (0,5) 翻开：
  keyBefore         = 244988603
  incremental zApply= 1490334221
  full boardKey     = 3742106304
  *** DIVERGES: TT key corrupted on hidden-piece reveal (jieqi) ***
```

**期望 vs 实际**：走完一步（含翻开）后，`zApply` 增量键应等于 `boardKey` 全量重算键；实际二者不等。

**严重度**：中。仅影响揭棋 AI 的置换表命中率/偶发错误裁剪，不会产生非法着法或崩溃，也不影响规则正确性；经典模式不受影响。

**修复建议**：源格按 `orig` XOR（翻开前），目标格按真身 `u.piece.t` XOR（翻开后落点）：
```js
key ^= Z[c][u.wasHidden ? u.orig : u.piece.t][u.fy*9+u.fx];  // 源
key ^= Z[c][u.piece.t][u.ty*9+u.tx];                          // 目标(翻开后用真身)
```

---

## 经检验“未发现问题”的关键点

- **终局胜负端到端回归（重点）**：`/tmp/endgame-e2e.mjs`
  - 红车将杀黑将 → `applyMove` 后立即 `status=redwin, reason=checkmate` ✅
  - 红车困毙黑将（未被将、无棋可走）→ `status=redwin, reason=stalemate` ✅
  - 反向：黑将杀红帅 → `status=blackwin, reason=checkmate` ✅
  - 即“己方走完一步、对方被将死/困毙”的状态翻转链路正确（用车/炮攻击，避开马 bug 后隔离验证）。
- **飞将/白脸将**：`/tmp/misc-engine.mjs`——车在中路遮将时，挪开车露将被判非法、留路遮将合法 ✅。
- **炮架/象眼/兵过河与不可后退/兵源方向/车/仕**：`/tmp/elephant-cannon.mjs` + `/tmp/attack-fuzz2.mjs`（73,150 个王位正反对比），除马外其余兵种攻击正反一致 ✅。fastIsAttacked 兵正面 `back = by==='r'?1:-1`（engine.js:362）方向正确，与既有修复一致。
- **FEN parse/toFEN 往返**：3 个局面（含开局与中局）往返一致 ✅。
- **undoMoves / cloneState / serialize / restore**：棋盘、status、reason、moves、posCount 重建一致 ✅（`/tmp/misc-engine.mjs`）。
- **AI 根着法合法性 / state 污染 / deadline**：`/tmp/ai-check.mjs` 在 60 局随机走子共 2,393 次 `searchBestMove`：返回着法 100% 在 `legalMoves` 内（非法=0），调用前后输入局面棋盘逐格一致（污染=0），能识别必胜局面（score≈MATE）✅。
- **null-move 边界**：`allowNull && !inChk && !state.jieqi && depth>=3 && hasHeavy(state,c) && ply>=1 && Number.isFinite(beta)`——被将、揭棋、无根/纯兵残局（无车炮）、根附近、全窗均已禁用；仅剩帅时 `hasHeavy=false` 自动跳过 ✅。
- **现有测试基线**：engine 89/0、ai 14/0 全过（但注意 AI 自对弈的 `illegal=0` 是因为它复用了同一套有 bug 的 `isInCheck`，不能据此证明马攻击正确——本报告 Bug 1 已独立证伪）。

---

## 复现脚本路径汇总（均在 /tmp）

- `/tmp/horse-leg.mjs` — Bug 1 马腿正反不一致（FP/FN 双向）
- `/tmp/legal-fuzz.mjs` — Bug 1 连带：legalMoves 泄漏非法着法统计（3231，100% 马）
- `/tmp/endgame-perp.mjs` — Bug 2 长将胜负方向
- `/tmp/zobrist.mjs` — Bug 3 揭棋翻开时 Zobrist 分叉
- `/tmp/endgame-e2e.mjs` — 将死/困毙/反向将杀 status 翻转回归
- `/tmp/misc-engine.mjs` — 飞将、FEN 往返、undo/clone/serialize
- `/tmp/elephant-cannon.mjs` — 象眼/炮架/兵方向定向核验
- `/tmp/attack-fuzz2.mjs` — 正反攻击在合法局面上的大规模对比（除马外一致）
- `/tmp/ai-check.mjs` / `/tmp/ai-mate-probe.mjs` — AI 根着法合法/无污染/识杀
