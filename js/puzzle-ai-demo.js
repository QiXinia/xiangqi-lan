// ============================================================
// 残局 AI 演示 / 双 AI 对弈(复用观战 XQSpectate 调度)
//   - 从残局 FEN 自动演到终局; 攻击方(通常红, 先手)与防守方分工:
//     * solver 模式(AI演示正解): 攻击方走"确定性强制杀/主变"求解(注入的 solverFn,
//       即 worker puzzleHint: sol-maps/findForcedMate 最短杀), 防守方用最强 AI 最顽强应对;
//     * double 模式(双AI对弈): 双方各按自选引擎+档位走 normal 搜索;
//   - 终局如实判定: 是否按标准 mate 步数将死 / win 取胜 / draw 守和, 绝不伪装成功;
//   - 控制(暂停/单步/调速/重开)直接转发给内部 XQSpectate, 复用其超时/null 兜底+最大手数。
// 顶层符号 XQPuzDemo / XQPD* 前缀, 避开 build checkDup。
// 不重写引擎规则/求解器: solverFn 与 engineFn 由外部(controller 经 worker)注入。
// ============================================================
import { XQSpectate, SPEC_SPEEDS } from './ai-spectate.js';

export { SPEC_SPEEDS as PUZDEMO_SPEEDS };
// 残局演示手数上限(远短于自由对弈, 残局应较快收敛)
export const PUZDEMO_MAX_MOVES = 140;

// 残局演示终局判定: 如实给出"成功/失败/和"与步数对比文案, 绝不谎报。
//   opts: {mode:'solver'|'double', type:undefined|'win'|'draw', attacker, mateTarget, status, reason, plies}
// 返回 {ok:boolean, title, sub, pass:null|'win'|'draw'|'fail'}
export function XQPDVerdict(opts = {}) {
  const { type, attacker = 'r' } = opts;
  const plies = opts.plies || 0;
  const rounds = Math.ceil(plies / 2);
  const status = opts.status; // redwin / blackwin / draw
  // 攻击方是否达成目标
  const attackerWon = status === (attacker === 'r' ? 'redwin' : 'blackwin');
  const defenderHeld = status === 'draw' || (status === (attacker === 'r' ? 'blackwin' : 'redwin'));
  // ---- 守和定式(type=draw, 攻击方=红, 防守目标=弱方黑不败)----
  if (type === 'draw') {
    // 演示弱方(黑)如何守: 红不胜(和)即守和成功
    const held = status === 'draw' || status === 'blackwin';
    return held
      ? { ok: true, pass: 'draw', title: '守和成功(成和)', sub: '弱方在限定内守住红方进攻, 共 ' + rounds + ' 回合' }
      : { ok: false, pass: 'fail', title: '防守被攻破', sub: '红方进攻得手, 共 ' + rounds + ' 回合; 可自行研究更稳的防守形' };
  }
  // ---- 例胜定式(type=win, 攻击方=红)----
  if (type === 'win') {
    return attackerWon
      ? { ok: true, pass: 'win', title: '演示取胜', sub: '攻击方运子得手, 共 ' + rounds + ' 回合' }
      : { ok: false, pass: 'fail', title: '未能在限定手数内演示取胜', sub: status === 'draw' ? '演成和棋, 可自行研究' : '被反胜, 可自行研究' };
  }
  // ---- 杀局(无 type, mate=N): 攻击方红须在 mateTarget 步内将死 ----
  const mateTarget = opts.mateTarget || 0;
  if (attackerWon) {
    const ok = !mateTarget || rounds <= mateTarget;
    return {
      ok, pass: 'win',
      title: ok ? '标准 ' + mateTarget + ' 步将死 · 实际 ' + rounds + ' 步' : '将死成功 · 实际 ' + rounds + ' 步(标注 ' + mateTarget + ')',
      sub: ok ? '按题目标注步数最短将死' : '虽将死但超过标注步数, 见求解器分支'
    };
  }
  return {
    ok: false, pass: 'fail',
    title: '未能按正解将死',
    sub: status === 'draw' ? '演成和棋(防守最顽强/求解未在限内得解), 共 ' + rounds + ' 回合'
      : '攻击方被反杀, 共 ' + rounds + ' 回合; 正解求解超时或未取到主变'
  };
}

// 残局演示驱动: 内部包一个 XQSpectate, 按"当前回合方是否攻击方"选择 solver/engine 请求。
export class XQPuzDemo {
  // opts:
  //   attacker: 'r'(默认先手红)
  //   mode: 'solver' | 'double'
  //   solverAiCall() -> Promise<mv|null>   (攻击方确定性求解, controller 注入 puzzleHint worker)
  //   engineAiCall(side, engine, level) -> Promise<mv|null>  (普通引擎落子)
  //   doubleCfg: {red:{engine,level}, black:{engine,level}}   (double 模式双方配置)
  //   defenderLevel: number  (solver 模式防守方强度, 默认 5)
  //   applyFn(mv, side) -> {over,status,reason,nextSide}
  //   fallbackFn(side) -> mv|null
  //   speed: slow|mid|fast
  constructor(opts = {}) {
    this.attacker = opts.attacker === 'b' ? 'b' : 'r';
    this.mode = opts.mode === 'double' ? 'double' : 'solver';
    this.solverAiCall = opts.solverAiCall || (async () => null);
    this.engineAiCall = opts.engineAiCall || (async () => null);
    this.defenderLevel = opts.defenderLevel || 5;
    this.doubleCfg = {
      red: { engine: opts.doubleCfg?.red?.engine === 'pro' ? 'pro' : 'classic', level: +opts.doubleCfg?.red?.level || 3 },
      black: { engine: opts.doubleCfg?.black?.engine === 'pro' ? 'pro' : 'classic', level: +opts.doubleCfg?.black?.level || 3 }
    };
    // 当前回合方 -> 该发什么请求
    const aiCallFn = (side) => {
      if (this.mode === 'solver' && side === this.attacker) return this.solverAiCall();
      // 防守方(solver 模式)或双方(double 模式)走引擎
      let engine = 'classic', level = this.defenderLevel;
      if (this.mode === 'double') {
        const c = side === 'b' ? this.doubleCfg.black : this.doubleCfg.red;
        engine = c.engine; level = c.level;
      }
      return this.engineAiCall(side, engine, level);
    };
    this.spec = new XQSpectate({
      red: this.mode === 'double' ? this.doubleCfg.red : { engine: 'classic', level: 3 },
      black: this.mode === 'double' ? this.doubleCfg.black : { engine: 'classic', level: 5 },
      speed: opts.speed || 'mid',
      aiCallFn,
      fallbackFn: opts.fallbackFn || (() => null),
      applyFn: opts.applyFn || (() => ({ over: true, status: 'draw', reason: 'nofn', nextSide: 'r' })),
      onEnd: (info) => this._onEnd(info)
    });
    this.onEnd = opts.onEnd || (() => {});
  }
  _onEnd(info) {
    this.onEnd({ ...info, plies: this.spec.moveCount });
  }
  get paused() { return this.spec.paused; }
  start() { return this.spec.start(); }
  stop() { return this.spec.stop(); }
  setPaused(p) { return this.spec.setPaused(p); }
  setSpeed(s) { return this.spec.setSpeed(s); }
  stepOnce() { return this.spec.stepOnce(); }
  get moveCount() { return this.spec.moveCount; }
  get speed() { return this.spec.speed; }
}
