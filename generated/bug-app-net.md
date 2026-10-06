# 中国象棋 · 应用控制层 / 记谱打谱 / 存储 / 联机层 正确性审查报告

- 审查对象：`js/game-controller.js`、`js/app.js`、`js/board-view.js`、`js/notation.js`、`js/storage.js`、`js/room.js`、`js/net-peer.js`、`js/pair.js`（参考 `js/net-codec.js`、`js/ai.worker.js`、`js/audio.js`、`js/ui.js`、`js/qrcode-ui.js`）。
- 方法：通读列可疑点 → `/tmp` 写最小 Node 复现（手工 DOM/Worker/timer/localStorage 桩 import `GameSession`，`room.js` 用 loopback 桩；参考 `test/*.test.mjs` 范式）→ 实际运行断言。
- 原则：仅收录"经 /tmp 脚本实际运行确认"的问题；未改 `js/` 与 `test/` 任何文件。
- 引擎侧（engine.js:362 兵将军方向）按主线程说明不再报告。

---

## 一、确认问题清单

| # | 标题 | 文件:行 | 严重度 |
|---|------|---------|--------|
| 1 | 将军高亮圈在被将方脱离将军后不清除，长期残留 | `js/board-view.js:113`（无 clear）+ `js/game-controller.js:467`（无 else 清除分支） | 低 |
| 2 | 联机悔棋/求和被拒后，**发起方收不到任何提示**；且**决策方反而收到一条"对方拒绝了"的错误提示** | `js/room.js:126`、`js/room.js:138`（broadcast 给决策方而非 emit 给房主自身）+ `js/game-controller.js:353`、`:363`（`undoReply/drawReply` 仅 `agree===true` 弹提示） | 中 |

---

### 问题 1：将军高亮圈不随解将清除（残留）

- **文件:行**：`js/game-controller.js:467`；`js/board-view.js:113`
- **复现脚本**：`/tmp/xq-t3-board.mjs`（C1）、`/tmp/xq-t7-final.mjs`（S2，经真实 `GameSession._render` 复现）。关键代码：
  ```js
  // 黑方被红车照将、轮到黑方应将的局面
  s.state = E.createState({ fen:'4k4/9/4R4/9/9/9/9/9/9/4K4 b' });
  s.board.setState(s.state); s._render();
  console.log(s.board.checkSide);            // => 'b'
  E.applyMove(s.state, [4,0],[3,0]); s._render();  // 黑将躲开, 已解将
  console.log(s.board.checkSide);            // => 仍为 'b'（期望 null）
  ```
- **期望 vs 实际**：
  - 期望：被将方走子解将后，`board.checkSide` 应被清空，不再绘制将军红圈。
  - 实际：`game-controller.js:467` 只有 `if (... && isInCheck(...)) this.board.setCheck(this.state.turn)`，**没有 else 分支清除**；`board-view.js:113` `setCheck(side)` 只赋值不复位，`render()/_drawHints()` 也从不把 `checkSide` 置回 null。结果红方照将后黑将躲开，红圈仍长期画在黑将新位置上，误导"仍在被将"。
- **严重度**：低（纯视觉，不影响走子合法性与胜负）。
- **修复建议（只建议不改源码）**：`game-controller.js:467` 改为 `if (this.state.status==='playing' && isInCheck(this.state,this.state.turn)) this.board.setCheck(this.state.turn); else this.board.setCheck(null);`；或在 `board-view.js` 增加 `clearCheck()` 并在每次 `setState`/`render` 开头复位 `this.checkSide=null`（注意 `setCheck(null)` 后 `_drawHints` 对 `null` 已安全）。

---

### 问题 2：联机悔棋 / 求和被拒后，发起方无反馈、决策方反被误提示

- **文件:行**：`js/room.js:126`、`js/room.js:138`；`js/game-controller.js:353`、`js/game-controller.js:363`
- **复现脚本**：`/tmp/xq-t5-room.mjs`（R4）、`/tmp/xq-t6-room2.mjs`（R4b/R4c）、`/tmp/xq-t8-draw.mjs`（D1/D2）。关键代码：
  ```js
  // 方向A：房主(红)发起悔棋，客方(黑)拒绝
  host.localUndoReq(); await wait(5);
  guest.replyUndo(false); await wait(5);
  // -> 房主侧 onEvent 收到事件序列 = 空（无 undoDeclined/undoReply）

  // 方向B：客方(黑)发起悔棋，房主拒绝
  guest.undoReq(); await wait(5);
  host.replyUndo(false); await wait(5);
  // -> 客方侧收到 = undoReply(agree=false)
  //    控制器 game-controller.js:353 仅 if(ev.agree) toast(...) => agree=false 时静默
  ```
  求和（draw）路径完全对称：`/tmp/xq-t8-draw.mjs` D1（客方求和被拒收到 `drawReply(agree=false)` 但控制器不提示）、D2（房主求和被拒，房主侧零事件）。
- **期望 vs 实际**：
  - 期望：发起悔棋/求和的一方，在对方拒绝后应看到"对方拒绝了悔棋/和棋"提示。
  - 实际：
    1. **客方发起、房主拒绝**：房主 `replyUndo(false)` 回 `undoReply{agree:false}`（room.js:332），客方控制器 `game-controller.js:353` 只在 `ev.agree===true` 弹"对方同意悔棋"，**`agree=false` 时什么都不弹**。客方以为请求没发出去，可能反复点。
    2. **房主发起、客方拒绝**：客方回 `undoReply{agree:false}`，房主 `HostRoom.handle('undoReply')` 走 `else this.broadcast({type:'undoDeclined',...})`（room.js:126）——这是 **broadcast 给 peer（即客方），而不是 `this.emit` 给房主自己**。于是：房主（发起方）**零反馈**；反而客方（刚点了"拒绝"的决策方）收到 `undoDeclined`，控制器 `game-controller.js:354` 弹"对方拒绝了悔棋"——**决策方被错误提示为"自己被拒绝了"**。求和 `room.js:138`/`game-controller.js:363,364` 同病。
- **严重度**：中（联机交互反馈错误/缺失，不影响局面一致性，但用户会误判状态重复操作）。
- **修复建议（只建议不改源码）**：
  - `room.js:126` 与 `:138`：拒绝分支应 `this.emit('undoDeclined'/'drawDeclined', {name:peer.name})` 通知房主自身 UI，而不是 `broadcast` 给 peer（决策方不需要再被告知自己拒绝了）。
  - `game-controller.js:353`/`:363`：`undoReply`/`drawReply` 的 `agree===false` 分支也应 toast"对方拒绝了悔棋/和棋"（覆盖客方发起被房主拒绝的方向）。

---

## 二、经复现确认"未发现问题"的方面

1. **终局胜利判定链路（含 humanSide='b' 与 drawMoves 手数）——明确无问题**（`/tmp/xq-t1-victory.mjs`）：
   - 一步杀（玩家走红杀着）：`炮四平五` 后 `status=redwin/reason=checkmate`，`finish` 仅 1 次、胜利弹窗仅 1 次、`ended=true`，终局后再落子被忽略。
   - `humanSide='b'`（人机/定式里 AI 执红先行）：mount 即调度 AI，AI 一步将死玩家后 `status=redwin`，`iWin=false`（玩家判负），弹窗一次。
   - 守和定式 `type='draw'`（humanSide='b'）：`drawMoves` 按半回合计数，到 `moves.length>=drawMoves` 触发 `puzzle-draw-ok`，手数无 off-by-one；`drawMoves=80` 半回合=40 回合，与 UI 文案"守满 40 回合"一致。
   - 例胜 `type='win'` 玩家红杀黑即成功；杀局 `mate=n` 手数计数（`ceil(moves.length/2)`）经 mate=1 未杀判负、mate=2 恰好第 2 步杀成功验证，无 off-by-one。
   - 终局检测时机：玩家落子后（`_doLocal:173`）与 AI worker 回招后（`_doLocal:173`，由 `_scheduleAi/_schedulePuzzleAi` 触发）各检测一次，不漏检、不重复弹窗（`finish` 有 `this.ended` 幂等守卫）。
2. **悔棋/提示/重摆/worker 晚到包**（`/tmp/xq-t2-undo-race.mjs`）：AI 模式轮到玩家时悔棋回退 2 手、轮到 AI 时回退 1 手；AI 思考中快速悔棋，worker 晚到包被 `aiToken` 守卫丢弃、不污染新局面；`_hint` 不改局面；未在限步内杀则 `puzzle-fail`。
3. **中文记谱/打谱**（`/tmp/xq-t4-notation.mjs` + 基线 `test/notation.test.mjs` 4700 断言全过）：`playLine` 中间非法着法 `errorIndex` 准确指向非法下标、空谱/首手非法均正确；前后同名子（双车/双兵/双马）、斜行子、兵过河进退平、canon 归一均互逆。
4. **棋盘翻转/坐标映射**（`/tmp/xq-t3-board.mjs` C2）：执黑视角 `lx=W-lx, ly=H-ly` 后屏底正确映射到红方底线。
5. **存储**（`/tmp/xq-t7-final.mjs` S1）：坏 JSON 读取回落默认值、写入正常、设置默认值齐全，`localStorage` 禁用/异常均被 try/catch 兜住。
6. **联机核心状态机**（基线 `test/room.test.mjs` 27 断言全过 + `/tmp/xq-t5-room.mjs`、`xq-t6-room2.mjs`）：轮次校验（非对方轮次着法被忽略）、包干超时判负、断线 90s 判负、认输、双方同意和棋、揭棋翻开同步与暗子信息隔离、观战只读快照均正确。
   - 备注：红方一步将死时 `GuestRoom` 会因 `move` 载荷带终局状态 emit 一次 `end`、随后 `endGame` 广播再 emit 一次 `end`（room 层重复 2 次），但控制器 `finish()` 的 `this.ended` 守卫使弹窗只出现一次，**不构成可见 bug**。

---

## 三、现有测试基线结果（只读运行）

| 测试 | 结果 |
|------|------|
| `node test/notation.test.mjs` | ✅ ALL PASS — pass=4700 fail=0 |
| `node test/net.test.mjs` | ✅ ALL PASS — pass=14 fail=0 |
| `node test/room.test.mjs` | ✅ ALL PASS — pass=27 fail=0（含经典对局、揭棋、悔棋、求和/认输、超时、断线、观战、轮次拒绝） |

## 四、复现脚本路径（均在 /tmp，可重跑）

- `/tmp/xq-checkmate.mjs`、`/tmp/xq-p2.mjs`（一步杀坐标核验）
- `/tmp/xq-harness.mjs`（DOM/Worker/localStorage 桩）
- `/tmp/xq-t1-victory.mjs`（终局胜利链路：T1 玩家杀 / T2 AI 杀我 / T3 守满 / T4 例胜）
- `/tmp/xq-t2-undo-race.mjs`（悔棋手数 / worker 晚到包 / 提示 / 杀局限步）
- `/tmp/xq-t3-board.mjs`（将军高亮残留 C1 / 翻转映射 C2）
- `/tmp/xq-t4-notation.mjs`（playLine errorIndex / 同名子 / 兵过河）
- `/tmp/xq-t5-room.mjs`、`/tmp/xq-t6-room2.mjs`、`/tmp/xq-t8-draw.mjs`（联机悔棋/求和反馈、轮次、超时、断线）
- `/tmp/xq-t7-final.mjs`（storage 容错 S1 + 控制器级将军残留 S2）

## 五、附注（数据层，非本审查层，不计入 bug）

- `js/puzzles.js` 第 2 关「困宫车」FEN `4k4/9/8R/R8/9/9/9/9/9/3K5 r` 经穷举**不存在任何一步终着**（`/tmp/xq-p2.mjs`：无任何红方走子导致将死/困毙，黑将尚有 (5,0)/(4,1) 两着），与 `mate:1` 及提示"车一平四…无处可走"不符。此为残局题库数据问题（控制器会正确续走、不崩），仅提示核对 `gen-puzzles`/`puzzles.js` 该关 FEN，不属应用控制层缺陷。
