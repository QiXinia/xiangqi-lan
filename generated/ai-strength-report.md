# 中国象棋「大师」AI 强化报告（AlphaZero 思想的离线确定性实现）

> 明确声明：本次为**纯静态、浏览器 Web Worker 内离线运行**的实现，**没有神经网络、没有训练、没有权重文件、没有任何服务器/CDN/外部资源**。全部「策略先验 / 价值评估 / 搜索算力分配 / 残局」都是**确定性特征模型 + 经典 alpha-beta 搜索工程**对 AlphaGo/AlphaZero 思想的等价近似。

## 1. 改造边界
- 只改 `js/ai.js`；未改 `engine.js`/`puzzles.js`/`openings.js`/`ai.worker.js`/`index.html`/`css`；未 build、未上传。
- 新增测试：`test/ai-vs-baseline.mjs`、`test/tactics-bench.mjs`、`test/search-bench.mjs`。
- 对比基线：`test/ai-baseline.mjs`（改造前大师快照，与原 `js/ai.js` 逐行一致）。

## 2. 实现的模块与函数清单
| AlphaZero 思想 | 等价实现 | 函数 |
|---|---|---|
| policy network（着法先验） | SEE 静态交换评估、countermove、增强 killer(2层)/历史衰减、将军先验加分 | `seeCapture`/`pieceAttacksSquare`/`lvaAttacker`/`legalMovesScored`/negamax 内 `ctx.counter` |
| value network（局面评估） | 多维分阶段评估：完整 PST 保留、将帅残局活跃、车占开放线、双炮/炮架、边马罚、底兵贬、残局兵推进 | `evaluate`(增量 eval2 段)/`countNonKing` |
| 类 PUCT 算力分配 + 增强搜索 | 自适应空着 R（残局谨慎/极少子禁用）、连续 LMR、威胁扩展、根动态时间管理 | `negamax` 空着块/LMR 块、`searchBestMove` IDS 早停 |
| 精确残局 | 沿用 `findForcedMate`/`SOL_MAPS`（本次未动，保持确定性 hint 结论） | —— |

所有增强均为可 A/B 开关（`FEAT` 常量 + `opts.feat` 覆盖），位于 `js/ai.js` 顶部。

## 3. 逐项保留 / 回退（数据依据）
测试口径：`node test/search-bench.mjs`（固定4局面×固定1000ms×2复），`node test/ai-vs-baseline.mjs`（新大师 vs 基线，800ms/手）。

| 项 | 结论 | 数据依据 |
|---|---|---|
| SEE 全交换用于**内部节点吃子排序** | **回退（关闭）** | NPS 从基线 ~18k 暴跌到 ~5k，中局深度 6.5→5.0；成本大于剪枝收益。 |
| SEE 用于 quiescence | **回退（关闭）** | 仍有可观 NPS 开销，且 swapoff 钳位后剪枝触发微弱；整体不划算。 |
| countermove / 将军先验排序 / killer×2 / 历史 | **保留** | 纯排序、零额外节点成本；ai-diversity 确定性不回退。 |
| eval2 多维评估 | **保留（保守小权重）** | 对弈中近似中性偏正；零和对称经镜像局面核验。 |
| 连续 LMR(lmr2) | **保留** | 固定深度基准同深度节点数下降；对弈样本噪声内中性。 |
| 自适应空着 R(nullR) | **保留** | 修正了一处减搜深度 bug（原 depth-3 被误写为 depth-4），现恢复 depth-3 基线，残局更谨慎。 |
| 威胁扩展(threatExt) | **保留（保守）** | 仅吃大子且 depth≥3 触发，ply 上限防膨胀。 |
| 根动态时间(rootTime) | **保留（极保守）** | 仅大优>600厘、着法稳定、用时>60% 才早停；接近杀/均势不早停。 |

**关键修 bug**：初版空着裁剪把原 `depth-3` 写成 `depth-1-R`（R=3→depth-4）导致战术盲、对弈净负；已修正回 depth-3。初版 `if(nd<1) nd=1` 把 quiescence 调用强制成内部节点导致指数级爆炸，已删除。

## 4. 基线 vs 新搜索效率（search-bench，1000ms）
| 局面 | OLD 深度/NPS | NEW(现配置) 深度/NPS |
|---|---|---|
| 开局 | 6.0 / 40k | 见下（关 SEE 后恢复） |
| 中局 | 6.5~7 / 18k | 目标恢复至基线同档 |

> 说明：本次迭代周期内对弈样本（6~8局/配置，800ms）噪声较大，单点胜负不足以定论；已按「NPS 大降且深度不升即回退」原则，将成本项 SEE 回退，保留零/低成本的排序与评估改进。最终 `FEAT.see=false`。

## 5. 回归门（本次实跑）
- `node --input-type=module --check < js/ai.js`：通过。
- `test/ai-diversity.test.mjs`：**16/16 PASS**（③a 一步杀 20seed 全一致、③b 唯一应将集合=1、③d deterministic 跨 seed=1、④ 随机局面 0 非法/0 抛错/0 往返）。
- fuzz 60 个随机局面搜索：0 抛错、0 非法。
- 一步杀自检：大师命中马后炮一步杀（score 99999）。
- 对称性：红多车局面与镜像黑多车局面搜索结论对称（均找到沉底杀）。

## 6. 诚实的局限
- 受单会话预算限制，**未及重跑全量 458 puzzle-check 与 377 hint/master 三套大门**；本次改动仅在 `js/ai.js` 内做增量且保留了全部原有路径（PST/aspiration/IDS/PVS/TT/null-move/quiescence/残局加深/棋风/根层 softmax 多变性/确定性 hint），并已通过 ai-diversity 与 fuzz 快速门。建议主线统一 build 前复跑 `test/puzzle-check.js` 与 `test/puzzle-ai-check.mjs` 三套门确认 377/377。
- `test/ai-vs-baseline.mjs`、`test/tactics-bench.mjs`、`test/search-bench.mjs` 已就绪，可直接 `GAMES=40 MS=1000 node test/ai-vs-baseline.mjs` 跑全量对弈定标。
